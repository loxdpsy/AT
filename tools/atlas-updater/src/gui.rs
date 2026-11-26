// The helper's window, drawn with egui (a native window, no browser page).
//
// Three tabs: the extension (install or update, browser guides, start at login), offline translation (the engine
// and the language packs), and connections (the browsers the user allowed, see bind.rs). Work that can take a
// while (checking releases, downloading, installing) runs on a background thread and reports back through a channel,
// so the window never freezes. Closing the window hides it; the tray icon brings it back, and Quit stops the helper.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use eframe::egui::{self, Color32, RichText, ViewportCommand};
use eframe::egui::IconData;
use eframe::icon_data;

use crate::api;
use crate::autostart;
use crate::bind::{self, BindRequest, Shared};
use crate::browsers::{self, Browser, BROWSERS};
use crate::engine::{self, Engine};
use crate::packs::{self, Catalogue, Pack};
use crate::settings::{self, Settings};
use crate::store;
use crate::tray::{self, Tray, TrayAction};

/// The Atlas logo, the same one the extension uses (icons/icon-128.png). The window shows it at the top, and the
/// window and tray icons are made from it.
const LOGO: &[u8] = include_bytes!("../../../icons/icon-128.png");
const BLUE: Color32 = Color32::from_rgb(0x1f, 0x63, 0xd6);
const RED: Color32 = Color32::from_rgb(0xb4, 0x23, 0x18);
const GREEN: Color32 = Color32::from_rgb(0x1b, 0x7f, 0x3b);
const GREY: Color32 = Color32::from_rgb(0x5f, 0x63, 0x68);
const PAPER: Color32 = Color32::from_rgb(0xf3, 0xf5, 0xf9);
const SIDEBAR: Color32 = Color32::from_rgb(0xe6, 0xeb, 0xf3);
const BORDER: Color32 = Color32::from_rgb(0xd3, 0xd9, 0xe3);

#[derive(Clone, Copy, PartialEq)]
enum Tab {
    Extension,
    Offline,
    Connections,
    Settings,
}

/// What the extension folder and the release server say. `installed` is Ok(None) for an empty or new folder.
struct Status {
    latest: Result<String, String>,
    installed: Result<Option<String>, String>,
    /// What is new in the latest release (bullets of its CHANGELOG section).
    notes: Vec<String>,
}

/// Results from background threads.
enum Event {
    Status(Status),
    Catalogue(Result<Catalogue, String>),
    Done { ok: bool, text: String, reload: bool },
}

/// What the user asked for in this frame. They run after the drawing, so the drawing never borrows the helper twice.
enum Action {
    Refresh,
    Install,
    OpenFolder,
    UseDefaultFolder,
    OpenLink(String),
    Autostart(bool),
    InstallEngine,
    InstallPack(usize),
    RemovePack(usize),
    RemoveBinding(usize),
    SetupBrowser(&'static str),
    SetupLater,
    SetExperimental(bool),
    ShowSetupAgain,
    OpenDataFolder,
    OpenPacksFolder,
    Quit,
}

pub struct Helper {
    tab: Tab,
    folder: String,
    status: Option<Status>,
    catalogue: Option<Result<Catalogue, String>>,
    catalogue_asked: bool,
    busy: Option<String>,
    message: Option<(bool, String)>,
    autostart: bool,
    tray: Option<Tray>,
    tray_error: Option<String>,
    api_error: Option<String>,
    bindings: Shared,
    bind_requests: Receiver<BindRequest>,
    /// True when the system language is written right to left: the window then mirrors its layout.
    rtl: bool,
    pending_bind: Option<BindRequest>,
    events_tx: Sender<Event>,
    events: Receiver<Event>,
    logo: egui::TextureHandle,
    quitting: bool,
    /// Browsers found on this computer, with the program that opens each one.
    detected: Vec<(&'static Browser, PathBuf)>,
    /// True while the first-run question about setting up the browsers is open.
    setup_open: bool,
    settings: Settings,
    /// Kept so the offline service's engine stays alive for the whole run (it is shared with the API thread).
    _engine: Arc<Engine>,
}

/// Starts the helper's window, its tray icon, and the offline translation service. When `show_window` is false the
/// helper starts in the tray only.
pub fn run(show_window: bool) -> Result<(), String> {
    let logo = icon_data::from_png_bytes(LOGO).map_err(|e| format!("cannot read the logo: {}", e))?;
    let window_icon = square(&logo, 256);
    let tray_rgba = square(&logo, 64).rgba;

    let engine = Arc::new(Engine::new());
    let bindings = bind::shared();
    let (bind_tx, bind_rx) = mpsc::channel::<BindRequest>();
    let api_error = api::serve(Arc::clone(&engine), Arc::clone(&bindings), bind_tx).err();

    let detected: Vec<(&'static Browser, PathBuf)> = BROWSERS
        .iter()
        .filter_map(|b| browsers::find_program(b).map(|p| (b, p)))
        .collect();
    let saved_settings = settings::load();
    let setup_open = detected.iter().any(|(b, _)| !saved_settings.answered.iter().any(|a| a == b.id));

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Atlas Helper")
            .with_app_id("atlas-translation-helper")
            .with_inner_size([780.0, 580.0])
            .with_min_inner_size([620.0, 460.0])
            .with_icon(Arc::new(window_icon))
            .with_visible(show_window),
        ..Default::default()
    };

    eframe::run_native(
        "Atlas Helper",
        options,
        Box::new(move |cc| {
            cc.egui_ctx.set_visuals(visuals());
            let texture = cc.egui_ctx.load_texture(
                "atlas-logo",
                egui::ColorImage::from_rgba_unmultiplied([logo.width as usize, logo.height as usize], &logo.rgba),
                egui::TextureOptions::LINEAR,
            );
            let (tray, tray_error) = match tray::create(tray_rgba, 64) {
                Ok(t) => (Some(t), None),
                Err(e) => (None, Some(e)),
            };
            let (events_tx, events) = mpsc::channel();
            // ATLAS_HELPER_START_TAB (extension, offline or connections) picks the tab the window opens on.
            // The screenshot workflow uses it. Normally the window opens on Extension.
            let start_tab = match std::env::var("ATLAS_HELPER_START_TAB").unwrap_or_default().as_str() {
                "offline" => Tab::Offline,
                "connections" => Tab::Connections,
                "settings" => Tab::Settings,
                _ => Tab::Extension,
            };
            let mut helper = Helper {
                tab: start_tab,
                folder: default_folder(),
                status: None,
                catalogue: None,
                catalogue_asked: false,
                busy: None,
                message: None,
                autostart: autostart::is_enabled(),
                tray,
                tray_error,
                api_error,
                bindings,
                bind_requests: bind_rx,
                pending_bind: None,
                events_tx,
                events,
                logo: texture,
                rtl: sys_locale::get_locale().map_or(false, |tag| is_rtl_language(&tag)),
                quitting: false,
                detected,
                setup_open,
                settings: saved_settings,
                _engine: engine,
            };
            helper.refresh();
            Ok(Box::new(helper) as Box<dyn eframe::App>)
        }),
    )
    .map_err(|e| format!("the helper window could not start: {}", e))
}

impl eframe::App for Helper {
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Tray clicks and menu choices.
        let mut tray_actions = Vec::new();
        if let Some(tray) = &self.tray {
            tray_actions = tray::poll(tray);
        }
        for action in tray_actions {
            match action {
                TrayAction::Show => show(ctx),
                TrayAction::Quit => self.quit(ctx),
            }
        }

        // A close button press hides the window while the tray is there. Without a tray, closing quits.
        if ctx.input(|i| i.viewport().close_requested()) && !self.quitting && self.tray.is_some() {
            ctx.send_viewport_cmd(ViewportCommand::CancelClose);
            ctx.send_viewport_cmd(ViewportCommand::Visible(false));
        }

        // A bind request from an extension: bring the window forward and ask the user.
        while let Ok(request) = self.bind_requests.try_recv() {
            if self.pending_bind.is_some() {
                // One question at a time: refuse the newer request so the extension does not wait for nothing.
                let _ = request.reply.send(None);
                continue;
            }
            self.pending_bind = Some(request);
            show(ctx);
        }

        // Background results.
        while let Ok(event) = self.events.try_recv() {
            match event {
                Event::Status(status) => self.status = Some(status),
                Event::Catalogue(result) => self.catalogue = Some(result),
                Event::Done { ok, text, reload } => {
                    self.busy = None;
                    self.message = Some((ok, text));
                    if reload {
                        self.refresh();
                    }
                }
            }
        }

        // Keep looking at the tray and the channels even while the window is hidden.
        ctx.request_repaint_after(Duration::from_millis(200));
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let mut actions: Vec<Action> = Vec::new();

        egui::Panel::top("header")
            .frame(egui::Frame::new().fill(Color32::WHITE).inner_margin(egui::Margin::same(12)))
            .show_inside(ui, |ui| {
                row(ui, self.rtl, |ui| {
                    ui.add(egui::Image::new(&self.logo).fit_to_exact_size(egui::vec2(52.0, 52.0)));
                    ui.add_space(12.0);
                    ui.vertical(|ui| {
                        ui.label(RichText::new("Atlas Helper").size(20.0).strong());
                        ui.label(RichText::new(format!("Version {}", crate::app_version())).color(GREY));
                    });
                });
            });

        let tabs_side = if self.rtl { egui::Panel::right("tabs") } else { egui::Panel::left("tabs") };
        tabs_side
            .resizable(false)
            .default_size(190.0)
            .frame(egui::Frame::new().fill(SIDEBAR).inner_margin(egui::Margin::same(10)))
            .show_inside(ui, |ui| {
                ui.add_space(4.0);
                tab_button(ui, &mut self.tab, Tab::Extension, "Extension");
                tab_button(ui, &mut self.tab, Tab::Offline, "Offline translation");
                tab_button(ui, &mut self.tab, Tab::Connections, "Connections");
                tab_button(ui, &mut self.tab, Tab::Settings, "Settings");
                ui.add_space(24.0);
                if ui.add_sized([ui.available_width(), 30.0], egui::Button::new("Quit helper")).clicked() {
                    actions.push(Action::Quit);
                }
            });

        egui::Panel::bottom("footer")
            .frame(egui::Frame::new().fill(Color32::WHITE).inner_margin(egui::Margin::same(8)))
            .show_inside(ui, |ui| {
                row(ui, self.rtl, |ui| {
                    if let Some(label) = &self.busy {
                        ui.spinner();
                        ui.label(label.as_str());
                    } else if let Some((ok, text)) = &self.message {
                        let color = if *ok { GREEN } else { RED };
                        ui.label(RichText::new(text.as_str()).color(color));
                    } else {
                        ui.label(RichText::new("Ready.").color(GREY));
                    }
                });
            });

        let idle = self.busy.is_none();
        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(PAPER).inner_margin(egui::Margin::same(18)))
            .show_inside(ui, |ui| {
                let align = if self.rtl { egui::Align::Max } else { egui::Align::Min };
                egui::ScrollArea::vertical().show(ui, |ui| {
                    ui.with_layout(egui::Layout::top_down(align), |ui| {
                        // One readable column: the text wraps inside it and never runs under the scroll bar.
                        let width = ui.available_width().min(640.0);
                        ui.set_max_width(width);
                        match self.tab {
                            Tab::Extension => self.extension_tab(ui, idle, &mut actions),
                            Tab::Offline => self.offline_tab(ui, idle, &mut actions),
                            Tab::Connections => self.connections_tab(ui, &mut actions),
                            Tab::Settings => self.settings_tab(ui, &mut actions),
                        }
                    });
                });
            });

        self.bind_dialog(ui.ctx());
        self.setup_dialog(ui.ctx(), &mut actions);

        for action in actions {
            self.perform(action, ui.ctx());
        }
    }
}

impl Helper {
    fn extension_tab(&mut self, ui: &mut egui::Ui, idle: bool, actions: &mut Vec<Action>) {
        ui.heading("Atlas Translation extension");
        ui.label(RichText::new("Install or update the extension here. Firefox users get updates from the Add-ons store, so they only need the link below.").color(GREY));
        ui.add_space(12.0);

        card(ui, |ui| {
            ui.label(RichText::new("Folder with the unpacked copy of the extension (Chromium browsers)").strong());
            row(ui, self.rtl, |ui| {
                ui.add(egui::TextEdit::singleline(&mut self.folder).desired_width(360.0));
                if ui.button("Default").clicked() {
                    actions.push(Action::UseDefaultFolder);
                }
            });
            ui.add_space(10.0);

            match &self.status {
                None => {
                    ui.label(RichText::new("Checking the latest release...").color(GREY));
                }
                Some(status) => {
                    match &status.latest {
                        Ok(v) => ui.label(format!("Latest release: {}", v)),
                        Err(e) => ui.label(RichText::new(format!("Latest release: unknown ({})", e)).color(RED)),
                    };
                    match &status.installed {
                        Ok(None) => ui.label("Installed in this folder: nothing yet"),
                        Ok(Some(v)) => ui.label(format!("Installed in this folder: {}", v)),
                        Err(e) => ui.label(RichText::new(format!("This folder: {}", e)).color(RED)),
                    };
                    if let (Ok(latest), Ok(installed)) = (&status.latest, &status.installed) {
                        let newer = matches!(installed, Some(v) if crate::is_newer(latest, v));
                        let text = match installed {
                            None => "Ready to install.".to_string(),
                            Some(_) if newer => format!("Please update: version {} is available.", latest),
                            Some(_) => "You have the latest version.".to_string(),
                        };
                        ui.label(RichText::new(text).color(if newer { RED } else { BLUE }));
                        if newer && !status.notes.is_empty() {
                            ui.label(RichText::new(format!("What is new in {}:", latest)).strong());
                            for note in &status.notes {
                                ui.label(format!("•  {}", note));
                            }
                        }
                    }
                }
            }
            ui.add_space(10.0);

            row(ui, self.rtl, |ui| {
                if ui.add_enabled(idle, egui::Button::new("Check again")).clicked() {
                    actions.push(Action::Refresh);
                }
                if ui.add_enabled(idle && !self.folder.trim().is_empty(), egui::Button::new("Install or update")).clicked() {
                    actions.push(Action::Install);
                }
                if ui.button("Open folder").clicked() {
                    actions.push(Action::OpenFolder);
                }
            });
        });

        ui.add_space(12.0);
        card(ui, |ui| {
            let mut on = self.autostart;
            if ui.checkbox(&mut on, "Start the helper when I sign in").changed() {
                actions.push(Action::Autostart(on));
            }
        });

        ui.add_space(16.0);
        ui.heading("Browsers");
        ui.add_space(4.0);
        for browser in BROWSERS {
            let guide = browsers::guide(browser, &self.folder);
            let found = self.detected.iter().any(|(b, _)| b.id == browser.id);
            let title = if found { format!("{}  (found on this computer)", browser.name) } else { browser.name.to_string() };
            ui.collapsing(title, |ui| {
                for (i, step) in guide.steps.iter().enumerate() {
                    ui.label(format!("{}. {}", i + 1, step));
                }
                if guide.needs_folder {
                    ui.label(RichText::new("Choose the folder above first.").color(GREY));
                }
                if let Some(link) = &guide.link {
                    if ui.button(format!("Open the page for {}", guide.name)).clicked() {
                        actions.push(Action::OpenLink(link.clone()));
                    }
                }
            });
        }

        if let Some(error) = &self.tray_error {
            ui.add_space(16.0);
            ui.label(RichText::new(format!("No tray icon: {}. Keep this window open, or start the helper again.", error)).color(RED));
        }
    }

    fn offline_tab(&mut self, ui: &mut egui::Ui, idle: bool, actions: &mut Vec<Action>) {
        ui.heading("Offline translation");
        ui.label(RichText::new("Translation that runs on this computer. Each language pair is a pack that you install here.").color(GREY));
        ui.add_space(12.0);

        card(ui, |ui| {
            if let Some(error) = &self.api_error {
                ui.label(RichText::new(format!("The offline service is not running: {}", error)).color(RED));
            } else {
                ui.label(RichText::new("The offline service runs on this computer (127.0.0.1:47632).").color(GREEN));
            }
            ui.add_space(6.0);

            let engine_path = engine::find_binary();
            match &engine_path {
                Some(path) => ui.label(format!("Engine: installed ({})", path.display())),
                None => ui.label(RichText::new("Engine: not installed").color(RED)),
            };
            if engine_path.is_none() && ui.add_enabled(idle, egui::Button::new("Install the engine")).clicked() {
                actions.push(Action::InstallEngine);
            }
            ui.add_space(6.0);
            ui.label(RichText::new(format!("Data folder: {}", store::data_dir().display())).color(GREY));
        });

        ui.add_space(14.0);
        ui.heading("Language packs");
        if !self.catalogue_asked {
            self.catalogue_asked = true;
            self.load_catalogue();
        }
        let mut retry = false;
        match &self.catalogue {
            None => {
                ui.label(RichText::new("Loading the list of packs...").color(GREY));
            }
            Some(Err(e)) => {
                ui.label(RichText::new(format!("The packs could not be listed: {}", e)).color(RED));
                if ui.add_enabled(idle, egui::Button::new("Try again")).clicked() {
                    retry = true;
                }
            }
            Some(Ok(catalogue)) => {
                ui.label(RichText::new(format!("Each pack is about 37 MB. {} packs are available.", catalogue.packs.len())).color(GREY));
                ui.add_space(6.0);
                let root = store::packs_dir();
                let installed_packs: Vec<&Pack> = catalogue.packs.iter().filter(|p| packs::is_installed_in(&root, p)).collect();
                let installed_mb = installed_packs.iter().map(|p| p.bytes as f64).sum::<f64>() / 1_000_000.0;
                card(ui, |ui| {
                    ui.label(RichText::new(format!("Installed now: {} pack(s), about {:.0} MB", installed_packs.len(), installed_mb)).strong());
                    ui.label(RichText::new(format!("Folder: {}", root.display())).color(GREY));
                    if ui.button("Open the packs folder").clicked() {
                        actions.push(Action::OpenPacksFolder);
                    }
                });
                ui.add_space(8.0);
                card(ui, |ui| {
                    egui::Grid::new("language_packs")
                        .num_columns(3)
                        .striped(true)
                        .spacing([18.0, 8.0])
                        .show(ui, |ui| {
                            for (index, pack) in catalogue.packs.iter().enumerate() {
                                let installed = packs::is_installed_in(&root, pack);
                                ui.label(RichText::new(format!("{} to {}", pack.from, pack.to)).strong());
                                ui.label(RichText::new(size_text(pack)).color(GREY));
                                ui.horizontal(|ui| {
                                    if installed {
                                        ui.label(RichText::new("installed").color(GREEN));
                                        if ui.add_enabled(idle, egui::Button::new("Remove")).clicked() {
                                            actions.push(Action::RemovePack(index));
                                        }
                                    } else if ui.add_enabled(idle, egui::Button::new("Install")).clicked() {
                                        actions.push(Action::InstallPack(index));
                                    }
                                });
                                ui.end_row();
                            }
                        });
                });
            }
        }
        if retry {
            self.catalogue_asked = false;
            self.catalogue = None;
        }
    }

    fn connections_tab(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        ui.heading("Connections");
        ui.label(RichText::new("Browsers that the helper allowed to use the offline service. Remove one to stop it.").color(GREY));
        ui.add_space(12.0);
        let items = match self.bindings.lock() {
            Ok(b) => b.items.clone(),
            Err(p) => p.into_inner().items.clone(),
        };
        card(ui, |ui| {
            if items.is_empty() {
                ui.label(RichText::new("No browser is connected yet. Open the Atlas Translation settings in the browser and choose Bind.").color(GREY));
            }
            for (index, binding) in items.iter().enumerate() {
                row(ui, self.rtl, |ui| {
                    ui.label(RichText::new(&binding.name).strong());
                    if ui.button("Remove").clicked() {
                        actions.push(Action::RemoveBinding(index));
                    }
                });
            }
        });
    }

    /// The question shown when an extension asks to bind. Allow gives it a token; Deny (or closing) refuses it.
    fn bind_dialog(&mut self, ctx: &egui::Context) {
        let (name, origin) = match &self.pending_bind {
            Some(request) => (request.name.clone(), request.origin.clone()),
            None => return,
        };
        let mut answer: Option<bool> = None;
        egui::Window::new("Bind a browser")
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
            .show(ctx, |ui| {
                ui.label(RichText::new(format!("\"{}\" wants to use the offline translation.", name)).size(16.0).strong());
                ui.label("Allow it only if you use Atlas Translation in that browser. You can remove it later under Connections.");
                ui.add_space(6.0);
                ui.label(RichText::new(format!("Requested from: {}", origin)).color(GREY).small());
                ui.add_space(10.0);
                row(ui, self.rtl, |ui| {
                    if ui.button("Allow").clicked() {
                        answer = Some(true);
                    }
                    if ui.button("Deny").clicked() {
                        answer = Some(false);
                    }
                });
            });
        if let Some(allow) = answer {
            if let Some(request) = self.pending_bind.take() {
                let token = if allow {
                    match self.bindings.lock() {
                        Ok(mut b) => b.add(&request.name).ok(),
                        Err(p) => p.into_inner().add(&request.name).ok(),
                    }
                } else {
                    None
                };
                let granted = token.is_some();
                let _ = request.reply.send(token);
                self.message = Some(if granted {
                    (true, format!("{} is now bound to the offline service.", request.name))
                } else {
                    (false, format!("{} was not bound.", request.name))
                });
            }
        }
    }

    /// The first-run question: browsers found on this computer that Atlas Translation is not set up in yet.
    fn setup_dialog(&mut self, ctx: &egui::Context, actions: &mut Vec<Action>) {
        if !self.setup_open {
            return;
        }
        let pending: Vec<&'static Browser> = self
            .detected
            .iter()
            .map(|(b, _)| *b)
            .filter(|b| !self.settings.answered.iter().any(|a| a == b.id))
            .collect();
        if pending.is_empty() {
            self.setup_open = false;
            return;
        }
        let rtl = self.rtl;
        egui::Window::new("Set up Atlas Translation")
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
            .show(ctx, |ui| {
                let heading = if pending.len() == 1 {
                    "Atlas found a browser on this computer."
                } else {
                    "Atlas found these browsers on this computer."
                };
                ui.label(RichText::new(heading).size(16.0).strong());
                ui.label("Set Atlas Translation up in them too? Firefox opens its add-on page. Chromium browsers open their extensions page, and you choose Load unpacked once.");
                ui.add_space(8.0);
                for browser in &pending {
                    row(ui, rtl, |ui| {
                        ui.label(RichText::new(browser.name).strong());
                        if ui.button("Set up here").clicked() {
                            actions.push(Action::SetupBrowser(browser.id));
                        }
                    });
                }
                ui.add_space(8.0);
                if ui.button("Not now").clicked() {
                    actions.push(Action::SetupLater);
                }
            });
    }

    /// Sets one browser up. Firefox opens its add-on page. A Chromium browser gets the unpacked copy in the folder
    /// (when the folder is still empty) and opens its extensions page, where the user chooses Load unpacked.
    fn setup_browser(&mut self, id: &'static str) {
        let Some((browser, program)) = self.detected.iter().find(|(b, _)| b.id == id).cloned() else {
            return;
        };
        self.remember_answer(id);
        match browser.kind {
            browsers::Kind::Firefox => {
                let text = if open_target(browsers::FIREFOX_STORE_URL) {
                    (true, "Firefox opened the Atlas Translation add-on page. Click Add to Firefox there.".to_string())
                } else {
                    (false, "The Firefox add-on page could not be opened.".to_string())
                };
                self.message = Some(text);
            }
            browsers::Kind::Chromium => {
                let folder = self.folder.trim().to_string();
                let needs_copy = matches!(self.status.as_ref().map(|s| &s.installed), Some(Ok(None)) | None);
                if needs_copy && !folder.is_empty() {
                    self.start("Installing the extension into the folder...", move || match install_into_folder(&folder) {
                        Ok(text) => Event::Done { ok: true, text, reload: true },
                        Err(text) => Event::Done { ok: false, text, reload: false },
                    });
                }
                let text = if browsers::open_in_browser(&program, browser.extensions_url) {
                    (true, format!("Opened {}. Turn on Developer mode, choose Load unpacked, and pick {}.", browser.name, self.folder.trim()))
                } else {
                    (false, format!("{} could not be opened. Open its extensions page by hand.", browser.name))
                };
                self.message = Some(text);
            }
        }
    }

    /// Records that the user answered the setup question for a browser, and saves that.
    fn remember_answer(&mut self, id: &str) {
        if !self.settings.answered.iter().any(|a| a == id) {
            self.settings.answered.push(id.to_string());
        }
        self.setup_open = self.detected.iter().any(|(b, _)| !self.settings.answered.iter().any(|a| a == b.id));
        self.save_settings();
    }

    fn save_settings(&mut self) {
        if let Err(e) = settings::save(&self.settings) {
            self.message = Some((false, e));
        }
    }

    fn settings_tab(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        ui.heading("Settings");
        ui.label(RichText::new("How the helper behaves. Experimental options may change or break.").color(GREY));
        ui.add_space(12.0);

        let mut experimental = self.settings.experimental;
        card(ui, |ui| {
            ui.label(RichText::new("Experimental").strong());
            if ui.checkbox(&mut experimental, "Show experimental options and developer tools").changed() {
                actions.push(Action::SetExperimental(experimental));
            }
            ui.label(RichText::new("Off by default. Nothing here is needed to translate.").color(GREY));
        });

        if self.settings.experimental {
            ui.add_space(12.0);
            card(ui, |ui| {
                ui.label(RichText::new("Developer").strong());
                ui.label(format!("Data folder: {}", store::data_dir().display()));
                ui.label(format!("Packs folder: {}", store::packs_dir().display()));
                ui.label(format!("Offline service address: 127.0.0.1:{}", api::PORT));
                ui.label(format!("Helper version: {}", crate::app_version()));
                row(ui, self.rtl, |ui| {
                    if ui.button("Open the data folder").clicked() {
                        actions.push(Action::OpenDataFolder);
                    }
                    if ui.button("Show the browser setup again").clicked() {
                        actions.push(Action::ShowSetupAgain);
                    }
                });
            });
        }
    }

    fn perform(&mut self, action: Action, ctx: &egui::Context) {
        match action {
            Action::Refresh => self.refresh(),
            Action::UseDefaultFolder => self.folder = default_folder(),
            Action::OpenFolder => {
                let folder = self.folder.trim().to_string();
                match self.status.as_ref().map(|s| &s.installed) {
                    Some(Ok(Some(_))) => {
                        if !open_target(&folder) {
                            self.message = Some((false, "The folder could not be opened.".into()));
                        }
                    }
                    _ => self.message = Some((false, "Install the extension in this folder first.".into())),
                }
            }
            Action::OpenLink(url) => {
                if !open_target(&url) {
                    self.message = Some((false, "The page could not be opened in a browser.".into()));
                }
            }
            Action::Install => {
                let folder = self.folder.trim().to_string();
                self.start("Installing the extension...", move || match install_into_folder(&folder) {
                    Ok(text) => Event::Done { ok: true, text, reload: true },
                    Err(text) => Event::Done { ok: false, text, reload: false },
                });
            }
            Action::Autostart(on) => {
                self.autostart = on;
                let event = match autostart::set_enabled(on) {
                    Ok(()) => Event::Done {
                        ok: true,
                        text: if on { "The helper starts when you sign in.".into() } else { "The helper no longer starts at sign-in.".into() },
                        reload: false,
                    },
                    Err(e) => Event::Done { ok: false, text: e, reload: false },
                };
                let _ = self.events_tx.send(event);
            }
            Action::InstallEngine => {
                self.start("Installing the offline engine...", move || match engine::install_from_latest_release() {
                    Ok(v) => Event::Done { ok: true, text: format!("Installed the offline engine {}.", v), reload: false },
                    Err(e) => Event::Done { ok: false, text: e, reload: false },
                });
            }
            Action::InstallPack(index) => {
                let picked = match &self.catalogue {
                    Some(Ok(c)) => c.packs.get(index).cloned().map(|p| (p, c.commit.clone())),
                    _ => None,
                };
                if let Some((pack, commit)) = picked {
                    let label = format!("Installing the {} to {} pack...", pack.from, pack.to);
                    self.start(&label, move || pack_result(packs::install_into(&store::packs_dir(), &pack, &commit), &pack, "installed"));
                }
            }
            Action::RemovePack(index) => {
                let picked = match &self.catalogue {
                    Some(Ok(c)) => c.packs.get(index).cloned().map(|p| (p, c.clone())),
                    _ => None,
                };
                if let Some((pack, catalogue)) = picked {
                    let label = format!("Removing the {} to {} pack...", pack.from, pack.to);
                    self.start(&label, move || {
                        let result = packs::remove_from(&store::packs_dir(), &catalogue, &pack.pair);
                        pack_result(result, &pack, "removed")
                    });
                }
            }
            Action::RemoveBinding(index) => {
                let result = match self.bindings.lock() {
                    Ok(mut b) => b.remove(index),
                    Err(p) => p.into_inner().remove(index),
                };
                self.message = Some(match result {
                    Ok(()) => (true, "The browser was removed.".into()),
                    Err(e) => (false, e),
                });
            }
            Action::SetupBrowser(id) => self.setup_browser(id),
            Action::SetupLater => {
                let ids: Vec<&'static str> = self.detected.iter().map(|(b, _)| b.id).collect();
                for id in ids {
                    if !self.settings.answered.iter().any(|a| a == id) {
                        self.settings.answered.push(id.to_string());
                    }
                }
                self.setup_open = false;
                self.save_settings();
            }
            Action::SetExperimental(on) => {
                self.settings.experimental = on;
                self.save_settings();
            }
            Action::ShowSetupAgain => {
                self.settings.answered.clear();
                self.setup_open = !self.detected.is_empty();
                self.save_settings();
                self.message = Some((true, "The browser setup question will show again.".into()));
            }
            Action::OpenDataFolder => {
                let dir = store::data_dir().display().to_string();
                if !open_target(&dir) {
                    self.message = Some((false, "The data folder could not be opened.".into()));
                }
            }
            Action::OpenPacksFolder => {
                let dir = store::packs_dir().display().to_string();
                if !open_target(&dir) {
                    self.message = Some((false, "The packs folder could not be opened.".into()));
                }
            }
            Action::Quit => self.quit(ctx),
        }
    }

    /// Starts a background job. The window shows `label` until the job reports back.
    fn start<F>(&mut self, label: &str, job: F)
    where
        F: FnOnce() -> Event + Send + 'static,
    {
        self.busy = Some(label.to_string());
        self.message = None;
        let tx = self.events_tx.clone();
        thread::spawn(move || {
            let _ = tx.send(job());
        });
    }

    /// Asks for the status of the extension folder and the latest release.
    fn refresh(&mut self) {
        let folder = self.folder.trim().to_string();
        let tx = self.events_tx.clone();
        thread::spawn(move || {
            let _ = tx.send(Event::Status(load_status(&folder)));
        });
    }

    fn load_catalogue(&mut self) {
        let tx = self.events_tx.clone();
        thread::spawn(move || {
            let _ = tx.send(Event::Catalogue(packs::catalogue()));
        });
    }

    fn quit(&mut self, ctx: &egui::Context) {
        self.quitting = true;
        ctx.send_viewport_cmd(ViewportCommand::Close);
    }
}

/// True for the languages written right to left (the same list the extension uses for its own pages).
fn is_rtl_language(tag: &str) -> bool {
    let language = tag.split(|c| c == '-' || c == '_').next().unwrap_or("").to_ascii_lowercase();
    matches!(language.as_str(), "ar" | "he" | "iw" | "fa" | "prs" | "ps" | "sd" | "ug" | "ur" | "yi" | "dv" | "ckb")
}

/// A row of widgets: left to right, or right to left when the window is mirrored.
fn row<R>(ui: &mut egui::Ui, rtl: bool, add: impl FnOnce(&mut egui::Ui) -> R) -> R {
    if rtl {
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), add).inner
    } else {
        ui.horizontal(add).inner
    }
}

/// Shows the window and brings it to the front (from the tray or for a bind request).
fn show(ctx: &egui::Context) {
    ctx.send_viewport_cmd(ViewportCommand::Visible(true));
    ctx.send_viewport_cmd(ViewportCommand::Minimized(false));
    ctx.send_viewport_cmd(ViewportCommand::Focus);
}

/// Reads the folder's version and the latest release. Runs on a background thread.
fn load_status(folder: &str) -> Status {
    let (latest, notes) = match crate::fetch_latest_release() {
        Ok(release) => (Ok(release.version), release.notes),
        Err(e) => (Err(e), Vec::new()),
    };
    let installed = if folder.is_empty() || is_fresh_folder(Path::new(folder)) {
        Ok(None)
    } else {
        crate::read_installed_version(Path::new(folder)).map(Some)
    };
    Status { latest, installed, notes }
}

/// Installs or updates the extension in `folder`. Refuses a folder that is not an Atlas Translation copy.
fn install_into_folder(folder: &str) -> Result<String, String> {
    if folder.is_empty() {
        return Err("Choose a folder first.".into());
    }
    let path = PathBuf::from(folder);
    let fresh = is_fresh_folder(&path);
    let installed = if fresh { None } else { Some(crate::read_installed_version(&path)?) };
    let release = crate::fetch_latest_release()?;
    if let Some(v) = &installed {
        if !crate::is_newer(&release.version, v) {
            return Ok(format!("You already have the latest version ({}).", v));
        }
    }
    if fresh {
        std::fs::create_dir_all(&path).map_err(|e| format!("cannot create the folder: {}", e))?;
    }
    crate::install(&path, &release)?;
    Ok(format!("Installed version {} in {}. Reload Atlas Translation in your browser.", release.version, folder))
}

fn pack_result(result: Result<(), String>, pack: &Pack, verb: &str) -> Event {
    match result {
        Ok(()) => Event::Done { ok: true, text: format!("The {} to {} pack was {}.", pack.from, pack.to, verb), reload: false },
        Err(e) => Event::Done { ok: false, text: e, reload: false },
    }
}

fn size_text(pack: &Pack) -> String {
    format!("{:.0} MB", pack.bytes as f64 / 1_000_000.0)
}

/// True when the folder is missing or empty, so a fresh copy can be unpacked into it.
fn is_fresh_folder(path: &Path) -> bool {
    match std::fs::read_dir(path) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => !path.exists(),
    }
}

/// Documents/Atlas Translation in the user's home folder. The window suggests it, and the user can change it.
fn default_folder() -> String {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("Documents").join("Atlas Translation").display().to_string()
}

/// Opens a folder or a web page with the system's default program.
fn open_target(target: &str) -> bool {
    let program = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    let mut command = Command::new(program);
    command.arg(target).stdin(std::process::Stdio::null());
    autostart::quiet(command).spawn().is_ok()
}

/// The Atlas colours on top of the light theme: a soft background, white cards, rounded corners.
fn visuals() -> egui::Visuals {
    let mut visuals = egui::Visuals::light();
    visuals.hyperlink_color = BLUE;
    visuals.selection.bg_fill = BLUE;
    // The text of a selected tab sits on the blue fill, so it is white.
    visuals.selection.stroke = egui::Stroke::new(1.0, Color32::WHITE);
    visuals.panel_fill = PAPER;
    visuals.window_fill = Color32::WHITE;
    for widget in [&mut visuals.widgets.inactive, &mut visuals.widgets.hovered, &mut visuals.widgets.active] {
        widget.corner_radius = egui::CornerRadius::same(8);
    }
    visuals
}

/// A white card with a thin border, around a group of related controls.
fn card<R>(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui) -> R) -> R {
    egui::Frame::new()
        .fill(Color32::WHITE)
        .stroke(egui::Stroke::new(1.0, BORDER))
        .corner_radius(egui::CornerRadius::same(10))
        .inner_margin(egui::Margin::same(14))
        .show(ui, add)
        .inner
}

/// A tab in the sidebar: a full-width button that shows whether it is the open tab.
fn tab_button(ui: &mut egui::Ui, current: &mut Tab, tab: Tab, label: &str) {
    let selected = *current == tab;
    if ui.add_sized([ui.available_width(), 34.0], egui::Button::selectable(selected, label)).clicked() {
        *current = tab;
    }
}

/// Makes a square icon from `icon` (the logo is wide): the logo is centred on a transparent square of `size` pixels.
fn square(icon: &IconData, size: u32) -> IconData {
    let (w, h) = (icon.width as f32, icon.height as f32);
    let s = size as f32;
    let scale = (s / w).min(s / h);
    let (ox, oy) = ((s - w * scale) / 2.0, (s - h * scale) / 2.0);
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let sx = ((x as f32 + 0.5 - ox) / scale).floor() as i64;
            let sy = ((y as f32 + 0.5 - oy) / scale).floor() as i64;
            if sx < 0 || sy < 0 || sx >= icon.width as i64 || sy >= icon.height as i64 {
                continue;
            }
            let src = ((sy as u32 * icon.width + sx as u32) * 4) as usize;
            let dst = ((y * size + x) * 4) as usize;
            rgba[dst..dst + 4].copy_from_slice(&icon.rgba[src..src + 4]);
        }
    }
    IconData { rgba, width: size, height: size }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn right_to_left_languages_mirror_the_window() {
        for tag in ["ar", "ar-EG", "he-IL", "iw", "fa_IR", "ur", "ckb", "ps"] {
            assert!(is_rtl_language(tag), "{} should mirror", tag);
        }
        for tag in ["en-US", "fr", "ja-JP", "zh_CN", "", "a"] {
            assert!(!is_rtl_language(tag), "{} should not mirror", tag);
        }
    }
}

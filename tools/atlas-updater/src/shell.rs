// The helper's own window and its tray icon (Phase 2). The window shows the helper's page, which this process serves on
// 127.0.0.1 with a token (see web.rs), in a native webview: WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS.
// It is not a browser tab. The tray icon keeps the helper running. Closing the window hides it; "Quit" in the tray menu
// stops the helper. Nothing here runs in tests: the window and the tray need a desktop session.

use tao::dpi::LogicalSize;
use tao::event::{Event, StartCause, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::{Window, WindowBuilder};
use tray_icon::menu::{Menu, MenuEvent, MenuItem};
use tray_icon::{Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

/// The tray icon's colour: the blue of the Atlas Translation website (--board in web/app.css).
const TRAY_BLUE: [u8; 4] = [0x1f, 0x63, 0xd6, 0xff];
const TRAY_SIZE: u32 = 32;

enum UserEvent {
    Tray(TrayIconEvent),
    Menu(MenuEvent),
}

/// Opens the helper window at `url` and shows the tray icon. Blocks until "Quit" is chosen. `show_window` false starts
/// the helper in the tray only (used at log-in), so no window appears until the tray icon is clicked.
pub fn run(url: String, show_window: bool) -> Result<(), String> {
    hide_console();

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();

    // Tray and menu events arrive on their own threads. Forward them to the event loop, so it wakes up for each one.
    let proxy = event_loop.create_proxy();
    TrayIconEvent::set_event_handler(Some(move |event| {
        let _ = proxy.send_event(UserEvent::Tray(event));
    }));
    let proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(std::sync::Arc::new(move |event| {
        let _ = proxy.send_event(UserEvent::Menu(event));
    })));

    let open_item = MenuItem::new("Open Atlas Translation helper", true, None);
    let quit_item = MenuItem::new("Quit", true, None);
    let open_id = open_item.id().clone();
    let quit_id = quit_item.id().clone();
    let menu = Menu::new();
    let _ = menu.append_items(&[&open_item, &quit_item]);

    let window = WindowBuilder::new()
        .with_title("Atlas Translation helper")
        .with_inner_size(LogicalSize::new(960.0, 760.0))
        .with_min_inner_size(LogicalSize::new(560.0, 480.0))
        .with_visible(show_window)
        .build(&event_loop)
        .map_err(|e| format!("cannot open the helper window: {}", e))?;

    let builder = wry::WebViewBuilder::new().with_url(url);
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        let vbox = window
            .default_vbox()
            .ok_or("cannot open the helper window: no GTK container")?;
        builder
            .build_gtk(vbox)
            .map_err(|e| format!("cannot open the helper window: {}", e))?
    };
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    let webview = builder
        .build(&window)
        .map_err(|e| format!("cannot open the helper window: {}", e))?;

    // The tray icon and the webview are kept in options, so they can be dropped on Quit.
    let mut tray: Option<TrayIcon> = None;
    let mut webview = Some(webview);

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => {
                // The icon is made once the loop runs. Making it earlier can fail on some desktops.
                match tray_icon_image().and_then(|icon| {
                    TrayIconBuilder::new()
                        .with_menu(Box::new(menu.clone()))
                        .with_tooltip("Atlas Translation helper")
                        .with_icon(icon)
                        .build()
                        .map_err(|e| e.to_string())
                }) {
                    Ok(icon) => tray = Some(icon),
                    Err(e) => eprintln!("The tray icon could not be shown: {}", e),
                }
            }
            Event::UserEvent(UserEvent::Tray(TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            })) => show(&window),
            Event::UserEvent(UserEvent::Menu(menu_event)) => {
                if menu_event.id == open_id {
                    show(&window);
                } else if menu_event.id == quit_id {
                    tray.take();
                    webview.take();
                    *control_flow = ControlFlow::Exit;
                }
            }
            // Closing the window keeps the helper running in the tray.
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => window.set_visible(false),
            _ => {}
        }
    })
}

fn show(window: &Window) {
    window.set_visible(true);
    window.set_minimized(false);
    window.set_focus();
}

/// A plain round tray icon in the website's blue. The tray needs only a small image.
fn tray_icon_image() -> Result<Icon, String> {
    let mut rgba = Vec::with_capacity((TRAY_SIZE * TRAY_SIZE * 4) as usize);
    let centre = (TRAY_SIZE as f32 - 1.0) / 2.0;
    let radius = centre - 0.5;
    for y in 0..TRAY_SIZE {
        for x in 0..TRAY_SIZE {
            let dx = x as f32 - centre;
            let dy = y as f32 - centre;
            if dx * dx + dy * dy <= radius * radius {
                rgba.extend_from_slice(&TRAY_BLUE);
            } else {
                rgba.extend_from_slice(&[0, 0, 0, 0]);
            }
        }
    }
    Icon::from_rgba(rgba, TRAY_SIZE, TRAY_SIZE).map_err(|e| e.to_string())
}

/// On Windows, a double click or the log-in entry (Run key) gives the helper a console of its own, which is not needed.
/// A console that only this process uses is closed. A console shared with a terminal is left alone.
#[cfg(windows)]
fn hide_console() {
    extern "system" {
        fn GetConsoleProcessList(list: *mut u32, count: u32) -> u32;
        fn FreeConsole() -> i32;
    }
    let mut pids = [0u32; 2];
    // SAFETY: the buffer holds two u32 and the count passed is two. The function only reads the console's process list.
    let attached = unsafe { GetConsoleProcessList(pids.as_mut_ptr(), 2) };
    if attached == 1 {
        // SAFETY: FreeConsole takes no arguments and only detaches this process from its own console.
        unsafe {
            FreeConsole();
        }
    }
}

#[cfg(not(windows))]
fn hide_console() {}

/// True when the desktop can show a window. Linux without a display (for example over SSH) cannot.
pub fn has_display() -> bool {
    if cfg!(target_os = "linux") {
        std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some()
    } else {
        true
    }
}

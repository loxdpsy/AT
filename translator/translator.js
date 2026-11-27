"use strict";
// The translator page: type text, see the translation (like Google Translate), keep a History and Saved items.
// Text goes through the same "translateText" message as the rest of the extension, with the text service chosen in
// Settings. The PDF tab opens the document translation page for an address. Everything is kept on this computer.
(function () {
  const $ = id => document.getElementById(id);
  const LIMIT = 5000;
  const HISTORY_MAX = 100;
  const HISTORY_KEY = "translatorHistory";
  const LANG_KEY = "translatorLanguages";

  let history = [];
  let shown = null; // { text, translation, source, target } for the text on screen
  let latest = 0; // the id of the newest request. Older answers are ignored.
  let timer = null;

  function t(key, fallback) {
    return twpI18n.getMessage(key) || fallback;
  }

  function status(message, isError) {
    const el = $("status");
    el.textContent = message || "";
    el.classList.toggle("error", Boolean(isError));
  }

  function langName(code) {
    if (code === "auto") return t("lblDetectLanguage", "Detect language");
    return twpLang.codeToLanguage(code) || code;
  }

  function fillLanguages(select, withDetect) {
    select.replaceChildren();
    if (withDetect) select.append(new Option(t("lblDetectLanguage", "Detect language"), "auto"));
    const codes = twpLang.TargetLanguages.slice().sort((a, b) => langName(a).localeCompare(langName(b)));
    for (const code of codes) select.append(new Option(langName(code), code));
  }

  function setLanguages(source, target) {
    const hasOption = (select, code) => Array.from(select.options).some(o => o.value === code);
    $("sourceLang").value = hasOption($("sourceLang"), source) ? source : "auto";
    $("targetLang").value = hasOption($("targetLang"), target) ? target : "en";
  }

  function persist() {
    chrome.storage.local.set({ [HISTORY_KEY]: history });
  }

  function record(entry) {
    history = TwpHistory.add(history, entry, HISTORY_MAX);
    persist();
  }

  function currentEntry() {
    if (!shown) return null;
    return history.find(e => e.text === shown.text && e.source === shown.source && e.target === shown.target) || null;
  }

  function updateButtons() {
    const save = $("btnSave");
    const entry = currentEntry();
    save.disabled = !shown;
    $("btnCopy").disabled = !shown;
    save.setAttribute("aria-pressed", String(Boolean(entry && entry.saved)));
    save.textContent = entry && entry.saved ? t("btnSaved", "Saved") : t("btnSave", "Save");
  }

  function renderList(list, items, emptyNote) {
    list.replaceChildren();
    emptyNote.hidden = items.length > 0;
    for (const entry of items) {
      const row = document.createElement("li");
      row.className = "item";

      const open = document.createElement("button");
      open.type = "button";
      open.className = "itemText";
      const source = document.createElement("span");
      source.className = "itemSource";
      source.textContent = entry.text;
      const translation = document.createElement("span");
      translation.className = "itemTranslation";
      translation.textContent = entry.translation;
      const meta = document.createElement("span");
      meta.className = "muted small";
      meta.textContent = `${langName(entry.source)} \u2192 ${langName(entry.target)}`;
      open.append(source, translation, meta);
      open.addEventListener("click", () => showEntry(entry));

      const star = document.createElement("button");
      star.type = "button";
      star.className = "iconButton";
      star.textContent = entry.saved ? "\u2605" : "\u2606";
      star.title = entry.saved ? t("btnRemoveSaved", "Remove from saved") : t("btnSaveItem", "Save");
      star.setAttribute("aria-label", star.title);
      star.addEventListener("click", () => {
        history = TwpHistory.toggleSaved(history, entry.id);
        persist();
        renderHistory();
        updateButtons();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "iconButton";
      remove.textContent = "\u2715";
      remove.title = t("btnDelete", "Delete");
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", () => {
        history = TwpHistory.remove(history, entry.id);
        persist();
        renderHistory();
        updateButtons();
      });

      row.append(open, star, remove);
      list.append(row);
    }
  }

  function renderHistory() {
    renderList($("savedList"), history.filter(e => e.saved), $("savedEmpty"));
    renderList($("historyList"), history, $("historyEmpty"));
  }

  function showEntry(entry) {
    $("input").value = entry.text;
    setLanguages(entry.source, entry.target);
    shown = { text: entry.text, translation: entry.translation, source: entry.source, target: entry.target };
    $("output").textContent = entry.translation;
    $("count").textContent = `${entry.text.length} / ${LIMIT}`;
    status("");
    setTab("text");
    updateButtons();
  }

  function translate() {
    const raw = $("input").value;
    const text = raw.trim();
    const source = $("sourceLang").value;
    const target = $("targetLang").value;
    $("count").textContent = `${raw.length} / ${LIMIT}`;
    chrome.storage.local.set({ [LANG_KEY]: { source, target } });
    if (!text) {
      shown = null;
      $("output").textContent = "";
      status("");
      updateButtons();
      return;
    }
    const id = ++latest;
    status(t("msgTranslating", "Translating..."));
    chrome.runtime.sendMessage({
      action: "translateText",
      translationService: twpConfig.get("textTranslatorService") || "google",
      sourceLanguage: source,
      targetLanguage: target,
      sourceArray: [text]
    }, results => {
      void chrome.runtime.lastError;
      if (id !== latest) return;
      const translation = Array.isArray(results) && results[0] ? String(results[0]) : "";
      if (!translation) {
        shown = null;
        $("output").textContent = "";
        status(t("msgTranslationFailed", "The translation failed. Try again, or choose another text service in Settings."), true);
        updateButtons();
        return;
      }
      shown = { text, translation, source, target };
      $("output").textContent = translation;
      status("");
      record(shown);
      renderHistory();
      updateButtons();
    });
  }

  function scheduleTranslate() {
    clearTimeout(timer);
    timer = setTimeout(translate, 700);
  }

  function setTab(name) {
    const tabs = { text: "tabText", pdf: "tabPdf", history: "tabHistory" };
    for (const [key, id] of Object.entries(tabs)) {
      const selected = key === name;
      $(id).classList.toggle("selected", selected);
      $(id).setAttribute("aria-selected", String(selected));
      $(`panel${key[0].toUpperCase()}${key.slice(1)}`).hidden = !selected;
    }
  }

  function swap() {
    const source = $("sourceLang").value;
    const target = $("targetLang").value;
    const translation = shown ? shown.translation : "";
    const text = shown ? shown.text : $("input").value;
    // Auto-detect cannot become a target, so the target falls back to English then.
    setLanguages(target, source === "auto" ? "en" : source);
    $("input").value = translation || text;
    translate();
  }

  twpConfig.onReady().then(() => {
    twpI18n.updateUiMessages();
    fillLanguages($("sourceLang"), true);
    fillLanguages($("targetLang"), false);
    const defaultTarget = twpConfig.get("targetLanguage") || "en";
    chrome.storage.local.get([HISTORY_KEY, LANG_KEY], result => {
      void chrome.runtime.lastError;
      history = result && Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
      const langs = (result && result[LANG_KEY]) || {};
      setLanguages(langs.source || "auto", langs.target || defaultTarget);
      renderHistory();
      updateButtons();
    });
  });

  $("input").addEventListener("input", () => {
    $("count").textContent = `${$("input").value.length} / ${LIMIT}`;
    scheduleTranslate();
  });
  $("input").addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      clearTimeout(timer);
      translate();
    }
  });
  $("sourceLang").addEventListener("change", translate);
  $("targetLang").addEventListener("change", translate);
  $("btnSwap").addEventListener("click", swap);
  $("btnClearInput").addEventListener("click", () => {
    clearTimeout(timer);
    $("input").value = "";
    translate();
    $("input").focus();
  });
  $("btnCopy").addEventListener("click", () => {
    if (shown && navigator.clipboard) navigator.clipboard.writeText(shown.translation).catch(() => {});
  });
  $("btnSave").addEventListener("click", () => {
    if (!shown) return;
    let entry = currentEntry();
    if (!entry) {
      record(shown);
      entry = currentEntry();
    }
    history = TwpHistory.toggleSaved(history, entry.id);
    persist();
    renderHistory();
    updateButtons();
  });
  $("btnClearHistory").addEventListener("click", () => {
    history = TwpHistory.clearUnsaved(history);
    persist();
    renderHistory();
    updateButtons();
  });
  $("tabText").addEventListener("click", () => setTab("text"));
  $("tabPdf").addEventListener("click", () => setTab("pdf"));
  $("tabHistory").addEventListener("click", () => setTab("history"));
  if (location.hash === "#pdf") setTab("pdf");
  if (location.hash === "#history") setTab("history");
})();

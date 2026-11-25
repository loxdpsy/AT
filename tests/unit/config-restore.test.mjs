import fs from "fs";
import vm from "vm";
import assert from "assert";

// The repository root, so the tests work from any checkout.
const ROOT = new URL("../../", import.meta.url).pathname;
const languagesSrc = fs.readFileSync(ROOT + "lib/languages.js", "utf8");
const configSrc = fs.readFileSync(ROOT + "lib/config.js", "utf8");

// A settings backup from the old version (the format of "Backup to file"). The key is a placeholder.
const oldBackup = JSON.stringify({
  timeStamp: 1795584304868,
  version: "0.0.1.9",
  uiLanguage: "default",
  pageTranslatorService: "google",
  textTranslatorService: "groq",
  enabledServices: ["google", "bing", "yandex", "groq"],
  deeplApiKey: "",
  groqApiKey: "gsk_PLACEHOLDER_FOR_TESTS",
  groqModel: "openai/gpt-oss-20b",
  toolbarIconStyle: "auto",
  ttsSpeed: 1,
  targetLanguage: "en",
  targetLanguageTextTranslation: "en",
  targetLanguages: ["en", "es", "de"],
  alwaysTranslateSites: [],
  neverTranslateSites: [],
  sitesToTranslateWhenHovering: [],
  langsToTranslateWhenHovering: [],
  alwaysTranslateLangs: [],
  neverTranslateLangs: [],
  translateAllLanguages: "no",
  customDictionary: {},
  showTranslatePageContextMenu: "yes",
  showTranslateSelectedContextMenu: "yes",
  showButtonInTheAddressBar: "yes",
  showOriginalTextWhenHovering: "no",
  showTranslateSelectedButton: "yes",
  showPopupMobile: "yes",
  useOldPopup: "no",
  darkMode: "auto",
  popupBlueWhenSiteIsTranslated: "yes",
  popupPanelSection: 1,
  showReleaseNotes: "yes",
  hotkeys: { "_execute_action": "", "hotkey-swap-page-translation-service": "Alt+Q", "hotkey-toggle-translation": "Alt+T" },
  translateTag_pre: "yes",
  dontSortResults: "no",
  translateDynamicallyCreatedContent: "yes",
  enableDiskCache: "no",
  useAlternativeService: "yes",
  customServices: []
});

// A fresh extension context. chrome.storage is a plain object that survives between contexts, like real storage.
function world(storage, { browserCommands } = {}) {
  const state = { storage, reloaded: false };
  const local = {
    get(keys, cb) { cb && cb(JSON.parse(JSON.stringify(state.storage))); },
    set(obj, cb) { Object.assign(state.storage, JSON.parse(JSON.stringify(obj))); cb && cb(); },
    remove(k, cb) { delete state.storage[k]; cb && cb(); }
  };
  const ctx = {
    console, Map, Set, JSON, Object, Array, String, Number, Promise, setTimeout, structuredClone,
    chrome: {
      runtime: { getManifest: () => ({ version: "0.0.1.9", name: "Atlas Translation" }), reload() { state.reloaded = true; } },
      storage: { local, sync: local, onChanged: { addListener() {} } },
      i18n: { getAcceptLanguages: cb => cb(["en"]) },
      tabs: {}, extension: {}
    }
  };
  // A browser object whose commands API has no update() (Chromium, or a polyfill). It is only set when a test asks for it.
  if (browserCommands) ctx.browser = { commands: browserCommands };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(languagesSrc, ctx);
  vm.runInContext(configSrc, ctx);
  state.cfg = vm.runInContext("twpConfig", ctx);
  return state;
}

// 1) A fresh install has the current default Groq model.
assert.equal(world({}).cfg.get("groqModel"), "openai/gpt-oss-20b");
console.log("ok   default Groq model is openai/gpt-oss-20b");

// 2) Restore an old backup into empty storage: it reloads, and the settings are there after a restart.
const first = world({});
first.cfg.import(oldBackup);
assert.equal(first.reloaded, true, "import reloads the extension");
assert.ok(!("timeStamp" in first.storage) && !("version" in first.storage), "non-settings keys are not stored");
const again = world(first.storage).cfg;
assert.equal(again.get("groqApiKey"), "gsk_PLACEHOLDER_FOR_TESTS");
assert.equal(again.get("groqModel"), "openai/gpt-oss-20b");
assert.equal(again.get("textTranslatorService"), "groq");
assert.ok(again.get("enabledServices").includes("groq"));
assert.deepEqual([...again.get("targetLanguages")], ["en", "es", "de"]);
assert.ok(again.get("customDictionary") instanceof Map, "customDictionary is a Map after restart");
assert.equal(again.get("hotkeys")["hotkey-swap-page-translation-service"], "Alt+Q");
console.log("ok   restoring an old backup keeps the settings after a restart");

// 3) A backup that names a retired Groq model is switched to its replacement.
const retired = world({});
retired.cfg.import(JSON.stringify({ groqModel: "llama-3.3-70b-versatile" }));
assert.equal(world(retired.storage).cfg.get("groqModel"), "openai/gpt-oss-120b");
const retiredSmall = world({ groqModel: "llama-3.1-8b-instant" }).cfg;
assert.equal(retiredSmall.get("groqModel"), "openai/gpt-oss-20b", "a stored retired model is switched on load");
console.log("ok   retired Groq models are switched to their replacements");

// 4) Restoring over existing settings changes only the keys in the file.
const existing = world({ groqApiKey: "old-key", deeplApiKey: "deepl-key", targetLanguages: ["fr"] });
existing.cfg.import(JSON.stringify({ groqApiKey: "gsk_new_placeholder", targetLanguages: ["en", "es", "de"] }));
const merged = world(existing.storage).cfg;
assert.equal(merged.get("groqApiKey"), "gsk_new_placeholder");
assert.equal(merged.get("deeplApiKey"), "deepl-key", "keys not in the file are kept");
console.log("ok   a partial restore only changes the keys it lists");

// 5) A corrupt file throws. The options page then shows its "file is corrupted" message.
assert.throws(() => world({}).cfg.import("{not json"));
console.log("ok   a corrupt file throws");
// 6) A browser object without commands.update (Chromium): restoring a backup must still work.
//    The shortcut keys cannot be set from code there, so the restore skips that step and reloads.
const noUpdate = world({}, { browserCommands: {} });
noUpdate.cfg.import(oldBackup);
assert.equal(noUpdate.reloaded, true, "import reloads when commands.update is missing");
assert.equal(world(noUpdate.storage).cfg.get("groqApiKey"), "gsk_PLACEHOLDER_FOR_TESTS");
console.log("ok   restore works when browser.commands.update is missing");

// 7) Reset to defaults also works without commands.update.
const resetNoUpdate = world({ hotkeys: { "hotkey-toggle-translation": "Alt+X" } }, { browserCommands: {} });
resetNoUpdate.cfg.restoreToDefault();
assert.equal(resetNoUpdate.reloaded, true, "reset reloads when commands.update is missing");
console.log("ok   reset to defaults works when browser.commands.update is missing");
console.log("all config restore checks passed");

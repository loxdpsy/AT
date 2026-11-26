"use strict";

// First-run setup page. It opens once, when the extension is installed (background/background.js).
// Choosing a provider or skipping sets onboardingDone in storage.local. That flag is kept across updates, so an update
// never opens this page again. Options, Others, "Open the setup guide" opens it on purpose.
(function () {
  const PROVIDERS = [
    { id: "keep", title: "onboardingKeepTitle", desc: "onboardingKeepDesc" },
    { id: "offline", title: "onboardingOfflineTitle", desc: "onboardingOfflineDesc", recommended: true },
    { id: "google", title: "onboardingGoogleTitle", desc: "onboardingGoogleDesc" },
    { id: "groq", title: "onboardingGroqTitle", desc: "onboardingGroqDesc", needsKey: true },
    { id: "openrouter", title: "onboardingOpenRouterTitle", desc: "onboardingOpenRouterDesc", needsKey: true },
  ];

  function renderProviders() {
    const container = document.getElementById("providers");
    // Keep the choice the user already made when the page is translated and built again.
    const selected = (document.querySelector("input[name=\"provider\"]:checked") || { value: "keep" }).value;
    container.replaceChildren();
    for (const provider of PROVIDERS) {
      const label = document.createElement("label");
      label.className = "provider";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "provider";
      input.value = provider.id;
      input.checked = provider.id === selected;
      const text = document.createElement("span");
      const title = document.createElement("span");
      title.className = "provider-title";
      title.textContent = twpI18n.getMessage(provider.title);
      if (provider.recommended) {
        const badge = document.createElement("span");
        badge.className = "provider-badge";
        badge.textContent = twpI18n.getMessage("onboardingRecommended") || "Recommended";
        title.append(badge);
      }
      const desc = document.createElement("span");
      desc.className = "provider-desc";
      desc.textContent = twpI18n.getMessage(provider.desc);
      text.append(title, desc);
      label.append(input, text);
      container.append(label);
    }
  }

  // Offline needs the helper and at least one language pair. The helper answers its status endpoint (no secret) to
  // extension pages, so this page can show what is installed, and what to do next.
  const HELPER_STATUS = "http://127.0.0.1:47632/api/offline/ping";

  function setOfflineText(text) {
    document.getElementById("offlineStatusText").textContent = text;
  }

  async function checkHelper() {
    setOfflineText(twpI18n.getMessage("onboardingHelperChecking") || "Checking the helper...");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(HELPER_STATUS, { cache: "no-store", signal: controller.signal });
      const info = await response.json();
      if (!info || info.ok !== true) throw new Error("not the helper");
      const packs = Array.isArray(info.packs) ? info.packs : [];
      if (packs.length === 0) {
        setOfflineText(twpI18n.getMessage("onboardingHelperNoPacks") || "The helper is running, but no language pair is installed yet. Open the helper, go to its Offline tab, and install the pairs you need.");
      } else {
        setOfflineText(twpI18n.getMessage("onboardingHelperPacks", packs.join(", ")) || `Installed language pairs: ${packs.join(", ")}.`);
      }
      if (!info.engine) {
        setOfflineText(document.getElementById("offlineStatusText").textContent + " " + (twpI18n.getMessage("onboardingHelperNoEngine") || "The offline engine is not installed yet. Install it from the helper's Offline tab."));
      }
    } catch (e) {
      setOfflineText(twpI18n.getMessage("onboardingHelperMissing") || "The helper is not running. Start the Atlas helper, then press Check again. Until a language pair is installed, the next enabled service translates the text.");
    } finally {
      clearTimeout(timer);
    }
  }

  function updateOfflineBox() {
    const selected = (document.querySelector("input[name=\"provider\"]:checked") || { value: "keep" }).value;
    const box = document.getElementById("offlineStatus");
    box.hidden = selected !== "offline";
    if (!box.hidden) checkHelper();
  }

  function showResult(message) {
    const result = document.getElementById("result");
    result.textContent = message;
    result.hidden = false;
    document.getElementById("btnSave").disabled = true;
    document.getElementById("btnSkip").disabled = true;
  }

  function markDone(then) {
    chrome.storage.local.set({ onboardingDone: true }, () => then && then());
  }

  function save() {
    const choice = document.querySelector("input[name=\"provider\"]:checked").value;
    twpConfig.onReady().then(() => {
      if (choice !== "keep") {
        twpConfig.set("pageTranslatorService", choice);
        twpConfig.set("textTranslatorService", choice);
        const enabled = twpConfig.get("enabledServices") || [];
        if (!enabled.includes(choice)) twpConfig.set("enabledServices", [...enabled, choice]);
      }
      markDone(() => {
        const needsKey = PROVIDERS.find(p => p.id === choice && p.needsKey);
        showResult(twpI18n.getMessage(needsKey ? "onboardingSavedKey" : "onboardingSaved") || "Saved. You can close this tab.");
      });
    });
  }

  function skip() {
    markDone(() => showResult(twpI18n.getMessage("onboardingSkipped") || "Skipped. You can close this tab."));
  }

  renderProviders();
  // Listening on the container once: the radio buttons are built again when the page is translated.
  document.getElementById("providers").addEventListener("change", updateOfflineBox);
  document.getElementById("btnCheckHelper").addEventListener("click", checkHelper);
  document.getElementById("btnSave").addEventListener("click", save);
  document.getElementById("btnSkip").addEventListener("click", skip);
  twpConfig.onReady().then(() => twpI18n.updateUiMessages()).then(() => {
    // The page is translated now, so the provider labels are built again in the user's language.
    renderProviders();
    updateOfflineBox();
  });
})();

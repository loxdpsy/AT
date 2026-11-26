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
  document.getElementById("btnSave").addEventListener("click", save);
  document.getElementById("btnSkip").addEventListener("click", skip);
  twpConfig.onReady().then(() => twpI18n.updateUiMessages()).then(() => {
    // The page is translated now, so the provider labels are built again in the user's language.
    renderProviders();
  });
})();

"use strict";

var $ = document.querySelector.bind(document);
twpConfig.onReady().then(() => twpI18n.updateUiMessages()).then(() => {
  const darkPref = twpConfig.get("darkMode");
  twpTheme.set(["auto", "yes", "no"].includes(darkPref) ? darkPref : "auto");
  twpI18n.translateDocument();
  $("#btnImproveTranslation").onclick = () => {
    window.location = "improve-translation.html";
  };
  let popupPanelSection = twpConfig.get("popupPanelSection");
  function updatePopupSection() {
    document.querySelectorAll("[data-popupPanelSection]").forEach(node => {
      const nodePopupPanelSection = parseInt(node.getAttribute("data-popupPanelSection"));
      if (isNaN(nodePopupPanelSection)) return;
      if (nodePopupPanelSection > popupPanelSection) {
        node.style.display = "none";
      } else {
        node.style.display = "block";
      }
    });
    document.querySelectorAll("[data-popupPanelSection2]").forEach(node => {
      const nodePopupPanelSection2 = parseInt(node.getAttribute("data-popupPanelSection2"));
      if (isNaN(nodePopupPanelSection2)) return;
      if (nodePopupPanelSection2 <= popupPanelSection) {
        node.style.display = "none";
      } else {
        node.style.display = "block";
      }
    });
    $("#more").style.display = "block";
    $("#less").style.display = "block";
    if (popupPanelSection >= 6) {
      $("#more").style.display = "none";
    } else if (popupPanelSection <= 0) {
      $("#less").style.display = "none";
    }
  }
  updatePopupSection();
  $("#more").onclick = e => {
    if (popupPanelSection < 6) {
      popupPanelSection++;
      updatePopupSection();
    }
    twpConfig.set("popupPanelSection", popupPanelSection);
  };
  $("#less").onclick = e => {
    if (popupPanelSection > 0) {
      popupPanelSection--;
      updatePopupSection();
    }
    twpConfig.set("popupPanelSection", popupPanelSection);
  };
  let originalTabLanguage = "und";
  let currentPageLanguage = "und";
  let currentPageLanguageState = "original";
  let currentPageTranslatorService = twpConfig.get("pageTranslatorService");
  // Only the language buttons in the first two bars. Other buttons (the menu, Improve translation) must not run the translate handler.
  const twpButtons = document.querySelectorAll(".w3-bar > button");
  twpButtons.forEach(button => {
    button.addEventListener("click", event => {
      twpButtons.forEach(button => {
        button.classList.remove("w3-buttonSelected");
      });
      event.target.classList.add("w3-buttonSelected");
      currentPageLanguage = event.target.value;
      if (currentPageLanguage === "original") {
        currentPageLanguageState = "original";
      } else {
        currentPageLanguageState = "translated";
        twpConfig.setTargetLanguage(event.target.value);
      }
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, tabs => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "translatePage",
          targetLanguage: event.target.value || "original"
        }, checkedLastError);
      });
    });
  });
  let targetLanguages = twpConfig.get("targetLanguages");
  for (let i = 1; i < 4; i++) {
    const button = twpButtons[i];
    button.value = targetLanguages[i - 1];
    button.textContent = twpLang.codeToLanguage(targetLanguages[i - 1]);
  }
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "getOriginalTabLanguage"
    }, {
      frameId: 0
    }, tabLanguage => {
      checkedLastError();
      if (!tabLanguage || (tabLanguage = twpLang.fixTLanguageCode(tabLanguage))) {
        originalTabLanguage = tabLanguage || "und";
        // The label under "Original" shows the page's language. It stays empty while the language is unknown.
        $("#lblOriginalLanguage").textContent = originalTabLanguage === "und" ? "" : twpLang.codeToLanguage(originalTabLanguage);
        updateInterface();
      }
    });
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "getCurrentPageLanguage"
    }, {
      frameId: 0
    }, pageLanguage => {
      checkedLastError();
      if (pageLanguage) {
        currentPageLanguage = pageLanguage;
        updateInterface();
      }
    });
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "getCurrentPageLanguageState"
    }, {
      frameId: 0
    }, pageLanguageState => {
      checkedLastError();
      if (pageLanguageState) {
        currentPageLanguageState = pageLanguageState;
        updateInterface();
      }
    });
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "getCurrentPageTranslatorService"
    }, {
      frameId: 0
    }, pageTranslatorService => {
      checkedLastError();
      if (pageTranslatorService) {
        currentPageTranslatorService = pageTranslatorService;
        updateInterface();
      }
    });
  });
  function updateInterface() {
    if (currentPageTranslatorService == "yandex") {
      $("#iconTranslate").setAttribute("src", "/icons/yandex-translate-32.png");
    } else if (currentPageTranslatorService == "bing") {
      $("#iconTranslate").setAttribute("src", "/icons/bing-translate-32.png");
    } else {
      // google
      $("#iconTranslate").setAttribute("src", "/icons/google-translate-32.png");
    }
    twpButtons.forEach(button => {
      button.classList.remove("w3-buttonSelected");
      if (currentPageLanguageState !== "translated" && button.value === "original" || currentPageLanguageState === "translated" && button.value === currentPageLanguage) {
        button.classList.add("w3-buttonSelected");
      }
    });
    // The rows that name the page's language only show when that language is known.
    const languageRowsDisplay = originalTabLanguage === "und" ? "none" : "";
    $("#divAlwaysTranslateThisLang").style.display = languageRowsDisplay;
    $("#divShowTranslatedWhenHoveringThisLang").style.display = languageRowsDisplay;
    if (originalTabLanguage !== "und") {
      $("#cbAlwaysTranslateThisLang").checked = twpConfig.get("alwaysTranslateLangs").indexOf(originalTabLanguage) !== -1;
      $("#lblAlwaysTranslateThisLang").textContent = twpI18n.getMessage("lblAlwaysTranslate", twpLang.codeToLanguage(originalTabLanguage));
      $("#cbAlwaysTranslateThisLang").removeAttribute("disabled");
      const translatedWhenHoveringThisLangText = twpI18n.getMessage("lblShowTranslatedWhenHoveringThisLang", twpLang.codeToLanguage(originalTabLanguage));
      $("#cbShowTranslatedWhenHoveringThisLang").checked = twpConfig.get("langsToTranslateWhenHovering").indexOf(originalTabLanguage) !== -1;
      $("#lblShowTranslatedWhenHoveringThisLang").textContent = translatedWhenHoveringThisLangText;
      $("#cbShowTranslatedWhenHoveringThisLang").removeAttribute("disabled");
    }
  }
  updateInterface();
  $("#btnSwitchInterfaces").addEventListener("click", () => {
    twpConfig.set("useOldPopup", "yes");
    window.location = "old-popup.html";
  });
  $("#divIconTranslate").addEventListener("click", () => {
    currentPageTranslatorService = twpConfig.swapPageTranslationService();
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "swapTranslationService",
        newServiceName: currentPageTranslatorService
      }, checkedLastError);
    });
    updateInterface();
  });
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, tabs => {
    $("#cbAlwaysTranslateThisLang").addEventListener("change", e => {
      const hostname = new URL(tabs[0].url).hostname;
      if (e.target.checked) {
        twpConfig.addLangToAlwaysTranslate(originalTabLanguage, hostname);
      } else {
        twpConfig.removeLangFromAlwaysTranslate(originalTabLanguage);
      }
    });
    $("#cbAlwaysTranslateThisSite").addEventListener("change", e => {
      const hostname = new URL(tabs[0].url).hostname;
      if (e.target.checked) {
        twpConfig.addSiteToAlwaysTranslate(hostname);
      } else {
        twpConfig.removeSiteFromAlwaysTranslate(hostname);
      }
    });
    $("#cbShowTranslateSelectedButton").addEventListener("change", e => {
      if (e.target.checked) {
        twpConfig.set("showTranslateSelectedButton", "yes");
      } else {
        twpConfig.set("showTranslateSelectedButton", "no");
      }
    });
    $("#cbShowOriginalWhenHovering").addEventListener("change", e => {
      if (e.target.checked) {
        twpConfig.set("showOriginalTextWhenHovering", "yes");
      } else {
        twpConfig.set("showOriginalTextWhenHovering", "no");
      }
    });
    $("#cbShowTranslatedWhenHoveringThisSite").addEventListener("change", e => {
      const hostname = new URL(tabs[0].url).hostname;
      if (e.target.checked) {
        twpConfig.addSiteToTranslateWhenHovering(hostname);
      } else {
        twpConfig.removeSiteFromTranslateWhenHovering(hostname);
      }
    });
    $("#cbShowTranslatedWhenHoveringThisLang").addEventListener("change", e => {
      if (e.target.checked) {
        twpConfig.addLangToTranslateWhenHovering(originalTabLanguage);
      } else {
        twpConfig.removeLangFromTranslateWhenHovering(originalTabLanguage);
      }
    });
    $("#cbShowTranslateSelectedButton").checked = twpConfig.get("showTranslateSelectedButton") == "yes" ? true : false;
    $("#cbShowOriginalWhenHovering").checked = twpConfig.get("showOriginalTextWhenHovering") == "yes" ? true : false;
    const hostname = new URL(tabs[0].url).hostname;
    $("#cbAlwaysTranslateThisSite").checked = twpConfig.get("alwaysTranslateSites").indexOf(hostname) !== -1;
    $("#cbShowTranslatedWhenHoveringThisSite").checked = twpConfig.get("sitesToTranslateWhenHovering").indexOf(hostname) !== -1;
  });
  // ---- Options menu ----
  // One list, built from the current settings each time it opens. Each item has its own label, check state, and action.
  // Settings items change in place and the list redraws. Items that open a page close the popup.
  const menuButton = $("#btnMenu");
  const menuLayer = $("#menuLayer");
  const menuPanel = $("#menuPanel");
  let menuPage = { hostname: "", url: "" };

  // The check mark is built with DOM calls, not innerHTML (AMO's validator flags innerHTML).
  function checkIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M3.5 8.5l3 3 6-6.5");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  }
  function text(key, fallback, substitution) {
    return twpI18n.getMessage(key, substitution) || fallback;
  }
  // Only web pages have a site to remember. chrome:// and file:// pages return "" (new URL("chrome://x").hostname is "x").
  function hostnameOf(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname : "";
    } catch (e) {
      return "";
    }
  }
  function isOn(listName, value) {
    return twpConfig.get(listName).indexOf(value) !== -1;
  }
  function toggleIn(listName, value, add, remove) {
    if (isOn(listName, value)) {
      remove();
    } else {
      add();
    }
  }
  function flipYesNo(key) {
    return () => twpConfig.set(key, twpConfig.get(key) === "yes" ? "no" : "yes");
  }
  function externalTranslateUrl(pageUrl) {
    const target = twpConfig.get("targetLanguage");
    return currentPageTranslatorService === "yandex" ?
      `https://translate.yandex.com/translate?view=compact&url=${encodeURIComponent(pageUrl)}&lang=${target.split("-")[0]}` :
      `https://translate.google.com/translate?tl=${target}&u=${encodeURIComponent(pageUrl)}`;
  }
  // Keeps the checkboxes in the popup body in step with the menu.
  function syncPopupState(hostname) {
    $("#cbAlwaysTranslateThisSite").checked = isOn("alwaysTranslateSites", hostname);
    $("#cbShowTranslatedWhenHoveringThisSite").checked = isOn("sitesToTranslateWhenHovering", hostname);
    $("#cbShowTranslateSelectedButton").checked = twpConfig.get("showTranslateSelectedButton") === "yes";
    $("#cbShowOriginalWhenHovering").checked = twpConfig.get("showOriginalTextWhenHovering") === "yes";
    if (originalTabLanguage !== "und") {
      $("#cbAlwaysTranslateThisLang").checked = isOn("alwaysTranslateLangs", originalTabLanguage);
      $("#cbShowTranslatedWhenHoveringThisLang").checked = isOn("langsToTranslateWhenHovering", originalTabLanguage);
    }
  }
  function closePopupAfter(error) {
    void chrome.runtime.lastError;
    window.close();
  }

  function menuItem(label, run, checked = null, enabled = true) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "menuItem";
    item.setAttribute("role", checked === null ? "menuitem" : "menuitemcheckbox");
    if (checked !== null) {
      item.setAttribute("aria-checked", String(checked));
    }
    item.disabled = !enabled;
    const mark = document.createElement("span");
    mark.className = "menuMark";
    if (checked) {
      mark.append(checkIcon());
    }
    const labelNode = document.createElement("span");
    labelNode.className = "menuLabel";
    labelNode.textContent = label;
    item.append(mark, labelNode);
    item.addEventListener("click", run);
    return item;
  }
  // A setting: changes it, then redraws the list and the checkboxes in the popup body.
  function settingItem(label, checked, change, enabled = true) {
    return menuItem(label, () => {
      change();
      syncPopupState(menuPage.hostname);
      redrawMenu();
    }, checked, enabled);
  }
  // A page or a link: opens it. The popup closes unless the caller says otherwise.
  function pageItem(label, open) {
    return menuItem(label, open);
  }
  function menuGroup(items) {
    const group = document.createElement("div");
    group.className = "menuGroup";
    group.setAttribute("role", "group");
    group.append(...items);
    return group;
  }

  function menuGroups() {
    const { hostname, url } = menuPage;
    const lang = originalTabLanguage;
    const hasLang = lang !== "und";
    const langName = hasLang ? twpLang.codeToLanguage(lang) : "";
    const hasSite = hostname !== "";

    const siteGroup = menuGroup([
      settingItem(text("btnNeverTranslate", "Never translate this site"), isOn("neverTranslateSites", hostname),
        () => toggleIn("neverTranslateSites", hostname, () => twpConfig.addSiteToNeverTranslate(hostname), () => twpConfig.removeSiteFromNeverTranslate(hostname)), hasSite),
      settingItem(text("btnAlwaysTranslate", "Always translate this site"), isOn("alwaysTranslateSites", hostname),
        () => toggleIn("alwaysTranslateSites", hostname, () => twpConfig.addSiteToAlwaysTranslate(hostname), () => twpConfig.removeSiteFromAlwaysTranslate(hostname)), hasSite),
      ...(hasLang ? [
        settingItem(text("btnNeverTranslateThisLanguage", "Never translate this language"), isOn("neverTranslateLangs", lang),
          () => toggleIn("neverTranslateLangs", lang, () => twpConfig.addLangToNeverTranslate(lang, hostname), () => twpConfig.removeLangFromNeverTranslate(lang)))
      ] : [])
    ]);

    const displayGroup = menuGroup([
      settingItem(text("lblShowTranslateSelectedButton", "Show the button to translate the selected text"),
        twpConfig.get("showTranslateSelectedButton") === "yes", flipYesNo("showTranslateSelectedButton")),
      settingItem(text("lblShowOriginalTextWhenHovering", "Show original text when hovering"),
        twpConfig.get("showOriginalTextWhenHovering") === "yes", flipYesNo("showOriginalTextWhenHovering")),
      settingItem(text("lblShowTranslatedWhenHoveringThisSite", "Show translation when hovering over this site"),
        isOn("sitesToTranslateWhenHovering", hostname),
        () => toggleIn("sitesToTranslateWhenHovering", hostname, () => twpConfig.addSiteToTranslateWhenHovering(hostname), () => twpConfig.removeSiteFromTranslateWhenHovering(hostname)), hasSite),
      ...(hasLang ? [
        settingItem(text("lblShowTranslatedWhenHoveringThisLang", `Show translation when hovering over websites in ${langName}`, langName),
          isOn("langsToTranslateWhenHovering", lang),
          () => toggleIn("langsToTranslateWhenHovering", lang, () => twpConfig.addLangToTranslateWhenHovering(lang), () => twpConfig.removeLangFromTranslateWhenHovering(lang)))
      ] : [])
    ]);

    const externalLabel = currentPageTranslatorService === "yandex" ?
      text("msgOpenOnYandexTranslator", "Open in Yandex Translate") :
      text("btnOpenOnGoogleTranslate", "Open in Google Translate");
    const pageGroup = menuGroup([
      pageItem(text("msgChooseAnotherLanguage", "Choose another language"), () => {
        location = chrome.runtime.getURL("/popup/popup-change-language.html");
      }),
      pageItem(externalLabel, () => tabsCreate(externalTranslateUrl(url), closePopupAfter)),
      pageItem(text("msgTranslatePDF", "Translate PDF"), () => tabsCreate("https://pdf.translatewebpages.org/", closePopupAfter))
    ]);

    const appGroup = menuGroup([
      pageItem(text("btnMoreOptions", "More options"), () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("/options/options.html") }, closePopupAfter);
      }),
      pageItem(`${text("lblAbout", "About")} ${chrome.runtime.getManifest().name}`, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("/options/options.html#about") }, closePopupAfter);
      })
    ]);

    return [siteGroup, displayGroup, pageGroup, appGroup];
  }

  // Redraws the list in place. Keeps keyboard focus on the same position.
  function redrawMenu() {
    const items = [...menuPanel.querySelectorAll(".menuItem")];
    const index = items.indexOf(document.activeElement);
    menuPanel.replaceChildren(...menuGroups());
    const next = [...menuPanel.querySelectorAll(".menuItem:not(:disabled)")];
    if (index >= 0 && next.length) {
      next[Math.min(index, next.length - 1)].focus();
    }
  }
  function openMenu() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const url = (tabs[0] && tabs[0].url) || "";
      menuPage = { hostname: hostnameOf(url), url };
      menuPanel.replaceChildren(...menuGroups());
      menuLayer.hidden = false;
      menuButton.setAttribute("aria-expanded", "true");
      const first = menuPanel.querySelector(".menuItem:not(:disabled)");
      if (first) {
        first.focus();
      }
    });
  }
  function closeMenu(returnFocus) {
    if (menuLayer.hidden) {
      return;
    }
    menuLayer.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    if (returnFocus) {
      menuButton.focus();
    }
  }

  menuButton.addEventListener("click", () => {
    if (menuLayer.hidden) {
      openMenu();
    } else {
      closeMenu(true);
    }
  });
  // The layer covers the popup. A click on it (outside the list) closes the menu.
  menuLayer.addEventListener("click", event => {
    if (event.target === menuLayer) {
      closeMenu(false);
    }
  });
  document.addEventListener("keydown", event => {
    if (menuLayer.hidden) {
      return;
    }
    if (event.key === "Escape") {
      closeMenu(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = [...menuPanel.querySelectorAll(".menuItem:not(:disabled)")];
      if (!items.length) {
        return;
      }
      event.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[next].focus();
    }
  });

  // ---- Update notice (background/updateCheck.js). Shown only when a newer GitHub release exists and checks are on. ----
  chrome.storage.local.get("updateCheck", result => {
    const state = (result && result.updateCheck) || {};
    if (state.enabled === false || !state.latest) {
      return;
    }
    const latest = state.latest;
    $("#updateText").textContent = text("updateBannerText", `Version ${latest.version} is available.`, latest.version);
    $("#updateHelp").textContent = text("updateBannerHelp", "Download the zip, unzip it over the old folder, then reload the extension.");
    $("#btnUpdateDownload").textContent = text("updateBannerDownload", "Download");
    $("#btnUpdateDownload").addEventListener("click", () => tabsCreate(latest.zipUrl, closePopupAfter));
    $("#updateBanner").hidden = false;
  });
});

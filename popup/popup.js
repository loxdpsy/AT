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
        twpButtons[0].childNodes[1].textContent = twpLang.codeToLanguage(originalTabLanguage);
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
  // A themed list, not a native <select>. The browser draws a <select> list itself, so its colours
  // did not follow the theme: light text on a light list in dark mode.
  const menuButton = $("#btnMenu");
  const menuPanel = $("#menuPanel");
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
  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return "";
    }
  }
  function menuItem(action, label, checked = null) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "menuItem";
    item.dataset.action = action;
    item.setAttribute("role", checked === null ? "menuitem" : "menuitemcheckbox");
    if (checked !== null) {
      item.setAttribute("aria-checked", String(checked));
    }
    const mark = document.createElement("span");
    mark.className = "menuMark";
    if (checked) {
      mark.append(checkIcon());
    }
    const labelNode = document.createElement("span");
    labelNode.className = "menuLabel";
    labelNode.textContent = label;
    item.append(mark, labelNode);
    return item;
  }
  function menuSeparator() {
    const line = document.createElement("div");
    line.className = "menuSeparator";
    line.setAttribute("role", "separator");
    return line;
  }
  function isOn(listName, value) {
    return twpConfig.get(listName).indexOf(value) !== -1;
  }
  // The menu is built from the current state, so every check mark matches the settings.
  function buildMenu(hostname) {
    const lang = originalTabLanguage;
    const hasLang = lang !== "und";
    const langName = hasLang ? twpLang.codeToLanguage(lang) : "";
    const siteSection = [
      menuItem("neverTranslateThisSite", text("btnNeverTranslate", "Never translate this site"), isOn("neverTranslateSites", hostname)),
      menuItem("alwaysTranslateThisSite", text("btnAlwaysTranslate", "Always translate this site"), isOn("alwaysTranslateSites", hostname))
    ];
    if (hasLang) {
      siteSection.push(menuItem("neverTranslateThisLanguage", text("btnNeverTranslateThisLanguage", "Never translate this language"), isOn("neverTranslateLangs", lang)));
    }
    const displaySection = [
      menuItem("showTranslateSelectedButton", text("lblShowTranslateSelectedButton", "Show the button to translate the selected text"), twpConfig.get("showTranslateSelectedButton") === "yes"),
      menuItem("showOriginalTextWhenHovering", text("lblShowOriginalTextWhenHovering", "Show original text when hovering"), twpConfig.get("showOriginalTextWhenHovering") === "yes"),
      menuItem("showTranslatedWhenHoveringThisSite", text("lblShowTranslatedWhenHoveringThisSite", "Show translation when hovering over this site"), isOn("sitesToTranslateWhenHovering", hostname))
    ];
    if (hasLang) {
      displaySection.push(menuItem("showTranslatedWhenHoveringThisLang", text("lblShowTranslatedWhenHoveringThisLang", `Show translation when hovering over websites in ${langName}`, langName), isOn("langsToTranslateWhenHovering", lang)));
    }
    const externalLabel = currentPageTranslatorService === "yandex" ?
      text("msgOpenOnYandexTranslator", "Open in Yandex Translate") :
      text("btnOpenOnGoogleTranslate", "Open in Google Translate");
    const pageSection = [
      menuItem("changeLanguage", text("msgChooseAnotherLanguage", "Choose another language")),
      menuItem("translateInExternalSite", externalLabel),
      menuItem("translatePDF", text("msgTranslatePDF", "Translate PDF"))
    ];
    const appSection = [
      menuItem("moreOptions", text("btnMoreOptions", "More options")),
      menuItem("aboutAtlas", `${text("lblAbout", "About")} ${chrome.runtime.getManifest().name}`)
    ];
    const nodes = [];
    [siteSection, displaySection, pageSection, appSection].forEach((items, i) => {
      if (i > 0) {
        nodes.push(menuSeparator());
      }
      nodes.push(...items);
    });
    return nodes;
  }
  function setMenuOpen(open) {
    menuPanel.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
  }
  function showMenu(hostname) {
    menuPanel.replaceChildren(...buildMenu(hostname));
    setMenuOpen(true);
  }
  function currentHostname(callback) {
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      callback(hostnameOf(tabs[0] && tabs[0].url));
    });
  }
  // Keep the checkboxes in the popup body in step with the menu.
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
  function toggleIn(listName, value, add, remove) {
    if (isOn(listName, value)) {
      remove();
    } else {
      add();
    }
  }

  menuButton.addEventListener("click", event => {
    event.stopPropagation();
    if (!menuPanel.hidden) {
      setMenuOpen(false);
      return;
    }
    currentHostname(showMenu);
  });
  document.addEventListener("click", event => {
    if (!event.target.closest || !event.target.closest("#btnMenu, #menuPanel")) {
      setMenuOpen(false);
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      setMenuOpen(false);
    }
  });
  menuPanel.addEventListener("click", event => {
    // The menu rebuilds itself after a change, so the clicked item can be removed from the page.
    // Stop here so the outside-click handler below does not close the menu.
    event.stopPropagation();
    const item = event.target.closest(".menuItem");
    if (item) {
      runMenuAction(item.dataset.action);
    }
  });

  function runMenuAction(action) {
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      const pageUrl = tabs[0] && tabs[0].url;
      const hostname = hostnameOf(pageUrl);
      const lang = originalTabLanguage;
      // Settings that change in place: refresh the menu and the popup checkboxes, and keep the menu open.
      let changed = true;
      switch (action) {
        case "neverTranslateThisSite":
          toggleIn("neverTranslateSites", hostname, () => twpConfig.addSiteToNeverTranslate(hostname), () => twpConfig.removeSiteFromNeverTranslate(hostname));
          break;
        case "alwaysTranslateThisSite":
          toggleIn("alwaysTranslateSites", hostname, () => twpConfig.addSiteToAlwaysTranslate(hostname), () => twpConfig.removeSiteFromAlwaysTranslate(hostname));
          break;
        case "neverTranslateThisLanguage":
          toggleIn("neverTranslateLangs", lang, () => twpConfig.addLangToNeverTranslate(lang, hostname), () => twpConfig.removeLangFromNeverTranslate(lang));
          break;
        case "showTranslateSelectedButton":
          twpConfig.set("showTranslateSelectedButton", twpConfig.get("showTranslateSelectedButton") === "yes" ? "no" : "yes");
          break;
        case "showOriginalTextWhenHovering":
          twpConfig.set("showOriginalTextWhenHovering", twpConfig.get("showOriginalTextWhenHovering") === "yes" ? "no" : "yes");
          break;
        case "showTranslatedWhenHoveringThisSite":
          toggleIn("sitesToTranslateWhenHovering", hostname, () => twpConfig.addSiteToTranslateWhenHovering(hostname), () => twpConfig.removeSiteFromTranslateWhenHovering(hostname));
          break;
        case "showTranslatedWhenHoveringThisLang":
          toggleIn("langsToTranslateWhenHovering", lang, () => twpConfig.addLangToTranslateWhenHovering(lang), () => twpConfig.removeLangFromTranslateWhenHovering(lang));
          break;
        default:
          changed = false;
      }
      if (changed) {
        syncPopupState(hostname);
        showMenu(hostname);
        return;
      }
      // Pages that open in a tab: open it, then close the popup.
      switch (action) {
        case "changeLanguage":
          location = chrome.runtime.getURL("/popup/popup-change-language.html");
          break;
        case "translateInExternalSite": {
          const target = twpConfig.get("targetLanguage");
          const url = currentPageTranslatorService === "yandex" ?
            `https://translate.yandex.com/translate?view=compact&url=${encodeURIComponent(pageUrl)}&lang=${target.split("-")[0]}` :
            `https://translate.google.com/translate?tl=${target}&u=${encodeURIComponent(pageUrl)}`;
          tabsCreate(url, closePopupAfter);
          break;
        }
        case "translatePDF":
          tabsCreate("https://pdf.translatewebpages.org/", closePopupAfter);
          break;
        case "moreOptions":
          chrome.tabs.create({ url: chrome.runtime.getURL("/options/options.html") }, closePopupAfter);
          break;
        case "aboutAtlas":
          chrome.tabs.create({ url: chrome.runtime.getURL("/options/options.html#about") }, closePopupAfter);
          break;
        default:
          break;
      }
    });
  }
});

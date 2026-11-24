"use strict";

var $ = document.querySelector.bind(document);
twpConfig.onReady().then(() => twpI18n.updateUiMessages(sessionStorage.getItem("temporaryUiLanguage"))).then(() => {
  twpI18n.translateDocument();
  document.querySelector("[data-i18n='msgDefaultLanguage']").textContent = twpI18n.getMessage("msgDefaultLanguage") + " - Default language";
  const temporaryUiLanguage = sessionStorage.getItem("temporaryUiLanguage");
  sessionStorage.removeItem("temporaryUiLanguage");
  if (platformInfo.isMobile.any) {
    let style = document.createElement("style");
    style.textContent = ".desktopOnly {display: none !important}";
    document.head.appendChild(style);
  }
  if (!chrome.pageAction) {
    let style = document.createElement("style");
    style.textContent = ".firefox-only {display: none !important}";
    document.head.appendChild(style);
  }
  let sideBarIsVisible = false;
  $("#btnOpenMenu").onclick = e => {
    $("#menuContainer").classList.toggle("change");
    if (sideBarIsVisible) {
      $("#sideBar").style.display = "none";
      sideBarIsVisible = false;
    } else {
      $("#sideBar").style.display = "block";
      sideBarIsVisible = true;
    }
  };
  function hashchange() {
    let hash = location.hash || "#languages";
    if (!document.getElementById(hash.slice(1))) {
      hash = "#languages";
    }
    document.querySelectorAll("main > section").forEach(section => {
      section.style.display = "none";
    });
    document.querySelectorAll("nav a").forEach(a => {
      a.classList.remove("active");
    });
    $(hash).style.display = "block";
    const link = $('nav a[href="' + hash + '"]');
    if (link) {
      link.classList.add("active");
      $("#itemSelectedName").textContent = link.textContent;
    }
    if (sideBarIsVisible) {
      $("#menuContainer").classList.toggle("change");
      $("#sideBar").style.display = "none";
      sideBarIsVisible = false;
    }
  }
  hashchange();
  window.addEventListener("hashchange", hashchange);
  function fillLanguageList(select) {
    let langs = twpLang.getLanguageList();
    const langsSorted = [];
    for (const i in langs) {
      langsSorted.push([i, langs[i]]);
    }
    langsSorted.sort(function (a, b) {
      return a[1].localeCompare(b[1]);
    });
    langsSorted.forEach(value => {
      const option = document.createElement("option");
      option.value = value[0];
      option.textContent = value[1];
      select.appendChild(option);
    });
  }
  fillLanguageList($("#selectTargetLanguage"));
  fillLanguageList($("#selectTargetLanguageForText"));
  fillLanguageList($("#favoriteLanguage1"));
  fillLanguageList($("#favoriteLanguage2"));
  fillLanguageList($("#favoriteLanguage3"));
  fillLanguageList($("#addToNeverTranslateLangs"));
  fillLanguageList($("#addToAlwaysTranslateLangs"));
  fillLanguageList($("#addLangToTranslateWhenHovering"));
  function updateDarkMode() {
    const pref = twpConfig.get("darkMode");
    twpTheme.set(["auto", "yes", "no"].includes(pref) ? pref : "auto");
  }
  updateDarkMode();

  // target languages
  $("#selectUiLanguage").value = temporaryUiLanguage || twpConfig.get("uiLanguage");
  $("#selectUiLanguage").onchange = e => {
    if (e.target.value === "default") {
      twpConfig.set("uiLanguage", "default");
    } else {
      sessionStorage.setItem("temporaryUiLanguage", e.target.value);
    }
    location.reload();
  };
  $("#btnApplyUiLanguage").onclick = () => {
    if (temporaryUiLanguage) {
      twpConfig.set("uiLanguage", temporaryUiLanguage === "default" ? "default" : twpLang.fixUILanguageCode(temporaryUiLanguage));
      location.reload();
    }
  };
  const targetLanguage = twpConfig.get("targetLanguage");
  $("#selectTargetLanguage").value = targetLanguage;
  $("#selectTargetLanguage").onchange = e => {
    twpConfig.setTargetLanguage(e.target.value);
    location.reload();
  };
  const targetLanguageTextTranslation = twpConfig.get("targetLanguageTextTranslation");
  $("#selectTargetLanguageForText").value = targetLanguageTextTranslation;
  $("#selectTargetLanguageForText").onchange = e => {
    twpConfig.setTargetLanguage(e.target.value, true);
    twpConfig.setTargetLanguage(targetLanguage, false);
    location.reload();
  };
  const targetLanguages = twpConfig.get("targetLanguages");
  $("#favoriteLanguage1").value = targetLanguages[0];
  $("#favoriteLanguage2").value = targetLanguages[1];
  $("#favoriteLanguage3").value = targetLanguages[2];
  $("#favoriteLanguage1").onchange = e => {
    targetLanguages[0] = e.target.value;
    twpConfig.set("targetLanguages", targetLanguages);
    if (targetLanguages.indexOf(twpConfig.get("targetLanguage")) == -1) {
      twpConfig.set("targetLanguage", targetLanguages[0]);
    }
    if (targetLanguages.indexOf(twpConfig.get("targetLanguageTextTranslation")) == -1) {
      twpConfig.set("targetLanguageTextTranslation", targetLanguages[0]);
    }
    location.reload();
  };
  $("#favoriteLanguage2").onchange = e => {
    targetLanguages[1] = e.target.value;
    twpConfig.set("targetLanguages", targetLanguages);
    if (targetLanguages.indexOf(twpConfig.get("targetLanguage")) == -1) {
      twpConfig.set("targetLanguage", targetLanguages[0]);
    }
    if (targetLanguages.indexOf(twpConfig.get("targetLanguageTextTranslation")) == -1) {
      twpConfig.set("targetLanguageTextTranslation", targetLanguages[0]);
    }
    location.reload();
  };
  $("#favoriteLanguage3").onchange = e => {
    targetLanguages[2] = e.target.value;
    twpConfig.set("targetLanguages", targetLanguages);
    if (targetLanguages.indexOf(twpConfig.get("targetLanguage")) == -1) {
      twpConfig.set("targetLanguage", targetLanguages[0]);
    }
    if (targetLanguages.indexOf(twpConfig.get("targetLanguageTextTranslation")) == -1) {
      twpConfig.set("targetLanguageTextTranslation", targetLanguages[0]);
    }
    location.reload();
  };

  // Never translate these languages

  function createNodeToNeverTranslateLangsList(langCode, langName) {
    const li = document.createElement("li");
    li.setAttribute("class", "w3-display-container");
    li.value = langCode;
    li.textContent = langName;
    const close = document.createElement("span");
    close.setAttribute("class", "w3-button w3-transparent w3-display-right");
    close.innerHTML = "&times;";
    close.onclick = e => {
      e.preventDefault();
      twpConfig.removeLangFromNeverTranslate(langCode);
      li.remove();
    };
    li.appendChild(close);
    return li;
  }
  const neverTranslateLangs = twpConfig.get("neverTranslateLangs");
  neverTranslateLangs.sort((a, b) => a.localeCompare(b));
  neverTranslateLangs.forEach(langCode => {
    const langName = twpLang.codeToLanguage(langCode);
    const li = createNodeToNeverTranslateLangsList(langCode, langName);
    $("#neverTranslateLangs").appendChild(li);
  });
  $("#addToNeverTranslateLangs").onchange = e => {
    const langCode = e.target.value;
    const langName = twpLang.codeToLanguage(langCode);
    const li = createNodeToNeverTranslateLangsList(langCode, langName);
    $("#neverTranslateLangs").appendChild(li);
    twpConfig.addLangToNeverTranslate(langCode);
  };

  // Always translate these languages

  function createNodeToAlwaysTranslateLangsList(langCode, langName) {
    const li = document.createElement("li");
    li.setAttribute("class", "w3-display-container");
    li.value = langCode;
    li.textContent = langName;
    const close = document.createElement("span");
    close.setAttribute("class", "w3-button w3-transparent w3-display-right");
    close.innerHTML = "&times;";
    close.onclick = e => {
      e.preventDefault();
      twpConfig.removeLangFromAlwaysTranslate(langCode);
      li.remove();
    };
    li.appendChild(close);
    return li;
  }
  const alwaysTranslateLangs = twpConfig.get("alwaysTranslateLangs");
  alwaysTranslateLangs.sort((a, b) => a.localeCompare(b));
  alwaysTranslateLangs.forEach(langCode => {
    const langName = twpLang.codeToLanguage(langCode);
    const li = createNodeToAlwaysTranslateLangsList(langCode, langName);
    $("#alwaysTranslateLangs").appendChild(li);
  });
  $("#addToAlwaysTranslateLangs").onchange = e => {
    const langCode = e.target.value;
    const langName = twpLang.codeToLanguage(langCode);
    const li = createNodeToAlwaysTranslateLangsList(langCode, langName);
    $("#alwaysTranslateLangs").appendChild(li);
    twpConfig.addLangToAlwaysTranslate(langCode);
  };

  // langsToTranslateWhenHovering

  function createNodeToLangsToTranslateWhenHoveringList(langCode, langName) {
    const li = document.createElement("li");
    li.setAttribute("class", "w3-display-container");
    li.value = langCode;
    li.textContent = langName;
    const close = document.createElement("span");
    close.setAttribute("class", "w3-button w3-transparent w3-display-right");
    close.innerHTML = "&times;";
    close.onclick = e => {
      e.preventDefault();
      twpConfig.removeLangFromTranslateWhenHovering(langCode);
      li.remove();
    };
    li.appendChild(close);
    return li;
  }
  const langsToTranslateWhenHovering = twpConfig.get("langsToTranslateWhenHovering");
  langsToTranslateWhenHovering.sort((a, b) => a.localeCompare(b));
  langsToTranslateWhenHovering.forEach(langCode => {
    const langName = twpLang.codeToLanguage(langCode);
    const li = createNodeToLangsToTranslateWhenHoveringList(langCode, langName);
    $("#langsToTranslateWhenHovering").appendChild(li);
  });
  $("#addLangToTranslateWhenHovering").onchange = e => {
    const langCode = e.target.value;
    const langName = twpLang.codeToLanguage(langCode);
    const li = createNodeToLangsToTranslateWhenHoveringList(langCode, langName);
    $("#langsToTranslateWhenHovering").appendChild(li);
    twpConfig.addLangToTranslateWhenHovering(langCode);
  };

  // Always translate these Sites

  function createNodeToAlwaysTranslateSitesList(hostname) {
    const li = document.createElement("li");
    li.setAttribute("class", "w3-display-container");
    li.value = hostname;
    li.textContent = hostname;
    const close = document.createElement("span");
    close.setAttribute("class", "w3-button w3-transparent w3-display-right");
    close.innerHTML = "&times;";
    close.onclick = e => {
      e.preventDefault();
      twpConfig.removeSiteFromAlwaysTranslate(hostname);
      li.remove();
    };
    li.appendChild(close);
    return li;
  }
  const alwaysTranslateSites = twpConfig.get("alwaysTranslateSites");
  alwaysTranslateSites.sort((a, b) => a.localeCompare(b));
  alwaysTranslateSites.forEach(hostname => {
    const li = createNodeToAlwaysTranslateSitesList(hostname);
    $("#alwaysTranslateSites").appendChild(li);
  });
  $("#addToAlwaysTranslateSites").onclick = e => {
    const hostname = prompt("Enter the site hostname", "www.site.com");
    if (!hostname) return;
    const li = createNodeToAlwaysTranslateSitesList(hostname);
    $("#alwaysTranslateSites").appendChild(li);
    twpConfig.addSiteToAlwaysTranslate(hostname);
  };

  // Never translate these Sites

  function createNodeToNeverTranslateSitesList(hostname) {
    const li = document.createElement("li");
    li.setAttribute("class", "w3-display-container");
    li.value = hostname;
    li.textContent = hostname;
    const close = document.createElement("span");
    close.setAttribute("class", "w3-button w3-transparent w3-display-right");
    close.innerHTML = "&times;";
    close.onclick = e => {
      e.preventDefault();
      twpConfig.removeSiteFromNeverTranslate(hostname);
      li.remove();
    };
    li.appendChild(close);
    return li;
  }
  const neverTranslateSites = twpConfig.get("neverTranslateSites");
  neverTranslateSites.sort((a, b) => a.localeCompare(b));
  neverTranslateSites.forEach(hostname => {
    const li = createNodeToNeverTranslateSitesList(hostname);
    $("#neverTranslateSites").appendChild(li);
  });
  $("#addToNeverTranslateSites").onclick = e => {
    const hostname = prompt("Enter the site hostname", "www.site.com");
    if (!hostname) return;
    const li = createNodeToNeverTranslateSitesList(hostname);
    $("#neverTranslateSites").appendChild(li);
    twpConfig.addSiteToNeverTranslate(hostname);
  };
  function createcustomDictionary(keyWord, customValue) {
    const li = document.createElement("li");
    li.setAttribute("class", "w3-display-container");
    li.value = keyWord;
    if (customValue !== "") {
      li.textContent = keyWord + " ------------------- " + customValue;
    } else {
      li.textContent = keyWord;
    }
    const close = document.createElement("span");
    close.setAttribute("class", "w3-button w3-transparent w3-display-right");
    close.innerHTML = "&times;";
    close.onclick = e => {
      e.preventDefault();
      twpConfig.removeKeyWordFromcustomDictionary(keyWord);
      li.remove();
    };
    li.appendChild(close);
    return li;
  }
  let customDictionary = twpConfig.get("customDictionary");
  customDictionary = new Map([...customDictionary.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  customDictionary.forEach(function (customValue, keyWord) {
    const li = createcustomDictionary(keyWord, customValue);
    $("#customDictionary").appendChild(li);
  });
  $("#addToCustomDictionary").onclick = e => {
    let keyWord = prompt("Enter the keyWord, Minimum two letters ", "");
    if (!keyWord || keyWord.length < 2) return;
    keyWord = keyWord.trim().toLowerCase();
    let customValue = prompt("(Optional)\nYou can enter a value to replace it , or fill in nothing.", "");
    if (!customValue) customValue = "";
    customValue = customValue.trim();
    const li = createcustomDictionary(keyWord, customValue);
    $("#customDictionary").appendChild(li);
    twpConfig.addKeyWordTocustomDictionary(keyWord, customValue);
  };

  // sitesToTranslateWhenHovering

  function createNodeToSitesToTranslateWhenHoveringList(hostname) {
    const li = document.createElement("li");
    li.setAttribute("class", "w3-display-container");
    li.value = hostname;
    li.textContent = hostname;
    const close = document.createElement("span");
    close.setAttribute("class", "w3-button w3-transparent w3-display-right");
    close.innerHTML = "&times;";
    close.onclick = e => {
      e.preventDefault();
      twpConfig.removeSiteFromTranslateWhenHovering(hostname);
      li.remove();
    };
    li.appendChild(close);
    return li;
  }
  const sitesToTranslateWhenHovering = twpConfig.get("sitesToTranslateWhenHovering");
  sitesToTranslateWhenHovering.sort((a, b) => a.localeCompare(b));
  sitesToTranslateWhenHovering.forEach(hostname => {
    const li = createNodeToSitesToTranslateWhenHoveringList(hostname);
    $("#sitesToTranslateWhenHovering").appendChild(li);
  });
  $("#addSiteToTranslateWhenHovering").onclick = e => {
    const hostname = prompt("Enter the site hostname", "www.site.com");
    if (!hostname) return;
    const li = createNodeToSitesToTranslateWhenHoveringList(hostname);
    $("#sitesToTranslateWhenHovering").appendChild(li);
    twpConfig.addSiteToTranslateWhenHovering(hostname);
  };

  // translations options
  $("#pageTranslatorService").onchange = e => {
    twpConfig.set("pageTranslatorService", e.target.value);
  };
  $("#pageTranslatorService").value = twpConfig.get("pageTranslatorService");
  $("#textTranslatorService").onchange = e => {
    twpConfig.set("textTranslatorService", e.target.value);
  };
  $("#textTranslatorService").value = twpConfig.get("textTranslatorService");
  $("#ttsSpeed").oninput = e => {
    twpConfig.set("ttsSpeed", e.target.value);
    $("#displayTtsSpeed").textContent = e.target.value;
  };
  $("#ttsSpeed").value = twpConfig.get("ttsSpeed");
  $("#displayTtsSpeed").textContent = twpConfig.get("ttsSpeed");
  $("#showOriginalTextWhenHovering").onchange = e => {
    twpConfig.set("showOriginalTextWhenHovering", e.target.value);
  };
  $("#showOriginalTextWhenHovering").value = twpConfig.get("showOriginalTextWhenHovering");
  $("#translateTag_pre").onchange = e => {
    twpConfig.set("translateTag_pre", e.target.value);
  };
  $("#translateTag_pre").value = twpConfig.get("translateTag_pre");
  $("#dontSortResults").onchange = e => {
    twpConfig.set("dontSortResults", e.target.value);
  };
  $("#dontSortResults").value = twpConfig.get("dontSortResults");
  $("#translateDynamicallyCreatedContent").onchange = e => {
    twpConfig.set("translateDynamicallyCreatedContent", e.target.value);
  };
  $("#translateDynamicallyCreatedContent").value = twpConfig.get("translateDynamicallyCreatedContent");
  $("#autoTranslateWhenClickingALink").onchange = e => {
    if (e.target.value == "yes") {
      chrome.permissions.request({
        permissions: ["webNavigation"]
      }, granted => {
        if (granted) {
          twpConfig.set("autoTranslateWhenClickingALink", "yes");
        } else {
          twpConfig.set("autoTranslateWhenClickingALink", "no");
          e.target.value = "no";
        }
      });
    } else {
      twpConfig.set("autoTranslateWhenClickingALink", "no");
      chrome.permissions.remove({
        permissions: ["webNavigation"]
      });
    }
  };
  $("#autoTranslateWhenClickingALink").value = twpConfig.get("autoTranslateWhenClickingALink");
  function enableOrDisableTranslateSelectedAdvancedOptions(value) {
    if (value === "no") {
      document.querySelectorAll("#translateSelectedAdvancedOptions input").forEach(input => {
        input.setAttribute("disabled", "");
      });
    } else {
      document.querySelectorAll("#translateSelectedAdvancedOptions input").forEach(input => {
        input.removeAttribute("disabled");
      });
    }
  }
  $("#showTranslateSelectedButton").onchange = e => {
    twpConfig.set("showTranslateSelectedButton", e.target.value);
    enableOrDisableTranslateSelectedAdvancedOptions(e.target.value);
  };
  $("#showTranslateSelectedButton").value = twpConfig.get("showTranslateSelectedButton");
  enableOrDisableTranslateSelectedAdvancedOptions(twpConfig.get("showTranslateSelectedButton"));
  $("#dontShowIfPageLangIsTargetLang").onchange = e => {
    twpConfig.set("dontShowIfPageLangIsTargetLang", e.target.checked ? "yes" : "no");
  };
  $("#dontShowIfPageLangIsTargetLang").checked = twpConfig.get("dontShowIfPageLangIsTargetLang") === "yes" ? true : false;
  $("#dontShowIfPageLangIsUnknown").onchange = e => {
    twpConfig.set("dontShowIfPageLangIsUnknown", e.target.checked ? "yes" : "no");
  };
  $("#dontShowIfPageLangIsUnknown").checked = twpConfig.get("dontShowIfPageLangIsUnknown") === "yes" ? true : false;
  $("#dontShowIfSelectedTextIsTargetLang").onchange = e => {
    twpConfig.set("dontShowIfSelectedTextIsTargetLang", e.target.checked ? "yes" : "no");
  };
  $("#dontShowIfSelectedTextIsTargetLang").checked = twpConfig.get("dontShowIfSelectedTextIsTargetLang") === "yes" ? true : false;
  $("#dontShowIfSelectedTextIsUnknown").onchange = e => {
    twpConfig.set("dontShowIfSelectedTextIsUnknown", e.target.checked ? "yes" : "no");
  };
  $("#dontShowIfSelectedTextIsUnknown").checked = twpConfig.get("dontShowIfSelectedTextIsUnknown") === "yes" ? true : false;

  // style options
  $("#useOldPopup").onchange = e => {
    twpConfig.set("useOldPopup", e.target.value);
    updateDarkMode();
  };
  $("#useOldPopup").value = twpConfig.get("useOldPopup");
  $("#darkMode").onchange = e => {
    twpConfig.set("darkMode", e.target.value);
    updateDarkMode();
  };
  $("#darkMode").value = twpConfig.get("darkMode");
  $("#popupBlueWhenSiteIsTranslated").onchange = e => {
    twpConfig.set("popupBlueWhenSiteIsTranslated", e.target.value);
  };
  $("#popupBlueWhenSiteIsTranslated").value = twpConfig.get("popupBlueWhenSiteIsTranslated");

  // hotkeys options
  // Replace the "[Ctrl]" placeholder with a <kbd> element. The strings are plain text, so DOM nodes are safe.
  function highlightCtrlKey(el) {
    const text = el.textContent;
    const at = text.indexOf("[Ctrl]");
    if (at === -1) return;
    const kbd = document.createElement("kbd");
    kbd.textContent = "Ctrl";
    el.replaceChildren(document.createTextNode(text.slice(0, at)), kbd, document.createTextNode(text.slice(at + "[Ctrl]".length)));
  }
  highlightCtrlKey($('[data-i18n="lblTranslateSelectedWhenPressTwice"]'));
  highlightCtrlKey($('[data-i18n="lblTranslateTextOverMouseWhenPressTwice"]'));
  $("#openNativeShortcutManager").onclick = e => {
    tabsCreate("chrome://extensions/shortcuts");
  };
  $("#translateSelectedWhenPressTwice").onclick = e => {
    twpConfig.set("translateSelectedWhenPressTwice", e.target.checked ? "yes" : "no");
  };
  $("#translateSelectedWhenPressTwice").checked = twpConfig.get("translateSelectedWhenPressTwice") === "yes";
  $("#translateTextOverMouseWhenPressTwice").onclick = e => {
    twpConfig.set("translateTextOverMouseWhenPressTwice", e.target.checked ? "yes" : "no");
  };
  $("#translateTextOverMouseWhenPressTwice").checked = twpConfig.get("translateTextOverMouseWhenPressTwice") === "yes";
  const defaultShortcuts = {};
  for (const name of Object.keys(chrome.runtime.getManifest().commands || {})) {
    const info = chrome.runtime.getManifest().commands[name];
    if (info.suggested_key && info.suggested_key.default) {
      defaultShortcuts[name] = info.suggested_key.default;
    } else {
      defaultShortcuts[name] = "";
    }
  }
  function addHotkey(hotkeyname, description) {
    if (hotkeyname === "_execute_browser_action" && !description) {
      description = "Enable the extension";
    }
    const li = document.createElement("li");
    li.classList.add("shortcut-row");
    li.setAttribute("id", hotkeyname);
    li.innerHTML = `
        <div></div>
        <div class="shortcut-input-options">
            <div style="position: relative;">
                <input name="input" class="w3-input w3-border shortcut-input" type="text" readonly placeholder="Enter a shortcut" data-i18n-placeholder="enterShortcut">
                <p name="error" class="shortcut-error" style="position: absolute;"></p>
            </div>
            <div class="w3-hover-light-grey shortcut-button" name="removeKey"><i class="gg-trash"></i></div>
            <div class="w3-hover-light-grey shortcut-button" name="resetKey"><i class="gg-sync"></i></div>
        </div>  
        `;
    li.querySelector("div").textContent = description;
    $("#KeyboardShortcuts").appendChild(li);
    const input = li.querySelector(`[name="input"]`);
    const error = li.querySelector(`[name="error"]`);
    const removeKey = li.querySelector(`[name="removeKey"]`);
    const resetKey = li.querySelector(`[name="resetKey"]`);
    input.value = twpConfig.get("hotkeys")[hotkeyname];
    if (input.value) {
      resetKey.style.display = "none";
    } else {
      removeKey.style.display = "none";
    }
    function setError(errorname) {
      const text = twpI18n.getMessage("hotkeyError_" + errorname);
      switch (errorname) {
        case "ctrlOrAlt":
          error.textContent = text ? text : "Include Ctrl or Alt";
          break;
        case "letter":
          error.textContent = text ? text : "Type a letter";
          break;
        case "invalid":
          error.textContent = text ? text : "Invalid combination";
          break;
        default:
          error.textContent = "";
          break;
      }
    }
    function getKeyString(e) {
      let result = "";
      if (e.ctrlKey) {
        result += "Ctrl+";
      }
      if (e.altKey) {
        result += "Alt+";
      }
      if (e.shiftKey) {
        result += "Shift+";
      }
      if (e.code.match(/Key([A-Z])/)) {
        result += e.code.match(/Key([A-Z])/)[1];
      } else if (e.code.match(/Digit([0-9])/)) {
        result += e.code.match(/Digit([0-9])/)[1];
      }
      return result;
    }
    function setShortcut(name, keystring) {
      const hotkeys = twpConfig.get("hotkeys");
      hotkeys[hotkeyname] = keystring;
      twpConfig.set("hotkeys", hotkeys);
      browser.commands.update({
        name: name,
        shortcut: keystring
      });
    }
    function onkeychange(e) {
      input.value = getKeyString(e);
      if (e.Key == "Tab") {
        return;
      }
      if (e.key == "Escape") {
        input.blur();
        return;
      }
      if (e.key == "Backspace" || e.key == "Delete") {
        setShortcut(hotkeyname, getKeyString(e));
        input.blur();
        return;
      }
      if (!e.ctrlKey && !e.altKey) {
        setError("ctrlOrAlt");
        return;
      }
      if (e.ctrlKey && e.altKey && e.shiftKey) {
        setError("invalid");
        return;
      }
      e.preventDefault();
      if (!e.code.match(/Key([A-Z])/) && !e.code.match(/Digit([0-9])/)) {
        setError("letter");
        return;
      }
      setShortcut(hotkeyname, getKeyString(e));
      input.blur();
      setError("none");
    }
    input.onkeydown = e => onkeychange(e);
    input.onkeyup = e => onkeychange(e);
    input.onfocus = e => {
      input.value = "";
      setError("");
    };
    input.onblur = e => {
      input.value = twpConfig.get("hotkeys")[hotkeyname];
      setError("");
    };
    removeKey.onclick = e => {
      input.value = "";
      setShortcut(hotkeyname, "");
      removeKey.style.display = "none";
      resetKey.style.display = "block";
    };
    resetKey.onclick = e => {
      input.value = defaultShortcuts[hotkeyname];
      setShortcut(hotkeyname, defaultShortcuts[hotkeyname]);
      removeKey.style.display = "block";
      resetKey.style.display = "none";
    };

    //*
    if (typeof browser === "undefined") {
      input.setAttribute("disabled", "");
      resetKey.style.display = "none";
      removeKey.style.display = "none";
    } else {
      $("#openNativeShortcutManager").style.display = "none";
    }
    // */
  }

  if (typeof chrome.commands !== "undefined") {
    chrome.commands.getAll(results => {
      for (const result of results) {
        addHotkey(result.name, result.description);
      }
    });
  }

  // services
  $("#useAlternativeService").oninput = e => {
    twpConfig.set("useAlternativeService", e.target.value);
  };
  $("#useAlternativeService").value = twpConfig.get("useAlternativeService");
  const pageTranslationServices = ["google", "bing", "yandex", "deepl"];
  const updateServiceSelector = enabledServices => {
    document.querySelectorAll("#pageTranslatorService option").forEach(option => option.setAttribute("hidden", ""));
    document.querySelectorAll("#textTranslatorService option").forEach(option => option.setAttribute("hidden", ""));
    enabledServices.forEach(svName => {
      let option;
      option = $(`#pageTranslatorService option[value="${svName}"]`);
      if (option) {
        option.removeAttribute("hidden");
      }
      option = $(`#textTranslatorService option[value="${svName}"]`);
      if (option) {
        option.removeAttribute("hidden");
      }
    });
  };
  const servicesInfo = [{
    selector: "#btnEnableGoogle",
    svName: "google"
  }, {
    selector: "#btnEnableBing",
    svName: "bing"
  }, {
    selector: "#btnEnableYandex",
    svName: "yandex"
  }, {
    selector: "#btnEnableDeepL",
    svName: "deepl"
  }];
  servicesInfo.forEach(svInfo => {
    $(svInfo.selector).oninput = e => {
      const enabledServices = [];
      let enabledCount = 0;
      servicesInfo.forEach(_svInfo => {
        if ($(_svInfo.selector).checked) {
          enabledCount++;
        }
      });
      if (enabledCount === 0 || enabledCount === 1 && $("#btnEnableDeepL").checked) {
        if (e.target === $("#btnEnableGoogle")) {
          $("#btnEnableBing").checked = true;
        } else {
          $("#btnEnableGoogle").checked = true;
        }
      }
      servicesInfo.forEach(_svInfo => {
        if ($(_svInfo.selector).checked) {
          enabledServices.push(_svInfo.svName);
        }
      });
      if (!enabledServices.includes(twpConfig.get("textTranslatorService"))) {
        twpConfig.set("textTranslatorService", enabledServices[0]);
      }
      if (!enabledServices.includes(twpConfig.get("pageTranslatorService"))) {
        twpConfig.set("pageTranslatorService", enabledServices[0]);
      }
      chrome.runtime.sendMessage({
        action: "restorePagesWithServiceNames",
        serviceNames: pageTranslationServices.filter(svName => !enabledServices.includes(svName)),
        newServiceName: twpConfig.get("pageTranslatorService")
      }, checkedLastError);
      twpConfig.set("enabledServices", enabledServices);
      $("#pageTranslatorService").value = twpConfig.get("pageTranslatorService");
      $("#textTranslatorService").value = twpConfig.get("textTranslatorService");
      updateServiceSelector(enabledServices);
    };
  });
  servicesInfo.forEach(svInfo => {
    $(svInfo.selector).checked = twpConfig.get("enabledServices").includes(svInfo.svName);
  });
  updateServiceSelector(twpConfig.get("enabledServices"));

  // storage options
  $("#deleteTranslationCache").onclick = e => {
    if (confirm(twpI18n.getMessage("doYouWantToDeleteTranslationCache"))) {
      chrome.runtime.sendMessage({
        action: "deleteTranslationCache",
        reload: true
      }, checkedLastError);
    }
  };
  $("#enableDiskCache").oninput = e => {
    twpConfig.set("enableDiskCache", $("#enableDiskCache").value);
  };
  $("#enableDiskCache").value = twpConfig.get("enableDiskCache");
  $("#backupToFile").onclick = e => {
    const configJSON = twpConfig.export();
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(configJSON));
    element.setAttribute("download", "twp-backup_" + new Date().toISOString().replace(/T/, "_").replace(/\..+/, "").replace(/\:/g, ".") + ".txt");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };
  $("#restoreFromFile").onclick = e => {
    const element = document.createElement("input");
    element.setAttribute("type", "file");
    element.setAttribute("accept", "text/plain");
    element.style.display = "none";
    document.body.appendChild(element);
    element.oninput = e => {
      const input = e.target;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          if (confirm(twpI18n.getMessage("doYouWantOverwriteAllSettings"))) {
            twpConfig.import(reader.result);
          }
        } catch (e) {
          alert(twpI18n.getMessage("fileIsCorrupted"));
          console.error(e);
        }
      };
      reader.readAsText(input.files[0]);
    };
    element.click();
    document.body.removeChild(element);
  };
  $("#resetToDefault").onclick = e => {
    if (confirm(twpI18n.getMessage("doYouWantRestoreSettings"))) {
      twpConfig.restoreToDefault();
    }
  };

  // others options
  $("#showPopupMobile").onchange = e => {
    twpConfig.set("showPopupMobile", e.target.value);
  };
  $("#showPopupMobile").value = twpConfig.get("showPopupMobile");
  $("#showTranslatePageContextMenu").onchange = e => {
    twpConfig.set("showTranslatePageContextMenu", e.target.value);
  };
  $("#showTranslatePageContextMenu").value = twpConfig.get("showTranslatePageContextMenu");
  $("#showTranslateSelectedContextMenu").onchange = e => {
    twpConfig.set("showTranslateSelectedContextMenu", e.target.value);
  };
  $("#showTranslateSelectedContextMenu").value = twpConfig.get("showTranslateSelectedContextMenu");
  $("#showButtonInTheAddressBar").onchange = e => {
    twpConfig.set("showButtonInTheAddressBar", e.target.value);
  };
  $("#showButtonInTheAddressBar").value = twpConfig.get("showButtonInTheAddressBar");
  $("#translateClickingOnce").onchange = e => {
    twpConfig.set("translateClickingOnce", e.target.value);
  };
  $("#translateClickingOnce").value = twpConfig.get("translateClickingOnce");
  $("#btnCalculateStorage").style.display = "inline-block";
  $("#storageUsed").style.display = "none";
  $("#btnCalculateStorage").onclick = e => {
    $("#btnCalculateStorage").style.display = "none";
    chrome.runtime.sendMessage({
      action: "getCacheSize"
    }, result => {
      checkedLastError();
      $("#storageUsed").textContent = result;
      $("#storageUsed").style.display = "inline-block";
    });
  };

  // LibreTranslate (text translation only)
  $("#addLibre").onclick = () => {
    const libre = {
      name: "libre",
      url: $("#libreURL").value,
      apiKey: $("#libreKEY").value
    };
    try {
      new URL(libre.url);
      if (libre.apiKey.length < 10) {
        throw new Error("Provides an API Key");
      }
      const customServices = twpConfig.get("customServices");
      const index = customServices.findIndex(cs => cs.name === "libre");
      if (index !== -1) {
        customServices.splice(index, 1);
      }
      customServices.push(libre);
      twpConfig.set("customServices", customServices);
      chrome.runtime.sendMessage({
        action: "createLibreService",
        libre
      });
    } catch (e) {
      alert(e);
    }
  };
  $("#removeLibre").onclick = () => {
    const customServices = twpConfig.get("customServices");
    const index = customServices.findIndex(cs => cs.name === "libre");
    if (index !== -1) {
      customServices.splice(index, 1);
      twpConfig.set("customServices", customServices);
      chrome.runtime.sendMessage({
        action: "removeLibreService"
      }, checkedLastError);
    }
    if (twpConfig.get("textTranslatorService") === "libre") {
      twpConfig.set("textTranslatorService", twpConfig.get("pageTranslatorService"));
    }
    $("#libreURL").value = "";
    $("#libreKEY").value = "";
  };
  const libre = twpConfig.get("customServices").find(cs => cs.name === "libre");
  if (libre) {
    $("#libreURL").value = libre.url;
    $("#libreKEY").value = libre.apiKey;
  }

  // DeepL (official API)
  const deeplKeyInput = $("#deeplKEY");
  const deeplUsage = $("#deeplUsage");
  const deeplStatus = $("#deeplStatus");
  const deeplMessage = $("#deeplApiResponse");
  const deeplCheckbox = $("#btnEnableDeepL");
  function setDeepLMessage(text, kind = "") {
    deeplMessage.textContent = text;
    deeplMessage.className = "message" + (kind ? " " + kind : "");
  }
  function setDeepLConnected(connected) {
    deeplStatus.hidden = !connected;
    deeplStatus.textContent = connected ? "Connected" : "";
    deeplStatus.classList.toggle("ok", connected);
  }
  function showDeepLUsage(usage) {
    const used = usage.character_count || 0;
    const limit = usage.character_limit || 0;
    const percent = limit ? Math.min(100, used / limit * 100) : 0;
    $("#deeplUsageFill").style.width = percent.toFixed(1) + "%";
    $("#deeplUsageText").textContent = `${used.toLocaleString()} / ${limit.toLocaleString()} characters used this billing period`;
    deeplUsage.hidden = false;
  }
  function deeplErrorText(response, body) {
    if (response.status === 403) return "DeepL rejected this key (403). Check that it is copied correctly.";
    if (response.status === 456) return "The DeepL quota for this key is used up.";
    if (response.status === 429) return "Too many requests to DeepL. Try again in a moment.";
    return "DeepL error: " + (body && body.message || "HTTP " + response.status);
  }
  // GET /v2/usage: the free plan (keys ending in :fx) uses api-free.deepl.com, everything else uses api.deepl.com
  async function requestDeepLUsage(apiKey) {
    const host = apiKey.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
    const response = await fetch(host + "/v2/usage", {
      headers: {
        Authorization: "DeepL-Auth-Key " + apiKey.trim()
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(deeplErrorText(response, body));
    }
    return body;
  }
  $("#toggleDeepLKey").onclick = () => {
    const showing = deeplKeyInput.type === "text";
    deeplKeyInput.type = showing ? "password" : "text";
    $("#toggleDeepLKey").textContent = showing ? "Show" : "Hide";
  };
  $("#addDeepL").onclick = async () => {
    const apiKey = deeplKeyInput.value.trim();
    if (!apiKey) {
      setDeepLMessage("Paste your DeepL API key first.", "error");
      return;
    }
    setDeepLMessage("Checking the key…");
    try {
      const usage = await requestDeepLUsage(apiKey);
      twpConfig.set("deeplApiKey", apiKey);
      const enabledServices = twpConfig.get("enabledServices");
      if (!enabledServices.includes("deepl")) {
        twpConfig.set("enabledServices", [...enabledServices, "deepl"]);
      }
      deeplCheckbox.disabled = false;
      deeplCheckbox.checked = true;
      updateServiceSelector(twpConfig.get("enabledServices"));
      setDeepLConnected(true);
      showDeepLUsage(usage);
      setDeepLMessage("Key saved. DeepL is ready to use.", "ok");
    } catch (e) {
      setDeepLConnected(false);
      deeplUsage.hidden = true;
      setDeepLMessage(e.message || String(e), "error");
    }
  };
  $("#removeDeepL").onclick = () => {
    twpConfig.set("deeplApiKey", "");
    deeplKeyInput.value = "";
    deeplUsage.hidden = true;
    setDeepLConnected(false);
    setDeepLMessage("Key removed. DeepL is disabled.");
    deeplCheckbox.checked = false;
    deeplCheckbox.disabled = true;
    let enabledServices = twpConfig.get("enabledServices").filter(sv => sv !== "deepl");
    if (enabledServices.length === 0) {
      enabledServices = ["google"];
    }
    twpConfig.set("enabledServices", enabledServices);
    if (twpConfig.get("textTranslatorService") === "deepl") {
      twpConfig.set("textTranslatorService", enabledServices[0]);
    }
    if (twpConfig.get("pageTranslatorService") === "deepl") {
      twpConfig.set("pageTranslatorService", enabledServices[0]);
    }
    updateServiceSelector(enabledServices);
    $("#pageTranslatorService").value = twpConfig.get("pageTranslatorService");
    $("#textTranslatorService").value = twpConfig.get("textTranslatorService");
  };
  const storedDeepLKey = twpConfig.get("deeplApiKey") || "";
  deeplCheckbox.disabled = !storedDeepLKey;
  if (storedDeepLKey) {
    deeplKeyInput.value = storedDeepLKey;
    requestDeepLUsage(storedDeepLKey).then(usage => {
      setDeepLConnected(true);
      showDeepLUsage(usage);
    }).catch(e => {
      setDeepLConnected(false);
      setDeepLMessage(e.message || String(e), "error");
    });
  }
});
window.scrollTo({
  top: 0
});

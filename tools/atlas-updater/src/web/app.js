// The helper window. It talks only to this helper (same address) and sends the token from the address bar.
// Text from the helper is always put in with textContent, never as HTML.
(function () {
  "use strict";

  var token = new URLSearchParams(location.search).get("t") || "";
  var folderSet = false;
  var selectedBrowser = null;
  var lastLink = null;

  function $(id) { return document.getElementById(id); }

  function call(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Atlas-Token": token },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, message: "The helper did not answer. Start it again." };
      });
    }).catch(function () {
      return { ok: false, message: "The helper is not running any more. Start it again." };
    });
  }

  function setResult(node, text, good) {
    node.textContent = text || "";
    node.classList.toggle("good", !!good);
  }

  function renderUpdate(s) {
    var text;
    var canInstall = false;
    if (s.latestError) {
      text = "Could not check for updates. " + s.latestError;
    } else if (s.fresh) {
      text = "The folder is empty. Install Atlas Translation " + s.latest + " here.";
      canInstall = true;
    } else if (s.installedError) {
      text = "This is not an Atlas Translation folder. " + s.installedError;
    } else if (s.updateAvailable) {
      text = "Version " + s.latest + " is ready. You have " + s.installed + ".";
      canInstall = true;
    } else {
      text = "You have the latest version (" + s.installed + ").";
    }
    $("updateText").textContent = text;
    $("installBtn").disabled = !canInstall;
  }

  function renderBrowsers(list) {
    var grid = $("browsers");
    if (grid.childElementCount) return;
    list.forEach(function (b) {
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.id = b.id;
      button.setAttribute("aria-pressed", "false");
      button.textContent = b.name;
      if (b.firefox) {
        var tag = document.createElement("small");
        tag.textContent = "Firefox Add-ons store";
        button.appendChild(tag);
      }
      button.addEventListener("click", function () { chooseBrowser(b.id); });
      grid.appendChild(button);
    });
  }

  function refresh(folder) {
    $("updateText").textContent = "Checking for updates\u2026";
    $("installBtn").disabled = true;
    return call("/api/status", { folder: folder }).then(function (s) {
      if (!s.browsers) {
        $("updateText").textContent = s.message || "Could not reach the helper.";
        return;
      }
      $("helperVersion").textContent = s.helperVersion;
      if (!folderSet) {
        $("folder").value = s.folder;
        folderSet = true;
      }
      renderUpdate(s);
      renderBrowsers(s.browsers);
    });
  }

  function chooseBrowser(id) {
    selectedBrowser = id;
    Array.prototype.forEach.call($("browsers").children, function (button) {
      button.setAttribute("aria-pressed", button.dataset.id === id ? "true" : "false");
    });
    showGuide();
  }

  function button(label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function showGuide() {
    if (!selectedBrowser) return;
    var folder = $("folder").value.trim();
    setResult($("guideResult"), "", false);
    call("/api/browser", { browser: selectedBrowser, folder: folder }).then(function (g) {
      if (!g.ok) {
        setResult($("guideResult"), g.message, false);
        return;
      }
      $("guide").hidden = false;
      $("guideTitle").textContent = g.name;
      var list = $("guideSteps");
      list.textContent = "";
      g.steps.forEach(function (step) {
        var li = document.createElement("li");
        li.textContent = step;
        list.appendChild(li);
      });
      var actions = $("guideActions");
      actions.textContent = "";
      lastLink = g.link;
      if (g.link) {
        actions.appendChild(button("Open the Firefox Add-ons page", function () {
          call("/api/open", { target: "store" }).then(function (r) { setResult($("guideResult"), r.message, r.ok); });
        }));
        actions.appendChild(button("Copy the link", function () {
          copy(lastLink, "Link copied.");
        }));
      } else if (!g.needsFolder) {
        actions.appendChild(button("Open the folder", function () {
          call("/api/open", { target: "folder", folder: $("folder").value.trim() }).then(function (r) {
            setResult($("guideResult"), r.message, r.ok);
          });
        }));
        actions.appendChild(button("Copy the folder path", function () {
          copy($("folder").value.trim(), "Folder path copied.");
        }));
      }
    });
  }

  function copy(text, done) {
    if (!navigator.clipboard) {
      setResult($("guideResult"), "Select the text and copy it by hand.", false);
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () { setResult($("guideResult"), done, true); },
      function () { setResult($("guideResult"), "Select the text and copy it by hand.", false); }
    );
  }

  // Offline translation: the pairing code, the offline engine and the language packs.
  function copyTo(node, text, done) {
    if (!navigator.clipboard) {
      setResult(node, "Select the text and copy it by hand.", false);
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () { setResult(node, done, true); },
      function () { setResult(node, "Select the text and copy it by hand.", false); }
    );
  }

  function setBusy(list, busy) {
    Array.prototype.forEach.call(list.querySelectorAll("button"), function (b) { b.disabled = busy; });
  }

  function packAction(path, pair, busyText) {
    setBusy($("packs"), true);
    setResult($("packsResult"), busyText, false);
    call(path, { pair: pair }).then(function (r) {
      setResult($("packsResult"), r.message, r.ok);
      return loadOffline();
    });
  }

  function renderPacks(packs) {
    var list = $("packs");
    list.textContent = "";
    packs.forEach(function (p) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.className = "pack-name";
      name.textContent = p.from.toUpperCase() + " \u2192 " + p.to.toUpperCase();
      var size = document.createElement("span");
      size.className = "pack-size";
      size.textContent = Math.round(p.bytes / 1000000) + " MB";
      li.appendChild(name);
      li.appendChild(size);
      if (p.installed) {
        var done = document.createElement("span");
        done.className = "installed";
        done.textContent = "Installed";
        li.appendChild(done);
        li.appendChild(button("Remove", function () {
          packAction("/api/packs/remove", p.pair, "Removing " + p.pair + "\u2026");
        }));
      } else {
        li.appendChild(button("Install", function () {
          packAction("/api/packs/install", p.pair, "Downloading and checking " + p.pair + "\u2026");
        }));
      }
      list.appendChild(li);
    });
  }

  function installEngine() {
    $("installEngine").disabled = true;
    setResult($("engineResult"), "Downloading and checking the engine\u2026", false);
    call("/api/engine/install", {}).then(function (r) {
      setResult($("engineResult"), r.message, r.ok);
      return loadOffline();
    });
  }

  function loadOffline() {
    return call("/api/packs", {}).then(function (s) {
      if (!s.packs) {
        $("offlineStatus").textContent = s.message || "The offline translation status is not available.";
        $("packs").textContent = "";
        return;
      }
      $("dataFolder").textContent = s.dataFolder || "";
      $("offlineStatus").textContent = s.apiRunning
        ? "The offline service runs on this computer, on port " + s.port + ". The extension uses it when Offline is chosen."
        : "The offline service is not running. " + (s.apiError || "");
      $("pairingCode").textContent = s.pairing || "";
      $("engineStatus").textContent = s.engine
        ? "The offline engine is installed."
        : (s.engineAsset ? "The offline engine is not installed yet." : "There is no offline engine for this system.");
      $("installEngine").textContent = s.engine ? "Update the offline engine" : "Install the offline engine";
      $("installEngine").disabled = !s.engineAsset;
      renderPacks(s.packs);
    });
  }

  function init() {
    if (!token) {
      $("tokenWarning").hidden = false;
      $("tokenWarning").textContent = "Open this page from the address the helper printed. It ends with ?t=... and every action needs it.";
      $("updateText").textContent = "The helper cannot check for updates from this page.";
      return;
    }
    $("useFolder").addEventListener("click", function () {
      folderSet = true;
      refresh($("folder").value.trim()).then(showGuide);
    });
    $("folder").addEventListener("keydown", function (e) {
      if (e.key === "Enter") $("useFolder").click();
    });
    $("installBtn").addEventListener("click", function () {
      var folder = $("folder").value.trim();
      $("installBtn").disabled = true;
      setResult($("installResult"), "Downloading and checking the release\u2026", false);
      call("/api/install", { folder: folder }).then(function (r) {
        setResult($("installResult"), r.message, r.ok);
        return refresh(folder);
      }).then(showGuide);
    });
    $("copyPairing").addEventListener("click", function () {
      copyTo($("pairingResult"), $("pairingCode").textContent, "Code copied.");
    });
    $("installEngine").addEventListener("click", installEngine);
    // Start at login: the state is read when the page opens, and a change is saved at once.
    call("/api/autostart", {}).then(function (r) { $("autostart").checked = !!r.enabled; });
    $("autostart").addEventListener("change", function () {
      var on = $("autostart").checked;
      call("/api/autostart", { enabled: on }).then(function (r) {
        $("autostart").checked = !!r.enabled;
        setResult($("autostartResult"), r.ok ? (r.enabled ? "On. The helper starts when you log in." : "Off.") : r.message, !!r.ok);
      });
    });
    // The start-up update check: the window asks for the latest release as soon as it opens.
    refresh("");
    loadOffline();
  }

  init();
})();

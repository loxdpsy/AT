const window = self;

// 1. Fix the "matchMedia is not defined" error
var matchMedia = self.matchMedia = function(query) {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: function() {},
    removeListener: function() {},
    addEventListener: function() {},
    removeEventListener: function() {},
    dispatchEvent: function() {}
  };
};

// 2. Fix the Button Actions for Manifest V3
if (chrome.action) {
  chrome.browserAction = chrome.action;
  chrome.pageAction = chrome.action;
}

// 3. Fix the 6 "duplicate id" Right-Click Menu errors
if (chrome.contextMenus) {
  const origCreate = chrome.contextMenus.create;
  chrome.contextMenus.create = function(props, callback) {
    if (props.contexts) {
      props.contexts = props.contexts.map(c => 
        (c === "browser_action" || c === "page_action") ? "action" : c
      );
      props.contexts = [...new Set(props.contexts)];
    }
    return origCreate.call(this, props, function() {
      const ignoreError = chrome.runtime.lastError; // Silences duplicate errors
      if (callback) callback();
    });
  };
}

// 4. Fix Internet Connection (Translates old XMLHttpRequest to modern Fetch)
var XMLHttpRequest = self.XMLHttpRequest = class {
  constructor() {
    this.headers = {};
    this.responseType = "";
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k, v) {
    this.headers[k] = v;
  }
  send(body) {
    fetch(this.url, { method: this.method, headers: this.headers, body: body })
      .then(async res => {
        this.status = res.status;
        this.readyState = 4;
        if (this.responseType === "json") {
          this.response = await res.json().catch(() => null);
        } else {
          this.responseText = await res.text();
          this.response = this.responseText;
        }
        if (this.onreadystatechange) this.onreadystatechange();
        if (this.onload) this.onload();
      })
      .catch(err => {
        if (this.onerror) this.onerror(err);
      });
  }
};

// 5. Load all the original TWP background files
importScripts(
  "lib/polyfill.js",
  "lib/checkedLastError.js",
  "lib/stuff.js",
  "lib/languages.js",
  "lib/config.js",
  "lib/platformInfo.js",
  "lib/i18n.js",
  "background/translationCache.js",
  "background/translationService.js",
  "background/textToSpeech.js",
  "background/background.js"
);
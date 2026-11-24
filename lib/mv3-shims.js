// Shims that let the original (MV2-era) background code run under Manifest V3.
// They are loaded first, both by the Chromium service worker (service_worker.js) and
// by the Firefox MV3 event page (background.scripts). Every shim only fills a gap,
// so the native API is used whenever the browser provides it.

if (typeof self.window === "undefined") self.window = self;

// 1. matchMedia does not exist in service workers. Some shared code calls it.
if (typeof self.matchMedia !== "function") self.matchMedia = function (query) {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    }
  };
};

// 2. MV3 has a single toolbar action (chrome.action). browserAction and pageAction are
//    kept as aliases so the original code keeps working. The MV2 pageAction show/hide
//    calls become enable/disable on the action (per tab when a tabId is given).
if (chrome.action) {
  const action = chrome.action;
  if (!chrome.browserAction) chrome.browserAction = action;
  const pageAction = {
    setIcon: details => action.setIcon(details),
    setPopup: details => action.setPopup(details),
    setTitle: details => action.setTitle(details),
    show: tabId => action.enable(tabId),
    hide: tabId => action.disable(tabId),
    onClicked: action.onClicked
  };
  if (typeof action.openPopup === "function") {
    pageAction.openPopup = (...args) => action.openPopup(...args);
  }
  if (!chrome.pageAction) chrome.pageAction = pageAction;
}

// 3. XMLHttpRequest is not available in service workers. This small implementation is
//    built on fetch() and covers the parts the translation services use: open/send/headers,
//    readyState events (onreadystatechange, onload, onerror, onabort, ontimeout, onloadend),
//    responseText/response/status, getResponseHeader, abort and timeout.
if (typeof self.XMLHttpRequest === "undefined") self.XMLHttpRequest = class XMLHttpRequest {
  constructor() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = "";
    this.response = null;
    this.responseText = "";
    this.responseType = "";
    this.timeout = 0;
    this.withCredentials = false;
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.onabort = null;
    this.ontimeout = null;
    this.onloadend = null;
    this._headers = {};
    this._listeners = {};
    this._responseHeaders = null;
    this._controller = null;
    this._timer = null;
    this._timedOut = false;
  }
  open(method, url) {
    this.method = String(method || "GET").toUpperCase();
    this.url = String(url);
    this._headers = {};
    this._setState(1);
  }
  setRequestHeader(name, value) {
    this._headers[name] = value;
  }
  getResponseHeader(name) {
    return this._responseHeaders ? this._responseHeaders.get(name) : null;
  }
  getAllResponseHeaders() {
    if (!this._responseHeaders) return "";
    let out = "";
    this._responseHeaders.forEach((value, key) => {
      out += key + ": " + value + "\r\n";
    });
    return out;
  }
  overrideMimeType() {}
  addEventListener(type, listener) {
    (this._listeners[type] = this._listeners[type] || []).push(listener);
  }
  removeEventListener(type, listener) {
    const list = this._listeners[type] || [];
    const index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
  }
  abort() {
    if (this._controller) this._controller.abort();
  }
  send(body) {
    this._timedOut = false;
    this._controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (this.timeout > 0) {
      this._timer = setTimeout(() => {
        this._timedOut = true;
        if (this._controller) this._controller.abort();
      }, this.timeout);
    }
    const hasBody = this.method !== "GET" && this.method !== "HEAD" && body !== undefined;
    const init = {
      method: this.method,
      headers: this._headers,
      credentials: this.withCredentials ? "include" : "omit",
      body: hasBody ? body : undefined,
      signal: this._controller ? this._controller.signal : undefined
    };
    fetch(this.url, init).then(
      response => this._readResponse(response),
      error => this._fail(error)
    );
  }
  async _readResponse(response) {
    try {
      this.status = response.status;
      this.statusText = response.statusText;
      this._responseHeaders = response.headers;
      this._setState(2);
      this._setState(3);
      if (this.responseType === "arraybuffer") {
        this.response = await response.arrayBuffer();
        this.responseText = "";
      } else if (this.responseType === "blob") {
        this.response = await response.blob();
        this.responseText = "";
      } else {
        this.responseText = await response.text();
        if (this.responseType === "json") {
          try {
            this.response = JSON.parse(this.responseText);
          } catch (e) {
            this.response = null;
          }
        } else {
          this.response = this.responseText;
        }
      }
    } catch (error) {
      this._fail(error);
      return;
    }
    this._finish();
    this._fire("load");
    this._fire("loadend");
  }
  _fail(error) {
    const aborted = !this._timedOut && error && error.name === "AbortError";
    this.status = 0;
    this.statusText = "";
    this.response = null;
    this.responseText = "";
    this._finish();
    if (this._timedOut) {
      this._fire("timeout");
    } else if (aborted) {
      this._fire("abort");
    } else {
      this._fire("error");
    }
    this._fire("loadend");
  }
  _finish() {
    clearTimeout(this._timer);
    this._timer = null;
    this._controller = null;
    this._setState(4);
  }
  _setState(state) {
    this.readyState = state;
    this._fire("readystatechange");
  }
  _fire(type) {
    const event = { type, target: this, currentTarget: this };
    const handler = this["on" + type];
    if (typeof handler === "function") {
      try {
        handler.call(this, event);
      } catch (e) {
        console.error(e);
      }
    }
    for (const listener of this._listeners[type] || []) {
      try {
        listener.call(this, event);
      } catch (e) {
        console.error(e);
      }
    }
  }
};

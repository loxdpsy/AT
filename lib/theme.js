"use strict";

/*
 * Theme for the settings page and the popup.
 * Preference values match the "darkMode" setting: "auto" (follow the system), "yes" (dark), "no" (light).
 * The choice is cached in localStorage. Extension pages share that storage, so the page paints in the
 * right theme straight away, before the settings finish loading.
 */
(function () {
  const KEY = "atlasThemePreference";

  function preference() {
    try {
      return localStorage.getItem(KEY) || "auto";
    } catch (e) {
      return "auto";
    }
  }

  function isDark(pref) {
    if (pref === "yes") return true;
    if (pref === "no") return false;
    return !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function apply() {
    document.documentElement.classList.toggle("dark", isDark(preference()));
    applyLook();
  }

  // Text size and text direction for the extension pages. Both are cached in localStorage, like the theme.
  const SIZE_KEY = "atlasTextSize";
  const DIRECTION_KEY = "atlasTextDirection";
  const SIZES = { normal: "1", large: "1.15", xlarge: "1.3" };
  let pageDirection = null;

  function stored(key, allowed, fallback) {
    try {
      const value = localStorage.getItem(key);
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function applyLook() {
    const root = document.documentElement;
    if (pageDirection === null) pageDirection = root.getAttribute("dir");
    const size = stored(SIZE_KEY, Object.keys(SIZES), "normal");
    root.style.zoom = size === "normal" ? "" : SIZES[size];
    const direction = stored(DIRECTION_KEY, ["auto", "ltr", "rtl"], "auto");
    if (direction === "auto") {
      if (pageDirection) root.setAttribute("dir", pageDirection);
      else root.removeAttribute("dir");
    } else {
      root.setAttribute("dir", direction);
    }
  }

  window.twpTheme = {
    set(pref) {
      try {
        localStorage.setItem(KEY, pref);
      } catch (e) {}
      apply();
    },
    apply,
  };

  window.twpLook = {
    setTextSize(value) {
      try {
        localStorage.setItem(SIZE_KEY, value);
      } catch (e) {}
      applyLook();
    },
    setDirection(value) {
      try {
        localStorage.setItem(DIRECTION_KEY, value);
      } catch (e) {}
      applyLook();
    },
    getTextSize() {
      return stored(SIZE_KEY, Object.keys(SIZES), "normal");
    },
    getDirection() {
      return stored(DIRECTION_KEY, ["auto", "ltr", "rtl"], "auto");
    },
  };

  apply();
  if (window.matchMedia) {
    // When the preference is "auto", follow the system theme as it changes.
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  }
})();

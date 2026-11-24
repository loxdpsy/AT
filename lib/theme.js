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

  apply();
  if (window.matchMedia) {
    // When the preference is "auto", follow the system theme as it changes.
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  }
})();

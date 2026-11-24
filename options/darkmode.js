"use strict";

// Dark mode is a class on <html>; the colors live in options.css (:root.dark).
var $ = document.querySelector.bind(document);
function enableDarkMode() {
  sessionStorage.setItem("darkModeIsEnabled", "yes");
  document.documentElement.classList.add("dark");
}
if (sessionStorage.getItem("darkModeIsEnabled") === "yes") {
  enableDarkMode();
}
function disableDarkMode() {
  sessionStorage.setItem("darkModeIsEnabled", "no");
  document.documentElement.classList.remove("dark");
}

"use strict";

let $ = document.querySelector.bind(document);
const selectTargetLanguage = $("select");
$("#btnClose").addEventListener("click", () => {
  window.location = "popup.html";
});
$("#btnApply").addEventListener("click", () => {
  twpConfig.setTargetLanguage(selectTargetLanguage.value, true);
  window.location = "popup.html";
});
twpConfig.onReady().then(() => twpI18n.updateUiMessages()).then(() => {
  twpI18n.translateDocument();
  let langs = twpLang.getLanguageList();
  const langsSorted = [];
  for (const i in langs) {
    langsSorted.push([i, langs[i]]);
  }
  langsSorted.sort(function (a, b) {
    return a[1].localeCompare(b[1]);
  });
  const eAllLangs = selectTargetLanguage.querySelector('[name="all"]');
  langsSorted.forEach(value => {
    const option = document.createElement("option");
    option.value = value[0];
    option.textContent = value[1];
    eAllLangs.appendChild(option);
  });
  const eRecentsLangs = selectTargetLanguage.querySelector('[name="targets"]');
  for (const value of twpConfig.get("targetLanguages")) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = langs[value];
    eRecentsLangs.appendChild(option);
  }
  selectTargetLanguage.value = twpConfig.get("targetLanguages")[0];
  const darkPref = twpConfig.get("darkMode");
  twpTheme.set(["auto", "yes", "no"].includes(darkPref) ? darkPref : "auto");
});

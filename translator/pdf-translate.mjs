// PDF translation in the Translator page. The text is read with pdf.js (lib/pdfjs) on this computer, then each batch of
// paragraphs goes to the offline helper through the "translateTextOnly" message. That message never falls back to another
// service, so the PDF text does not leave this computer. Scanned PDFs (no text layer) are not supported.
import * as pdfjs from "../lib/pdfjs/pdf.min.mjs";

export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_PAGES = 300;

// Reads the text of every page. Returns one array of paragraphs per page.
export async function extractPages(data, options = {}) {
  const doc = await pdfjs.getDocument({
    data,
    cMapUrl: options.cMapUrl,
    cMapPacked: true,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false
  }).promise;
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages. The limit is ${MAX_PAGES}.`);
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items
        .filter(item => typeof item.str === "string")
        .map(item => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || Math.abs(item.transform[3]),
          eol: item.hasEOL
        }));
      const paragraphs = TwpPdfText.buildParagraphs(TwpPdfText.groupLines(items))
        .flatMap(paragraph => TwpPdfText.splitLong(paragraph));
      pages.push(paragraphs);
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

// Sends one request to the background and resolves with its results. Errors come back as readable messages.
export function sendOfflineOnly(request) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, reply => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      if (!reply) return reject(new Error("The extension did not answer. Reload the page and try again."));
      if (reply.error) return reject(new Error(reply.error));
      resolve(reply.results || []);
    });
  });
}

// Translates every paragraph of every page, batch by batch. Returns the same shape as `pages`.
export async function translatePages(pages, source, target, onProgress = () => {}) {
  const texts = pages.flat();
  const translated = [];
  for (const batch of TwpPdfText.batches(texts)) {
    const results = await sendOfflineOnly({
      action: "translateTextOnly",
      translationService: "offline",
      sourceLanguage: source,
      targetLanguage: target,
      sourceArray: batch
    });
    if (results.length !== batch.length) throw new Error("The translation returned fewer results than expected.");
    translated.push(...results);
    onProgress(translated.length, texts.length);
  }
  let k = 0;
  return pages.map(paragraphs => paragraphs.map(() => translated[k++]));
}

// The offline helper translates only between English and one other language, so one side must be English.
export function offlinePairAllowed(source, target) {
  return source !== target && (source === "en" || target === "en");
}

// ---- The page part (only runs in the Translator page) ----
function setupPdfPanel() {
  const $ = id => document.getElementById(id);
  const offline = twpLang.SupportedLanguages.offline.slice().sort((a, b) =>
    twpLang.codeToLanguage(a).localeCompare(twpLang.codeToLanguage(b)));
  for (const id of ["pdfSource", "pdfTarget"]) {
    const select = $(id);
    select.replaceChildren();
    for (const code of offline) select.append(new Option(twpLang.codeToLanguage(code), code));
  }
  $("pdfSource").value = "en";
  $("pdfTarget").value = offline.includes("fr") ? "fr" : offline[0];
  // The PDF prompt opens this page with ?from=, ?to=, ?pdf= (the address) and ?auto=1 (start at once).
  const params = new URLSearchParams(location.search);
  if (offline.includes(params.get("from"))) $("pdfSource").value = params.get("from");
  if (offline.includes(params.get("to"))) $("pdfTarget").value = params.get("to");
  if (params.get("pdf")) $("pdfUrl").value = params.get("pdf");

  let lastOriginal = null; // the paragraphs of each page, as read from the PDF
  let lastTranslated = null; // the same shape, translated

  function setStatus(message, isError = false) {
    const el = $("pdfStatus");
    el.textContent = message;
    el.classList.toggle("error", isError);
  }

  async function readInput() {
    const file = $("pdfFile").files[0];
    if (file) {
      if (file.size > MAX_BYTES) throw new Error("The file is larger than 50 MB.");
      return await file.arrayBuffer();
    }
    const value = $("pdfUrl").value.trim();
    let url;
    try {
      url = new URL(value);
    } catch (e) {
      throw new Error("Choose a PDF file, or enter the web address of a PDF.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("The address must start with https:// or http://.");
    const response = await fetch(url.href);
    if (!response.ok) throw new Error(`The PDF could not be downloaded (HTTP ${response.status}).`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new Error("The file is larger than 50 MB.");
    return buffer;
  }

  // Shows the translation. With "Show original", each paragraph's source text is shown under its translation.
  function render() {
    const result = $("pdfResult");
    result.replaceChildren();
    const showOriginal = $("pdfShowOriginal").checked;
    lastTranslated.forEach((paragraphs, index) => {
      if (paragraphs.length === 0) return;
      const section = document.createElement("section");
      section.className = "pdfPage";
      const heading = document.createElement("h3");
      heading.textContent = `Page ${index + 1}`;
      section.append(heading);
      paragraphs.forEach((paragraph, i) => {
        const p = document.createElement("p");
        p.textContent = paragraph;
        section.append(p);
        if (showOriginal) {
          const original = document.createElement("p");
          original.className = "pdfOriginal";
          original.textContent = lastOriginal[index][i];
          section.append(original);
        }
      });
      result.append(section);
    });
    $("pdfActions").hidden = !lastTranslated.some(p => p.length > 0);
  }

  function plainText(pages) {
    return pages
      .map((paragraphs, index) => (paragraphs.length ? `Page ${index + 1}\n\n${paragraphs.join("\n\n")}` : ""))
      .filter(Boolean)
      .join("\n\n");
  }

  // The document's language, guessed from its text. When it is clear and the offline pair works, From is set to it.
  // Returns the language to translate from, or null when the choice does not work (the status says why).
  function chooseSource(pages, chosen, target) {
    const sample = pages.flat().join(" ").slice(0, 4000);
    const guess = TwpPdfText.detectLanguage(sample, offline);
    if (!guess || guess.code === chosen) return { source: chosen, note: "" };
    const name = twpLang.codeToLanguage(guess.code) || guess.code;
    if (offlinePairAllowed(guess.code, target)) {
      $("pdfSource").value = guess.code;
      return { source: guess.code, note: ` The document looks like ${name}, so From is set to ${name}.` };
    }
    setStatus(`The document looks like ${name}. Offline translation needs English on one side, so choose From again.`, true);
    return null;
  }

  async function translate() {
    const chosen = $("pdfSource").value;
    const target = $("pdfTarget").value;
    $("pdfResult").replaceChildren();
    $("pdfActions").hidden = true;
    lastTranslated = null;
    if (!offlinePairAllowed(chosen, target)) {
      setStatus("Offline translation needs English on one side, for example English to French.", true);
      return;
    }
    $("btnPdfTranslate").disabled = true;
    try {
      setStatus("Reading the PDF...");
      const buffer = await readInput();
      const pages = await extractPages(new Uint8Array(buffer), { cMapUrl: chrome.runtime.getURL("lib/pdfjs/cmaps/") });
      const count = pages.flat().length;
      if (count === 0) {
        setStatus("No text was found. Scanned PDFs (images of text) cannot be translated here.", true);
        return;
      }
      const choice = chooseSource(pages, chosen, target);
      if (choice === null) return;
      setStatus(`Translating ${count} paragraphs...${choice.note}`);
      const translated = await translatePages(pages, choice.source, target, (done, total) => {
        setStatus(`Translating... ${done} of ${total} paragraphs.${choice.note}`);
      });
      lastOriginal = pages;
      lastTranslated = translated;
      render();
      setStatus(`Translated ${count} paragraphs. Nothing was sent to an online service.${choice.note}`);
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error), true);
    } finally {
      $("btnPdfTranslate").disabled = false;
    }
  }

  $("btnPdfTranslate").addEventListener("click", translate);
  $("pdfUrl").addEventListener("keydown", event => {
    if (event.key === "Enter") translate();
  });
  $("pdfShowOriginal").addEventListener("change", () => {
    if (lastTranslated) render();
  });
  $("pdfCopy").addEventListener("click", () => {
    if (lastTranslated && navigator.clipboard) navigator.clipboard.writeText(plainText(lastTranslated)).catch(() => {});
  });
  $("pdfDownload").addEventListener("click", () => {
    if (!lastTranslated) return;
    const blob = new Blob([plainText(lastTranslated)], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "translation.txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  if (params.get("auto") === "1" && params.get("pdf")) translate();
}

if (typeof document !== "undefined" && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.mjs");
  // The language lists need the settings' UI language, so the panel is set up after the page loads.
  twpConfig.onReady().then(() => setupPdfPanel());
}

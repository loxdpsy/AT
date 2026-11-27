"use strict";
/*
 * Turns the text items of a PDF page into lines and paragraphs, and splits them into batches for translation.
 * Plain functions with no browser APIs: translator/pdf-translate.mjs uses them, and tests/unit/pdfText.test.mjs runs them.
 *
 * An item: { str, x, y, width, height, eol }. x and y are in PDF points (y grows upwards).
 */
var TwpPdfText = (function () {
  const DEFAULT_HEIGHT = 10;

  // Items on the same line (same y, within half a line) become one line. Lines come top to bottom.
  function groupLines(items) {
    const parts = (items || [])
      .filter(i => i && typeof i.str === "string" && i.str.length > 0)
      .map(i => ({
        str: i.str,
        x: Number(i.x) || 0,
        y: Number(i.y) || 0,
        width: Number(i.width) || 0,
        height: Number(i.height) || DEFAULT_HEIGHT,
        eol: Boolean(i.eol)
      }));
    parts.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const groups = [];
    for (const part of parts) {
      const current = groups[groups.length - 1];
      const tolerance = Math.max(part.height, current ? current.height : 0) * 0.5;
      if (current && Math.abs(current.y - part.y) <= tolerance) {
        current.parts.push(part);
        current.height = Math.max(current.height, part.height);
      } else {
        groups.push({ y: part.y, height: part.height, parts: [part] });
      }
    }
    const lines = [];
    for (const group of groups) {
      group.parts.sort((a, b) => a.x - b.x);
      let text = "";
      let end = null;
      for (const part of group.parts) {
        const gap = end === null ? 0 : part.x - end;
        if (end !== null && gap > part.height * 0.2 && !/\s$/.test(text) && !/^\s/.test(part.str)) text += " ";
        text += part.str;
        end = part.x + part.width;
      }
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean) lines.push({ text: clean, y: group.y, x: group.parts[0].x, height: group.height });
    }
    return lines;
  }

  // Lines that sit close together form a paragraph. A big gap, or a jump sideways (a new column), starts a new one.
  // A word split at the end of a line ("trans-") is joined to the next line when that line goes on in lower case.
  function buildParagraphs(lines) {
    const paragraphs = [];
    let current = null;
    let prev = null;
    for (const line of lines) {
      const newParagraph = prev === null
        || (prev.y - line.y) > line.height * 1.8
        || Math.abs(prev.x - line.x) > line.height * 6;
      if (newParagraph) {
        if (current !== null) paragraphs.push(current);
        current = line.text;
      } else if (/[A-Za-z\u00C0-\u024F]-$/.test(current) && /^[a-z\u00DF-\u00FF]/.test(line.text)) {
        current = current.slice(0, -1) + line.text;
      } else {
        current += " " + line.text;
      }
      prev = line;
    }
    if (current !== null) paragraphs.push(current);
    return paragraphs;
  }

  // A paragraph longer than maxChars is cut at a space, so one request never gets too much text.
  function splitLong(paragraph, maxChars = 1500) {
    const pieces = [];
    let rest = paragraph;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(" ", maxChars);
      if (cut <= 0) cut = maxChars;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
    return pieces;
  }

  // Batches of paragraphs for one translation request: at most maxItems paragraphs and about maxChars characters.
  function batches(paragraphs, maxItems = 20, maxChars = 4000) {
    const out = [];
    let batch = [];
    let chars = 0;
    for (const paragraph of paragraphs) {
      if (batch.length && (batch.length >= maxItems || chars + paragraph.length > maxChars)) {
        out.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push(paragraph);
      chars += paragraph.length;
    }
    if (batch.length) out.push(batch);
    return out;
  }

  return { groupLines, buildParagraphs, splitLong, batches };
})();

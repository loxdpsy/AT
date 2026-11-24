# Privacy policy for Atlas Translation

Last updated: 2026-11-24. Applies to Atlas Translation version 0.0.1.0 and later.

This policy describes what the Atlas Translation browser extension does with your data. It is written for people who install the extension and for the stores that list it (Microsoft Edge Add-ons, Firefox Add-ons).

## Summary

- The extension has **no accounts, no analytics, and no telemetry**. The project's maintainers do not receive your browsing data, your text, or your settings.
- Text is sent to a translation service **only when you ask for a translation**: a whole page, a selection, or a word.
- Your settings, API keys, and translation cache are stored **only on your computer**, in the browser's extension storage.
- Each translation service you choose handles the text under its own privacy policy.

## Who is responsible

Atlas Translation is maintained by its repository owner at https://github.com/loxdpsy/AT. It is a modified fork of *TWP - Translate Web Pages* by FilipePS (MPL-2.0). For privacy questions, open a GitHub issue. For security problems, use the private reporting option described in the README. Do not put private information in a public issue.

## Data the extension handles

**Text you ask to translate.** When you translate a page, a selection, or a word, the extension sends that text to the translation service you selected in *Translations*. It does not send text anywhere else.

**Language and site choices.** Your target language, "always translate" lists, and similar choices are kept on your computer.

**API keys.** If you enter a DeepL API key, it is kept on your computer. It is sent only to DeepL (`api.deepl.com` or `api-free.deepl.com`), to translate text or to check the key.

**LibreTranslate server address.** If you use a LibreTranslate server, the extension sends your text to the address you entered.

**Translation cache.** The extension keeps recent translations on your computer, so repeated text does not need another request. You can clear the cache in *Storage* in the settings. Removing the extension deletes the cache and all settings.

**Page addresses (hostnames).** The extension reads the hostname of the page you are on to apply your per-site settings. This happens on your computer. The hostname is not sent to the maintainers or to any service.

**Permission for PDF detection.** The extension reads each page's `Content-Type` header so it can recognise PDFs. It does not change or block requests.

## Services that receive data

| Service | When | What is sent | Their policy |
| --- | --- | --- | --- |
| Google Translate (`translate.googleapis.com`) | You choose Google and translate text | The text to translate and the language pair | https://policies.google.com/privacy |
| Microsoft Bing Translator (`edge.microsoft.com`) | You choose Bing and translate text | The text to translate and the language pair | https://privacy.microsoft.com/privacystatement |
| Yandex Translate (`translate.yandex.net`, `translate.yandex.com`) | You choose Yandex and translate text | The text to translate and the language pair | https://yandex.com/legal/privacy/ |
| Yandex session lookup (`translated.turbopages.org`) | Yandex is used for the first time, and then from time to time | A request for a public page. No text you translate is sent. | https://yandex.com/legal/privacy/ |
| DeepL (`api.deepl.com`, `api-free.deepl.com`) | You choose DeepL and translate text, or check your key | The text to translate, the language pair, and your API key | https://www.deepl.com/privacy |
| Your LibreTranslate server | You choose LibreTranslate | The text to translate and the language pair | Set by whoever runs that server |
| PDF helper sites (`pdf.translatewebpages.org`, `pdftohtml.translatewebpages.org`, `onlinedoctranslator.com`) | You choose *Translate PDF* and then a helper | The file you upload or the address you give | Each site's own policy. These sites are not run by this project. |

The extension does not send data to any other service. Its code ships inside the package and it does not load code from the internet while it runs.

The project's GitHub workflows (release builds and the update check) run on GitHub, not in your browser. They are not part of the extension.

## Permissions

- `<all_urls>`: lets the extension translate any page you open.
- `activeTab` and `contextMenus`: the toolbar button and the right-click menu.
- `storage`: settings, keys, and the cache.
- `webRequest`: reads the `Content-Type` header to detect PDFs. It does not change or block requests.
- `offscreen` (Chromium only): plays text-to-speech audio.
- `webNavigation` (optional): asked for only when you turn on *Automatically translate when clicking a link*.

## Keeping your data safe

- Keep your DeepL key private. Anyone who has it can use your quota. If it leaks, revoke it in your DeepL account and create a new one.
- Do not upload confidential documents to the PDF helper sites. Those files go to the sites, not through the extension.

## Your choices

- You can choose which translation service to use, or turn a service off.
- You can clear the translation cache in *Storage*.
- You can remove the extension at any time. This deletes all data the extension stored on your computer.
- You can use the extension without giving any API key. Google, Bing, and Yandex do not need one.

## Children

The extension is not directed at children under 13, and it does not collect information from anyone.

## Changes to this policy

When the extension's data handling changes, this file is updated and the change is noted in CHANGELOG.md.

## Contact

Open a GitHub issue at https://github.com/loxdpsy/AT/issues for general questions. Use GitHub's private vulnerability reporting for security problems.

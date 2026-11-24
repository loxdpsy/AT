# Publishing Atlas Translation in the stores

Each store needs an account, a listing, a privacy disclosure, and a package. The package comes from the release:
the Chromium **ZIP** is for Chrome and Edge, and the Firefox **ZIP** or **XPI** is for addons.mozilla.org.
Do not upload the `.crx`: stores only accept ZIP packages, and they sign the extension with their own key.

The four official channels are the Firefox Add-ons site, the Chrome Web Store, Microsoft Edge Add-ons, and Firefox for Android.
Firefox for Android uses the same Firefox Add-ons listing, so it does not need its own submission.

## Before you start: things every store asks for

- **Name, summary, and description.** Name: `Atlas Translation`. Use the description from `README.md`, and keep the credit to FilipePS.
- **Icon:** 128 × 128 PNG (`icons/icon-128.png`).
- **Screenshots:** at least one. Use 1280 × 800 or 640 × 400 PNG or JPEG.
- **License:** MPL-2.0 (LICENSE file).
- **Privacy policy URL.** Atlas Translation sends the text you translate to the translation provider you chose (Google, Bing, Yandex, DeepL, or LibreTranslate). Say so in the policy and in the store's privacy form. The policy must also say that Atlas Translation does not collect or sell data itself. The draft is in `docs/privacy-policy.md`. Use this URL in both stores: `https://github.com/loxdpsy/AT/blob/main/docs/privacy-policy.md`.
- **Support contact:** a GitHub issues link (`https://github.com/loxdpsy/AT/issues`) is enough.

## Chrome Web Store

1. Go to **https://chrome.google.com/webstore/devconsole** and sign in with a Google account.
2. Turn on **2-Step Verification** for that account. The store requires it.
3. Pay the one-time **US$5** developer registration fee and accept the developer agreement.
4. Click **New item**, then upload `atlas-translation-<version>-chromium.zip`.
5. Fill in the listing and the **Privacy practices** tab (data use, the privacy policy URL, and the single-purpose statement).
6. Submit for review. The first review usually takes a few days.

The store gives the extension its own ID. The `CRX_PRIVATE_KEY` is only for self-hosting, so it does not change the store ID.

## Microsoft Edge Add-ons

1. Go to **https://partner.microsoft.com/dashboard/microsoftedge** and sign in with a Microsoft account.
2. Create a Partner Center developer account. Registration is free. Individual accounts are enough.
3. Click **Create new extension**, then upload `atlas-translation-<version>-chromium.zip`. Edge accepts the same package as Chrome.
4. Fill in the listing, the privacy policy URL, and the data-use answers.
5. Submit for certification.

## Firefox (addons.mozilla.org) and Firefox for Android

1. Go to **https://addons.mozilla.org/developers/** and sign in with a Firefox Account.
2. Accept the developer agreement.
3. Upload the first version by hand, or let the workflow do it. Choose **On this site** (listed). Firefox for Android installs
   listed add-ons from the same listing, so there is no separate Android submission.
4. Fill in the listing: name, summary, description, category (*Language support*), license (MPL-2.0), and the privacy policy.
5. Do not submit a listed version until the listing is complete: icon, at least one screenshot, the description, and the privacy policy URL. A review of an empty listing is rejected or wasted time.
6. When it is ready, set the repository variables `AMO_CHANNEL` to `listed` and `AMO_LISTING_READY` to `true` (**Settings → Secrets and variables → Actions → Variables**). From then on, tags submit listed versions automatically, and Mozilla reviews each one before it goes public.

The automatic submission needs the secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` (see README, *Release secrets*).

## Automatic Edge submission

After the first manual submission, the release workflow can upload each new Chromium package and submit it for you.
Add three secrets (`EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`). The README explains where to find each one.
The workflow skips this step if a secret is missing. Edge certification still happens in Partner Center, and you
will get an email when it finishes.

## Checklist for each release

- [ ] Bump `version` in `manifest.json` and `firefox_manifest.json`, then add a `## <version>` section to `CHANGELOG.md`.
- [ ] Run `npm run check` and `npm run build`.
- [ ] Tag the commit (`git tag v<version>` and `git push origin v<version>`).
- [ ] Check the **Release** run summary and the **Firefox** AMO submission log.
- [ ] Upload the Chromium ZIP to the Chrome Web Store (not automated yet). Edge Add-ons is submitted by the release workflow when the `EDGE_*` secrets are set. Check the Edge job summary.

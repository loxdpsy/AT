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

Do these once by hand. After that, the release workflow can upload new versions for you.

1. **Create the developer account.** Go to **https://partner.microsoft.com/dashboard/microsoftedge** and sign in with a Microsoft account. Registration is free, and an individual account is enough. Accept the developer agreement and finish the identity check if Microsoft asks for it.
2. **Create the extension.** Click **Create new extension**. Enter the name **Atlas Translation**.
3. **Upload the package.** Upload `atlas-translation-0.0.1.0-chromium.zip` from the *Chromium build* run's artifacts (or build it with `npm run build`). Edge reads the version (0.0.1.0) from the package.
4. **Store listing.**
   - Name: Atlas Translation. Language: English.
   - Short description and description: copy from the top of `README.md`. Keep the credit to FilipePS.
   - Category: the closest language or productivity category Edge offers.
   - Store logo: `store/store-logo-300.png` (300 × 300).
   - Screenshots: `store/screenshots/1-settings-light.png`, `2-settings-dark.png`, `3-about-light.png` (1280 × 800).
   - Website and support: `https://github.com/loxdpsy/AT`, and the issues page `https://github.com/loxdpsy/AT/issues`.
   - Privacy policy URL: `https://github.com/loxdpsy/AT/blob/main/docs/privacy-policy.md`.
   - License: MPL-2.0.
5. **Privacy and permissions.** Answer the data questions from `docs/privacy-policy.md`: the text you translate is sent to the translation service you choose, and the developer does not collect data. In the permissions notes, explain each one, using the list in the README's *Security and privacy* section.
6. **Submit for certification.** Edge's review usually takes up to seven business days. You get an email when it finishes.
7. **Get the product ID.** Open the extension's **Overview** page and copy the **Product ID** (a GUID).
8. **Create the API credentials.** Open **Publish API** in Partner Center, click **Create API credentials**, and copy the **Client ID** and the **API key**. The key expires, so note the date.
9. **Add three secrets** in GitHub under **Settings → Secrets and variables → Actions → New repository secret**:
   - `EDGE_PRODUCT_ID`: the product ID from step 7.
   - `EDGE_CLIENT_ID`: the client ID from step 8.
   - `EDGE_API_KEY`: the API key from step 8.

After that, each release run uploads the Chromium package and submits it to Edge. If a secret is missing, the job is skipped and the summary says so.

## Firefox (addons.mozilla.org) and Firefox for Android

Firefox has two listings, with two add-on IDs. Both are published by the Release workflow:

- **GitHub** is the main distribution. Its ID is in `firefox_manifest.json`. With `submit_amo` on, the release signs the `.xpi` as an unlisted add-on, which is never listed publicly. The signed file is attached to the GitHub release.
- **Firefox store** is the public listing on addons.mozilla.org. It uses `FIREFOX_STORE_ID` in `.github/workflows/firefox.yml`. It is a different add-on from the GitHub one. The workflow sends it through the API, using the `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` secrets.

Steps:

1. Go to **https://addons.mozilla.org/developers/** and sign in with a Firefox Account. Accept the developer agreement.
2. Create the API keys (Developer Hub → **Manage API Keys**) and add them as `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` (see README, *Release secrets*).
3. Check the listing text in `.github/amo-metadata.json`: name, summary, description, category (*Productivity*), license (MPL-2.0), tags, and privacy policy.
4. Set the repository variable (or a secret) `AMO_LISTING_READY` to `true`. Until then the store step is skipped, so Mozilla never reviews an empty listing.
5. Run **Release** (`build-and-release`) with `submit_amo` on. Pushing a tag no longer sends anything. The store version is sent for review. The first version creates the store add-on.
6. Upload the screenshots from `store/screenshots/` once in the Developer Hub (**Manage listing → Screenshots**). The API cannot upload them. Later versions keep them.

Mozilla reviews every store version before it is public. Firefox for Android installs listed add-ons from the same store listing, so there is no separate Android submission.

## Checklist for each release

- [ ] Bump `version` in `manifest.json` and `firefox_manifest.json`, then add a `## <version>` section to `CHANGELOG.md`.
- [ ] Run `npm run check` and `npm run build`.
- [ ] Tag the commit (`git tag v<version>` and `git push origin v<version>`). A tag push does not publish; run **Release** by hand.
- [ ] Check the **Release** run summary and the **Firefox** AMO submission log.
- [ ] Upload the Chromium ZIP to the Chrome Web Store (not automated yet). Edge Add-ons is submitted by the release workflow when the `EDGE_*` secrets are set. Check the Edge job summary.

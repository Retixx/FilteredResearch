# Automatic Chrome updates

Chrome cannot auto-update an unpacked extension from GitHub. On Windows and macOS, normal automatic extension updates must be distributed through the Chrome Web Store. FilteredResearch therefore has two GitHub Actions paths:

- `CI` tests every change and attaches a load-unpacked ZIP to successful `main` runs.
- `Publish to Chrome Web Store` uploads and submits every eligible `main` change once the store secrets below exist.

## One-time setup

1. Register a Chrome Web Store developer account and manually create the first FilteredResearch item.
2. Complete its Store listing, Privacy, and Distribution tabs and publish the first version once.
3. In a Google Cloud project, enable the Chrome Web Store API, create OAuth credentials, and obtain a refresh token with the `https://www.googleapis.com/auth/chromewebstore` scope using the item owner's Google account.
4. Add these GitHub repository Actions secrets:

   - `CWS_CLIENT_ID`
   - `CWS_CLIENT_SECRET`
   - `CWS_REFRESH_TOKEN`
   - `CWS_PUBLISHER_ID`
   - `CWS_EXTENSION_ID`

5. Increase `version` in both `manifest.json` and `package.json` before each extension-code merge to `main`. Chrome Web Store rejects a package whose manifest version was not increased.

After Google approves each submitted update, Chrome installs it automatically for users of the Web Store version. Until the secrets exist, the publishing workflow safely skips the external upload while CI still builds the downloadable package.

Official setup reference: <https://developer.chrome.com/docs/webstore/using-api>

# Building a separate Code Academy Browser APK

The browser page is installable as a PWA using `browser-manifest.json`. That install prompt is not a download of an APK file. A separate Android package must be created, signed and published from the deployed HTTPS website.

## Create the Android package

1. Deploy the updated project to HTTPS and make sure this manifest is publicly reachable:

   `https://egyirprince609-oss.github.io/Code-Academy-/browser-manifest.json`

2. Install [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) on a machine with the required Node.js and Android build tools:

   ```sh
   npm install -g @bubblewrap/cli
   ```

3. Initialize a *separate* Trusted Web Activity project from the browser manifest. This uses the browser-only `start_url` and leaves the existing Code Academy app manifest untouched:

   ```sh
   bubblewrap init --manifest "https://egyirprince609-oss.github.io/Code-Academy-/browser-manifest.json" --directory ./build-browser-twa
   ```

4. During the interactive prompts, use a **new unique Android package ID**, for example `com.codeacademy.browser`, if that ID is available to you. Do not reuse `com.wm.codeacademy` for a second separately installable app. Confirm that the start URL remains under `/Code-Academy-/browser.html` and the scope remains under `/Code-Academy-/`. Create and securely back up the signing key and passwords. Never commit a keystore or passwords to this ZIP/repository.

5. Build the package:

   ```sh
   cd ./build-browser-twa
   bubblewrap build
   ```

   Bubblewrap's documented build outputs include a signed APK for installation/testing and an Android App Bundle (`.aab`) for Play Store release. Verify the generated filenames in the tool output and keep signing credentials safe. Official documentation: https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md

## Digital Asset Links

For a verified Trusted Web Activity, publish `/.well-known/assetlinks.json` at the **origin root** with the new package ID and the SHA-256 fingerprint of the certificate that signs that package. The current repository file refers to the existing Code Academy package and its certificate; do not copy that old entry blindly for the new package. If your site is served from a GitHub Pages *project path*, make sure the origin-root Digital Asset Links URL is actually publicly reachable; a file only at `/Code-Academy-/.well-known/assetlinks.json` may not satisfy the root-origin check. A custom domain or site-root deployment may be required for verified fullscreen TWA behavior.

## Important runtime boundary

A Bubblewrap APK wraps the deployed web app using a Trusted Web Activity; it does not add an independent Chrome/Opera/Tor browser engine, remove iframe restrictions, or create an automatic push sender. The bundled service worker can cache the Code Academy app shell. True background push still needs push subscription and sender configuration. If you require a native Android WebView or background services beyond a TWA, an Android Studio project with native source, manifest permissions, runtime permission flows, signing and device testing is a separate build task.

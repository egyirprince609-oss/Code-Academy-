# Code Academy Browser — native Android package

This is a separate Android Studio project for the browser. It does not replace the Code Academy app's root `manifest.json`, shared service worker, authentication, or existing APK/AAB files.

## What the Android shell does

- Uses Android System WebView (Chromium-based) to display sites as top-level pages, rather than putting the destination inside an iframe. This improves compatibility with sites that reject embedded frames.
- Keeps the address bar and native navigation/actions available while a site is open.
- Enables WebView Safe Browsing, validates HTTP(S) destinations, denies invalid TLS certificates, and keeps the JavaScript bridge out of third-party website views.
- Provides native file downloads, file chooser, requested camera/microphone/geolocation permissions, Android share sheet, and an on-screen progress bar.
- Uses WorkManager to check current headlines periodically when connected and, with permission, notify about new items while the app is not visible.
- Includes an FCM receiver. Real remote push is activated only after this package is registered in Firebase and `google-services.json` is added.
- Loads the hosted browser page first (to preserve the current site's auth/domain behavior), then falls back to the bundled browser files if the hosted page cannot be reached.

Some site providers, payment screens, and identity providers may still require the full Chrome browser or block embedded WebView usage for their own security policies. Safe Browsing is enabled; TLS certificate errors are not bypassed.

## Build the APK

**Requirements:** Android Studio (or Android SDK command-line tools), JDK 17, Android SDK Platform 35 and Build Tools 35.0.0.

From the repository root:

```bash
python3 browser-android/scripts/copy-assets.py
gradle -p browser-android :app:assembleDebug
```

The locally installable debug APK is created at:

```text
browser-android/app/build/outputs/apk/debug/app-debug.apk
```

Open the `browser-android` folder in Android Studio if you prefer the IDE. Gradle will resolve the AndroidX/WebView/WorkManager/Firebase libraries from Google's Maven repository.

## Build through GitHub Actions

The repository contains `.github/workflows/build-browser-apk.yml`. Push the project to GitHub, open **Actions → Build Code Academy Browser APK → Run workflow**, and download the `code-academy-browser-android-apks` artifact. It contains a debug-signed APK for device testing and an unsigned release APK for later signing.

**The source ZIP does not contain a precompiled APK.** This environment has no Android SDK/Gradle installation, and a release upload key was not provided. The workflow builds it on a runner with the Android toolchain.

## Prepare notifications

1. Create or select the Firebase project you intend to use for the browser.
2. Register an Android app with package ID `com.codeacademy.browser`.
3. Enable Firebase Cloud Messaging and download `google-services.json` into `browser-android/app/`.
4. Rebuild. The build automatically applies the Google Services Gradle plugin only when this file exists.
5. To send *remote* push notifications, configure a trusted server sender using Firebase Admin SDK credentials stored as server secrets and send messages to the `code-academy-browser` topic. Never put a service-account private key in browser JavaScript, HTML, the APK assets, or a public ZIP.
6. Users must enable browser notifications and grant Android's system notification permission. The bundled WorkManager headline notifications are local background updates, not a substitute for an FCM server push.

WorkManager periodic jobs are best-effort background work. Android may defer them for Doze, battery optimization, connectivity, or force-stop conditions; they are not guaranteed to fire at an exact minute.

## Google search provider

The browser client accepts either a Cloudflare Worker base URL (GET `/search`) or the included Academy Safe Browser API URL ending in `/api/search` (POST). Deploy the chosen backend over HTTPS and save that URL in Browser Settings. The browser Worker needs no secret, but providers may rate-limit scraping. The FastAPI backend combines configured SearXNG and optional Brave search; optional Google Programmable Search code is present only for legacy customers who already have credentials. Google states its Custom Search JSON API is unavailable to new customers and is scheduled for discontinuation on January 1, 2027.

For current headlines, deploy the API and use `/api/headlines`, or allow the browser's bounded publisher-feed fallbacks. A public browser cannot perform reliable, global full-web search by itself; a search index/API must be configured somewhere.

## Google Play release signing

The workflow's debug APK can be installed for testing, but it is **not** a Google Play release package. Configure a private release signing configuration with your own upload keystore and passwords stored in GitHub Actions secrets/Gradle environment variables before producing a signed release. Do not upload your existing Code Academy keystore or private passwords into this source archive.

## Update the browser code in the native package

Edit the web browser files in the repository root. The Android build workflow runs `scripts/copy-assets.py` to refresh the bundled copies before building. The hosted page is still expected to be published at `https://egyirprince609-oss.github.io/Code-Academy-/` unless the constants in `MainActivity.java` are updated for another domain.

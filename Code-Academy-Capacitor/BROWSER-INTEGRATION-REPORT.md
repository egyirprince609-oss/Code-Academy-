# Browser Integration Report

## Inspected source of truth

Archive: `Code-Academy--main.zip`; the Capacitor app lives in `Code-Academy-Capacitor/`. App ID / namespace is `com.wm.codeacademy`; Capacitor dependencies are v8.5.3; `www/` is the Capacitor web root. Existing Web Firebase authentication uses Firebase JS SDK 10.7.1 and project `codeacademybywm`. The inspected module supports email/password, Google sign-in (current main handler uses popup; a redirect-result helper exists), and phone OTP/reCAPTCHA. No native `google-services.json` or canonical Firestore rules file was found.

## Architecture chosen

Custom Android `WebView` screen and a local Capacitor plugin. The prior browser webpage was iframe-backed; it is now a launcher. The real page content lives in Android System WebView/Chromium, in its own Activity/process/data directory, not in the shell WebView. InAppBrowser was considered but does not provide the custom tab/database/permission/settings UI required here and its documented Android minimum SDK is not aligned with the existing minSdk 24.

## Files added

- `android/app/src/main/java/com/wm/codeacademy/browser/BrowserUrlParser.java`
- `android/app/src/main/java/com/wm/codeacademy/browser/BrowserStore.java`
- `android/app/src/main/java/com/wm/codeacademy/browser/BrowserActivity.java`
- `android/app/src/main/java/com/wm/codeacademy/browser/PrivateBrowserActivity.java`
- `android/app/src/main/java/com/wm/codeacademy/browser/BrowserPlugin.java`
- `BROWSER-ARCHITECTURE.md`
- `BROWSER-SECURITY-AND-PRIVACY.md`
- `BROWSER-TEST-PLAN.md`
- `BROWSER-INTEGRATION-REPORT.md`
- `BROWSER-README.md`
- `BROWSER-FIRESTORE-RULES-ADDON.txt`
- `previews/*` (labelled static design mockups; not screenshots from a running APK)

## Files modified

- `android/app/src/main/java/com/wm/codeacademy/MainActivity.java`: registers `CodeAcademyBrowser` through existing BridgeActivity.
- `android/app/src/main/AndroidManifest.xml`: adds non-exported normal/private browser Activities in dedicated processes.
- `android/app/build.gradle`: uses existing `androidx.webkit` version variable via `androidx.webkit:webkit` dependency.
- `native-src/index.js`: registers `CodeAcademyBrowser` and exposes open/sync adapter functions on existing `window.CodeAcademyNative`.
- `www/browser.html`: replaces the iframe browser UI with a native browser launcher and existing-auth optional sync panel.
- `www/menu.html`: Browser Settings link now opens `browser.html?settings=1`.
- repository root `browser.html`, `browser-settings.html` and `menu.html`: root browser page is changed to the clear native/system-browser fallback, the root settings route opens native settings, and root menu settings link follows the new route.
- `Code-Academy-Capacitor/www/browser-settings.html`: redirects to the browser launchers native-settings deep link.
- `BROWSER-README.md`: describes recent sites and removable new-tab shortcuts.

No existing Firebase Auth provider implementations, OAuth IDs, Firebase initialization, MainActivity count or other Code Academy page design was intentionally replaced. No new server, proxy, DNS endpoint or Admin SDK secret was added. No dependency on `@capacitor/inappbrowser` was added.

## Native browser operations

Real Android WebView navigation, native back/forward/reload/stop, tab switching and closing/restoring URL-based tab state, native bookmarks/history/download/settings/site info UI, Android DownloadManager, document picker for uploads, permission prompts, top-level metadata extraction, TLS error cancellation, Safe Browsing feature gating, WebView profile separation, local SQLite and local profile partitioning are implemented in source.

Important: the code has not yet been verified by a successful Android Gradle build/device test in this workspace. Treat runtime behavior as pending until the test matrix is run; a complete-looking source tree is not a compiled APK.

## Cloud data/auth changes

The launcher dynamically imports the existing `www/authentication.js` and Firebase Web Firestore 10.7.1 modules. If Firebase module loading fails, browser open/private/settings controls remain usable. Auth is the existing JS Firebase UID. Sync uses `users/{uid}/browserNativeBookmarks`, `users/{uid}/browserNativeHistory` (only opt-in), and `users/{uid}/browserSettings/nativePreferences`; offline/local records are preserved. Rules add-on provided separately. The add-on is not deployed and App Check is not asserted to be enabled.

## Dependencies / manifest / migration

- Existing runtime: Capacitor 8.5.3, Firebase Web SDK 10.7.1 as currently used by this project.
- Added native AndroidX WebKit dependency using the already-configured `$androidxWebkitVersion` (repository currently declares 1.14.0).
- Existing minSdk 24 is not raised. Private in-app WebView profile requires Android API 28+; earlier Android versions are directed to system browser.
- SQLite schema v3 defines fresh tables and 1→2 / 2→3 migrations without dropping existing bookmark/history records; the second migration adds download progress byte columns.
- No storage permission was added. Existing INTERNET permission is retained.

## Navigation changes

`menu.html`'s browser link still points to `browser.html`. The Browser Settings menu card opens `browser.html?settings=1`, which forwards to the native settings screen. The browser Activity closes back to the still-existing Code Academy shell Activity. Hosted/non-native `browser.html` no longer tries to embed websites and instead opens links in a system browser.

## Rollback

1. Restore `www/browser.html`, `www/menu.html`, root `browser.html`, root `menu.html`, `native-src/index.js`, `MainActivity.java`, `AndroidManifest.xml`, and `android/app/build.gradle` from the backup/original archive.
2. Remove `android/app/src/main/java/com/wm/codeacademy/browser/` and browser documentation/previews.
3. Run the normal `npm run build:native` and `npx cap sync android` pipeline.
4. Do not deploy the rules add-on unless reviewed and tested with the project's complete rules.

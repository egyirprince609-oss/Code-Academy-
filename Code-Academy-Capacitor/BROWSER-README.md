# Code Academy Browser — Android integration package

This is a native Android browser host integrated into the existing Capacitor app, not an iframe browser or second app. On Android 9+ the app uses Android System WebView/Chromium in a separate process and WebView data directory. The shell stays available behind the browser Activity.

## Before building

- Use the existing `Code-Academy-Capacitor/` project, not an unrelated new Android project.
- Current repository config is Capacitor 8.5.3, Android app ID `com.wm.codeacademy`, `webDir: "www"`, min SDK 24 and target/compile SDK 36.
- The app's current web Firebase session is in `www/authentication.js` (Firebase Web SDK 10.7.1; project `codeacademybywm`). Native browser cloud sync consumes that session; it does not add a new Google sign-in mechanism.
- Node/npm and a configured Android SDK/Gradle Java toolchain are required to produce an APK. This work session did not have an Android SDK configured, so don't interpret source generation as a successful APK build.

## Build the existing Android app

Run in Termux or another shell at the Capacitor project root:

```sh
cd Code-Academy-Capacitor
npm ci
npm run build:native
python3 scripts/inject-html-script.py www /capacitor-native.js code-academy-native
npx cap sync android
cd android
./gradlew assembleDebug
```

Expected debug APK, if Gradle/SDK setup succeeds:

`android/app/build/outputs/apk/debug/app-debug.apk`

Install with Android Debug Bridge from a computer that has `adb` and USB debugging configured:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

On a smartphone-only workflow, the build command can be run in Termux only if a working Android SDK/Gradle setup is installed/configured. Otherwise use the repository's GitHub Actions workflow or a properly configured cloud runner. The current workflow already performs the native Vite build, injection, Capacitor sync and Gradle assembly; trigger it only after reviewing the changed files.

## Runtime behavior

- `menu.html` → `browser.html` opens the real native browser Activity in an APK. `browser.html?settings=1` opens native settings.
- The browser auto-opens only after the existing Firebase Auth state resolves; a slow sign-in check shows a waiting message instead of silently opening the wrong device-local profile. If Auth module loading fails, the browser still opens with the device-local profile, and controls remain available.
- Android 9/API 28+ supports the isolated normal/private WebView data directories used here. On Android 7–8 (API 24–27), normal web browsing falls back to the system browser; native browser settings and isolated private sessions are unavailable. The app's min SDK was not raised.
- The browser screen supports normal HTTP/HTTPS page navigation, address/search parsing, back/forward/reload/stop, tabs with URL restoration, local bookmarks/history/settings/download records, Android DownloadManager, upload picker, site information/metadata previews, TLS error cancellation, and user-prompted permission requests.
- Logical tabs are capped at 12, and at most 3 WebViews remain live. Evicted tabs reload from URL. Websites' runtime/form state is not guaranteed to survive memory pressure or process death.

## Firebase sync setup

1. Sign in through the existing Code Academy login. No separate browser account is created.
2. Review `BROWSER-FIRESTORE-RULES-ADDON.txt`. The inspected project archive did not include its canonical Firestore rules file, so merge these nested matches/helper functions into the real rules, inspect for permissive overlapping rules, test with Firebase Rules Emulator, then deploy.
3. The browser can run signed out. When signed in, bookmarks and browser preferences may sync; history synchronization is OFF by default and must be explicitly enabled in native browser settings.
4. Firebase Web SDK persistence is attempted by the launcher. Local SQLite remains the source of truth for local browsing when offline. Existing website cookies and passwords are never synced.
5. If cloud records were deleted from the launcher, sync stays paused until you explicitly choose Resume sync. Local browser data remains on the device.
6. The browser sync code is not a claim that App Check is enabled. Configure/enforce App Check only after testing the existing app and all legitimate clients.

No Android `google-services.json` was present in the inspected archive. No native Credential Manager login was added because the web authentication module already owns Code Academy's Firebase Auth session. If the app later migrates to native Firebase Auth, that migration must explicitly bridge tokens/sessions and be separately tested.

## Previews

See `previews/README.md` and `previews/index.html`. All supplied PNGs are **static design mockups**, not screenshots from an installed APK.

## Rollback

Use `BROWSER-INTEGRATION-REPORT.md` to restore the exact changed HTML/native/config files from the original archive, delete the added native `browser/` Java package and restore the original build config. Do not deploy the rules add-on unless it has been merged and tested.

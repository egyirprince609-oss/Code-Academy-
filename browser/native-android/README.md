# Code Academy Browser — native WebView Android project

This is the standalone Android Studio project for the `browser/` folder. Its application ID is `com.codeacademy.browser`, separate from the main Code Academy learning app. It embeds the browser dashboard in a controlled dashboard WebView and opens destination websites in a separate top-level Android WebView so sites that refuse iframes can still load. It enables Android WebView Safe Browsing, rejects invalid TLS certificates rather than bypassing them, validates HTTP(S) navigation, uses Android file/media/location permission callbacks, and handles downloads in the native shell.

## Build in Android Studio / Termux with a configured Android SDK

From this directory (the `browser/native-android/` folder):

```bash
python3 scripts/copy-assets.py
gradle :app:assembleDebug
```

Or open `browser/native-android/` in Android Studio and build `app`. Requirements: JDK 17, Android SDK Platform 35, Build Tools 35.0.0, and network access to download Android/AndroidX Gradle dependencies. The APK is produced at `app/build/outputs/apk/debug/app-debug.apk`. No prebuilt APK or signing key is included.

## Default browser support

The main Activity declares HTTP/HTTPS `VIEW` intents and exposes a guarded native method that requests Android's browser role. In Settings, selecting “Check default-browser support” delegates to Android on this APK. Android displays the system confirmation; the app cannot silently make itself default.

## Security and provider setup

- HTTPS is used for remote content; cleartext traffic is disabled in the manifest. Explicit HTTP destinations may not load unless you configure a carefully scoped network security policy.
- Certificate errors are not ignored. If the destination's certificate is invalid, the app shows an error and blocks it.
- No third-party website is given the dashboard's JavaScript bridge; only the dashboard WebView receives the app bridge.
- Firebase email/Google/phone auth reuses the Code Academy `authentication.js` module copied into the browser folder. It uses the existing Firebase project and authentication identity pool; browser-specific preferences/profiles are additionally stored under `browserProfiles/{uid}`.
- To enable FCM push, register package ID `com.codeacademy.browser` in your intended Firebase project and add your `google-services.json` privately. Do not put service-account credentials into the repository.

`APP_BASE` in `MainActivity.java` points to the repository's GitHub Pages `browser/` directory. The shell falls back to the self-contained local assets when the configured host is unreachable. `scripts/copy-assets.py` copies all browser-owned local files into the APK assets.

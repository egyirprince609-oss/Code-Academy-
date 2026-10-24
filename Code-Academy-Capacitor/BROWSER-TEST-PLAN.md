# Browser Test Plan and Current Results

## Status definitions

- **PASS** = executed in this environment and the result was observed.
- **FAIL** = executed and the expected result did not occur.
- **BLOCKED** = a required emulator/device, SDK, Firebase console or credential is unavailable.
- **NOT RUN** = not executed in this work session.

## Environment observations

- Source archive exists and was extracted; Capacitor project and browser source were inspected.
- Node.js 22.16.0, npm 10.9.2 and Java 21 are present in this workspace.
- No `ANDROID_HOME` / `ANDROID_SDK_ROOT` was configured at the start. No emulator/device was attached to this container. `npm ci --no-audit --no-fund` was attempted but timed out after 120 seconds; its partial `node_modules` directory was removed. No package install completed.
- `android/app/google-services.json` is absent. No canonical `firestore.rules` was found in the archive.
- The source implementation has not been exercised against an installed Android System WebView on a device in this workspace.

## Test matrix (initial honest status)

| Test | Status | Evidence / remaining action |
|---|---|---|
| Inspect source, Capacitor config, existing auth, menu links | PASS | Existing project tree and relevant files inspected; report documents package/config/source files. |
| Verify official Capacitor/WebView/Firebase documentation | PASS | Official docs listed in `BROWSER-ARCHITECTURE.md`, checked 24 Oct 2026. |
| JavaScript syntax checks | PASS | `node --check` passed for `native-src/index.js` and extracted inline module from `www/browser.html` at the last syntax-check run; final archive build re-runs these checks. |
| XML/JSON/HTML structural scan | PASS | Python XML parser accepted Android manifest/resources; `package.json` and lockfile parse; browser launcher has 13 unique IDs. |
| Java syntax-category scan | PASS (limited) | `javac` produced no syntax-category diagnostics, but platform/package resolution fails because the Android SDK and Gradle dependencies are not present. This is not a compilation pass. |
| Gradle / Capacitor dependency resolution | BLOCKED | Android SDK environment missing; npm install timed out. No `cap sync` or Gradle assembly completed. |
| Central parser supports HTTP/HTTPS/domain/search/external/block schemes | NOT RUN | Unit/runtime tests should run on Android; manual static review completed only. |
| Load example.com and wikipedia.org in native WebView | BLOCKED | Requires built APK and Android device/emulator with network. |
| Missing-scheme domain / query / path / IDN / invalid input | BLOCKED | Requires built APK runtime. |
| Back/forward/reload/stop/redirect/new-window/close/restore tabs | BLOCKED | Requires built APK runtime. |
| Invalid certificate endpoint is blocked, no bypass | BLOCKED | Native callback explicitly cancels SSL errors; runtime endpoint/device verification remains. |
| 404/500 retained as site content, network/DNS failures native panel | BLOCKED | Device/network runtime required. |
| Offline/airplane mode, network changes, background and process recreation | BLOCKED | Physical device/emulator tests required. |
| SQLite bookmark/history/settings/download persistence | BLOCKED | Android runtime required. |
| Private profile isolation / no private history / clear on close | BLOCKED | Android 9+ runtime required; do not infer privacy guarantee until tested on devices. |
| Download PDF/image/generic file and open/share | BLOCKED | Device DownloadManager and compatible file handlers required. |
| File upload selection/cancel | BLOCKED | Android picker runtime required. |
| Camera/mic/location permission grant and denial | BLOCKED | Device runtime and user interaction required. |
| Metadata/title/description/favicon/OG preview extraction | BLOCKED | Native WebView/network execution required. |
| Existing Firebase sign-in/account switching preserved | NOT RUN | Existing auth files were inspected; no end-to-end sign-in session run. |
| Firestore own UID allowed / other UID denied / malformed data rejected | BLOCKED | Rules add-on not deployed; test the fully merged rules in Firebase Rules Emulator. |
| Offline local changes retry and two-device sync conflict resolution | BLOCKED | Requires Firebase rules setup and two authenticated installations. |
| Android Gradle assembleDebug / APK install | BLOCKED unless SDK becomes available | Check build output in handoff; do not assume success. |

The source implementation is not a substitute for runtime QA. After an APK is available, execute this matrix with at least Android 9 and a current Android release, and separately verify Firestore Rules in the emulator before production release.

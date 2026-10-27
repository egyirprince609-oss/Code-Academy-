# Code Academy Browser — Repair Report

**Repair batch:** October 24, 2026

## What changed

- The browser screen and settings pages keep the existing dark Code Academy look. The main toolbar stays visible while the content pane scrolls vertically.
- Removed the automatically opening, blocking installation dialog. Search/address entry remains available as soon as the browser UI starts.
- Reworked search and website navigation so the progress indicator always completes in a `finally` path. Firestore history/tab writes and notifications run in the background and cannot hold the search spinner open.
- Added a visible, selected-provider **Open full results** link for live Google/Bing/DuckDuckGo/Ecosia/Brave results, plus separately configurable trusted URL templates for Torch, Grams and FOC.
- Added clear network, DNS and website-preview error illustrations in SVG and PNG. Search failures retain the actual source error text and a retry action.
- PWA website previews now explain that a target site may reject iframe embedding and offer a full-tab link. The native Android WebView opens real websites directly and provides image-backed network-error UI.
- Copied the existing Code Academy `authentication.js` module and the project's login, sign-up, forgot-password and email-verification pages into this browser folder. The browser-specific copies use the Code Academy Browser branding and route verification/password-reset continuations back to the browser folder. Browser-specific preferences/profile data are stored under the user-owned browser profile document/subcollections.
- Updated the app icon variants using the original Code Academy logo.
- Added a six-section first-run tour and read-aloud controls using the device/browser Speech Synthesis service. The on-device guide is explicitly identified as a local help library; it does not claim to be a live cloud AI service.
- Added a current-site shortcut menu action. The Android APK requests an Android pinned shortcut for the current website; the PWA gives the supported Chrome “Add to Home screen” instructions instead of claiming it can silently pin a shortcut.
- Wired Android WebView policies for safe browsing, JavaScript, third-party cookies, HTTPS upgrading, Do Not Track on top-level navigations, and location/camera/microphone settings. Intrusive-ad filtering targets a conservative list of known ad/tracker endpoints when enabled.
- Added native private-session locking with Android device authentication and screenshot protection; the PWA signs out and requires browser-account re-authentication on return when the user enables private-session locking.
- Synchronized the source pages into the Android asset bundle and Capacitor `www` folder. The service-worker shell version was bumped so updated cached files can replace the old shell.

## Validation performed

- JavaScript syntax checked with `node --check` for the browser's top-level JavaScript files.
- Local HTML asset references and the service-worker shell list checked for missing files.
- PWA and Capacitor JSON configuration parsed.
- Android source checked for balanced braces and presence of the new bridge/permission/shortcut flows.

## Boundaries that remain important

- This project is a PWA/Android WebView browser, not a bundled Chromium engine. Some sites deliberately block iframe embedding. The PWA therefore opens those sites in a full browser tab; the Android app can show them in its native WebView.
- Full ranked search results inside the Code Academy Browser results panel require a deployed HTTPS search endpoint/API. Without one, the app uses available public lookup sources and exposes the selected search provider's real result page as a direct fallback.
- Android's native DNS resolver cannot be replaced by a normal web page or WebView preference. The DNS provider setting is diagnostic; configure Android Private DNS or a trusted VPN/DNS service for system-wide DNS-over-TLS/HTTPS.
- Some web permission APIs (USB, NFC, serial, local-network discovery and similar capabilities) are not available on every Android/WebView version. A preference switch cannot grant an Android system permission or create an unsupported API.
- Google does not expose a list of all signed-in Google accounts to an ordinary website. Account switching uses the existing Code Academy sign-out/sign-in workflow rather than pretending it can enumerate device accounts.
- Email verification and password-reset links require the GitHub Pages domain to be added to Firebase Authentication's **Authorized domains**. Browser-profile cloud synchronization requires the included Firestore rules add-on to be merged into and deployed with the project's existing rules.
- The Android APK was **not compiled or installed in this environment**. The native source and asset folders were updated, but a successful device build still needs Android SDK/Gradle tooling and on-device validation.

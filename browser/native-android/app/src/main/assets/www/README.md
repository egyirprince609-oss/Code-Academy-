# Code Academy Browser (standalone browser folder)

This folder is the separate Code Academy Browser web/PWA and Capacitor source. It leaves the learning-app pages outside this folder untouched. Deploy the `browser/` directory as a folder on an HTTPS host (for this repository's GitHub Pages deployment, paths resolve under `/Code-Academy-/browser/`). Open `index.html` to see the splash, then browser-specific sign-in/sign-up, onboarding, and browser home.

## Included workflow

- `index.html`: branded launch / authentication router.
- `login.html`, `signup.html`, `forgot.html`, `reset-password.html`: browser auth workflow, including email/password, Google redirect/popup where supported, phone OTP, reset links, and visible error codes.
- `onboarding.html`: first-run introduction saved into `browserProfiles/{uid}` when allowed by Firestore rules, with local fallback.
- `browser.html`: browser workspace, address/search bar, secondary tool row, tab/history/bookmark/download actions, home cards, news, and exact visible error reporting.
- `browser-settings.html`: search engine, address-bar placement, language, privacy preferences, DNS preference, site-permission preferences and safety check.
- `browser-profile.html`, `browser-bookmarks.html`, `browser-recent-tabs.html`, `browser-password-manager.html`, `help-feedback.html`: separate browser profile/data/help pages.
- `sw.js` / `browser-manifest.json`: PWA shell cache and install manifest.
- `native-android/`: recommended native Android WebView package with application ID `com.codeacademy.browser`, top-level site WebView and Android default-browser role request.
- `capacitor/`: separate Capacitor build scaffold using the same package ID as an optional WebView wrapper; the native-android route is preferred for unrestricted top-level site navigation.

## Critical limitations and setup

1. **Separate UI/data does not mean a separate identity provider.** This folder uses the same Firebase project config as the supplied Code Academy app so the auth methods/provider setup remain consistent; its browser profile/data live under `browserProfiles/{uid}`. Firebase Auth accounts and UID pool are still shared. For truly separate sign-in databases, create a distinct Firebase project, enable email/password, Google and phone providers as needed, and replace the config in `browser-auth.js` and configure the corresponding authorized domains.
2. Merge `BROWSER-FIRESTORE-RULES-ADDON.txt` into the existing Firestore rules, deploy rules, and ensure Firebase Auth provider/domain settings are correct. Never loosen production rules to `allow read, write: if true`.
3. PWA installation requires HTTPS (or localhost) and a valid manifest/service worker. It installs a web app, not an APK.
4. A generated APK requires Android SDK/Gradle/Android Studio and signing; see `capacitor/README.md`. The source archive does not contain a signed APK or keystore. The native Android project supports the Android browser role and HTTP/HTTPS link intents; the PWA alone cannot claim device-wide default-browser status.
5. The Delete browsing data action clears app-managed history, tabs, bookmarks and file activity; in the native APK it also requests WebView cookie/cache clearing. A PWA cannot clear cookies owned by other website origins or override their iframe restrictions, and it cannot silently become the Android default browser. Those features require a native top-level WebView, reviewed Android intent filters, and user-confirmed default-browser role. Site-permission toggles are UI preferences until native/site permission APIs enforce them.
6. Built-in UI translations cover core interface strings in the languages included in `browser-i18n.js`; they do not automatically translate arbitrary third-party website content. No remote translation service is configured, avoiding accidental transmission of user text.
7. The selected search engine link uses Google, Bing, DuckDuckGo, Ecosia, Brave, and selected research search sites where a supported URL is known. The labels `Torch`, `Grams`, and `FOC` do not identify universally verifiable consumer search engines, so configure a trusted HTTPS query template (`{query}` placeholder) in settings before using those as custom providers. FOFA and Censys are included as security-research engines, not general search engines.
8. `BROWSER-FIRESTORE-RULES-ADDON.txt` needs review before deployment. Browser data sync is best-effort and errors are reported in the UI/console.

## Android build

Follow `capacitor/README.md`. Build and test under the app's own package ID and sign it separately from the main Code Academy APK.

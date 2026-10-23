# Code Academy VPN Force — native Android project

Code Academy VPN Force is a native Android app project with a responsive dashboard, VPN profile management, a WireGuard client engine, Android VPN consent, a foreground connection controller, system-notification status, network diagnostics, account-page access, and sharing.

## Important status

- This ZIP contains **Android source code and assets**, not a compiled APK or a signed Google Play release.
- A real VPN gateway has **not** been provisioned. A valid WireGuard `.conf` file from a VPN provider or from a server you control is required before traffic can travel through a remote VPN endpoint. No fake endpoint or “connected” demo profile is included.
- The app uses the WireGuard Android tunnel library (`com.wireguard.android:tunnel`). The user imports the profile; the app checks its structure and stores it in private app storage without logging private keys.
- A VPN can encrypt and reroute traffic through the selected server. It cannot amplify a phone's cellular/Wi-Fi radio signal or guarantee full signal, higher speeds, or zero interruption.
- This is a **native Android APK project**. The native VPN service will not run as a PWA or inside an ordinary desktop browser.

## Main features

- Mobile-first dashboard with connection status, underlying network type, and Android network-validation status.
- Connect and disconnect using the Android VPN consent dialog and WireGuard client engine.
- Import, validate, replace, and remove a WireGuard `.conf` profile. Profile material remains in the app's private files directory.
- Ongoing Android notification while the service is active, using the Code Academy logo as its large icon. The notification body says: “This device is connected to a VPN from Code Academy.” Android separately shows its VPN/key indicator when a VPN is active.
- Settings for reconnect-on-app-open, notification permission, diagnostics, and opening Android's VPN settings for its OS-level kill-switch controls.
- Share action with accurate feature details and a speed/coverage disclaimer.
- Account/profile shortcut opens the existing Code Academy website (`profile.html`) in the device browser, where the site's established Firebase and Google sign-in flow can run in a supported browser context. This project does not bundle a separate Firebase Native Google-sign-in implementation.
- A metadata preview image at `media/vpn-force-og-preview.jpg` (1200×630) and the original Code Academy `logo.png` used in the native notification.

## Build with GitHub Actions (phone-friendly path)

1. Create a **separate GitHub repository** for this project, then upload the *contents* of this folder (so `app/` and `.github/` are at the repository root). Keep it separate from the existing Code Academy website until the feature has been tested; this package deliberately does not replace the website's `manifest.json` or `sw.js`.
2. Open **Actions → Build Code Academy VPN Force → Run workflow**.
3. Download the `code-academy-vpn-force-build` artifact. It contains `app-debug.apk` for device testing. The debug APK is not a Google Play release.
4. To build a signed release bundle, create an upload keystore in Android Studio and add these repository Actions secrets:
   - `VPN_KEYSTORE_BASE64` — the keystore file encoded as Base64
   - `VPN_KEYSTORE_PASSWORD`
   - `VPN_KEY_ALIAS`
   - `VPN_KEY_PASSWORD`
5. Run the workflow again. When all four secrets are set, it also creates the signed `app-release.aab` and release APK. Keep the keystore and passwords private and backed up; do not commit them to GitHub.

The workflow uses JDK 17, Gradle 8.13, Android SDK 36, and target API 36. New Android apps and app updates submitted to Google Play from 31 August 2026 must target API 36 or higher. Check the current Play Console policy before release.

## Build locally

Open the folder in Android Studio on a computer with JDK 17 and Android SDK 36 installed. Let Android Studio sync the Gradle project, then use **Build → Build Bundle(s) / APK(s) → Build APK(s)** for a test build. The release build must be signed with a keystore you control before Play Store submission. This archive does not include a wrapper JAR because Gradle was not installed in the build environment used to prepare it; the included GitHub Actions workflow provisions Gradle and builds it.

## VPN connection setup

1. Obtain a real WireGuard configuration from a VPN provider you trust or a server you control. A valid profile normally includes `[Interface]`, a private key, one or more `[Peer]` sections, a public key, and a server `Endpoint`.
2. Install the test APK and open VPN Force.
3. Choose **Import VPN profile**, pick the `.conf` file, and connect.
4. Review the Android VPN approval prompt. The app never reports “connected” just because the button was tapped; the native engine must successfully bring up the interface.
5. Verify that the server is reachable and that DNS/web traffic works. A WireGuard interface can be up while a remote endpoint is unreachable, so a valid configuration and server are necessary for useful traffic.
6. When needed, open **Settings → Network & Internet → VPN → Code Academy VPN Force**. On supported Android versions, enable **Always-on VPN** and **Block connections without VPN** to configure Android's kill switch. The app opens this system panel but does not silently switch it on. The package registers WireGuard’s Always-on callback so the saved profile can be reloaded when Android starts the VPN service. Test this on the target device before relying on lockdown, because a bad/unreachable profile plus lockdown can block normal internet access.

## Account integration

The Account screen opens the existing Code Academy `profile.html` page in the device browser at:

`https://codeacademybywm.web.app/profile.html`

That preserves the existing website account implementation and avoids forcing Google sign-in into an embedded WebView. This project does not silently copy website credentials into the VPN engine.

## App identity and files

- Android application ID: `com.codeacademy.vpnforce`
- Display name: `Code Academy VPN Force`
- Native engine: `app/src/main/java/com/codeacademy/vpnforce/VpnRuntime.kt`
- Native service/notification: `VpnControlService.kt`
- Native bridge, account routing, import, and consent: `MainActivity.kt`
- Responsive UI: `app/src/main/assets/index.html`, `styles.css`, `app.js`
- Original app logo: `app/src/main/res/drawable-nodpi/logo.png`
- Metadata preview: `media/vpn-force-og-preview.jpg`
- Privacy notice draft: `docs/PRIVACY-POLICY.md`
- Gateway prerequisites: `server/README.md`

## Existing repository preservation

This is a standalone project folder. It does not overwrite the current Code Academy website `manifest.json`, `sw.js`, or `service-worker.js`. Merge its native Android module into a real Android application source project only after testing; a prebuilt APK or Trusted Web Activity output by itself is not enough to insert a new native `VpnService` implementation.

## Before publishing

Review the privacy policy, host it at a public URL, add that URL in Play Console, complete the VPN-app declaration and Data safety form, test notification permission and VPN revocation behaviour, and test with real profiles on Wi-Fi and mobile data. The `specialUse` foreground-service declaration may require Play review; the manifest includes the declared use case for that review.

# Code Academy Shield — current scope and Android integration boundary

## Added to the repository

- `security-center.html` — responsive Security Center page with Open Graph / X preview metadata, a generated 1200×630 preview image, dark/light theme control, link-pattern review, pasted-message review, selected-file inspection, local denylist, optional browser notifications, firewall learning guide, settings password, account-backed preferences, and a share action using the existing referral-code function.
- `security-engine.js` — client-side security heuristics and preference engine. Pasted messages/files are not automatically transmitted to third parties. Selected text formats are searched for basic warning patterns; other files receive limited metadata/hash inspection, not a full antivirus scan.
- `security-preview.jpg` — social preview image for the Security Center.
- `menu.html`, `manifest.json`, and `sw.js` — the page is linked from the dashboard and menu, available as an app shortcut, and included in the service-worker cache.

## What works now

The page can check URLs provided by the user, review message text the user pastes, inspect files the user selects (within the listed size/type limits), generate a local SHA-256 fingerprint for selected files, maintain a device-local denylist, save preferences and a settings-password hash, show page/browser alerts when permitted, and save warning events into the existing `users/{uid}/notifications` feed through `notification-engine.js` when Firebase rules and account state allow it. The menu listens to that same notification collection.

## What does not work in the current APK/TWA architecture

The existing build workflow uses Bubblewrap to produce a Trusted Web Activity for the hosted website. It does not include a native Android source project that compiles custom services. A root-level manifest file would not be merged into the Bubblewrap-generated app manifest just because it exists.

Consequently, this update does **not** silently read WhatsApp/SMS/email notifications, scan every device file in the background, stop other apps from opening URLs, delete messages/files from other apps, install a device firewall, report senders, or guarantee loud alarms after the app is closed. A website cannot obtain those powers with HTML/JavaScript permissions.

To implement genuine Android device-level protection, a later native Android build needs distinct native service classes and corresponding entries merged into the generated Android manifest, with a foreground VPN service for network filtering and (only if justified, disclosed, and user-enabled) a notification listener for chosen source apps. The Android system must show the required approval screens; the service must minimise the information read and keep message contents on-device where possible. This native integration must be tested in a real Android build, not inferred from a web-page preview.

## Firewall / threat intelligence notes

- Android's official `VpnService` reference: https://developer.android.com/reference/android/net/VpnService
- Android Private DNS guidance: https://support.google.com/android/answer/9654714?hl=en
- Ubuntu's official firewall documentation: https://documentation.ubuntu.com/server/how-to/security/firewalls/
- URLhaus focuses on URLs used to distribute malware: https://urlhaus.abuse.ch/
- VirusTotal warns that submitted URLs/indicators may be added to its dataset and should not contain sensitive/PII data: https://docs.virustotal.com/reference/scan-url
- VirusTotal's public API requires a key and its published terms exclude use in commercial products/services, so this page does not embed an exposed API key or automatically submit private indicators: https://docs.virustotal.com/reference/public-vs-premium-api
- Firebase documents that background web push requires suitable message delivery setup; storing a Firestore notification document alone does not wake a closed app: https://firebase.google.com/docs/cloud-messaging/web/receive-messages

The page provides manual links to external research services instead of uploading every detected item or message without consent. The device-local denylist and browser permission choices stay on the current device/account profile; a warning saved to the account feed contains only a domain and short summary, not the complete URL or message text. Its local heuristics are not an antivirus signature database and must not be represented as one.

## Deployment checks still required

1. Confirm Firestore rules allow a signed-in user to read/write only `users/{theirUid}/securitySettings/shield` and `users/{theirUid}/notifications`; do not make these paths public.
2. Test a link check, message review, selected-text file check, password create/change/delete, pause/resume prompt, notification permission, theme preference, referral sharing, and menu notification display on the deployed HTTPS site.
3. Regenerate the Android package after the source changes are deployed. Real closed-app push alerts require a configured push sender and token registration; they are not created by this frontend change alone.
4. Verify that the deployed social preview image is publicly reachable at `https://codeacademybywm.web.app/security-preview.jpg` and refresh platform caches if an older preview persists.

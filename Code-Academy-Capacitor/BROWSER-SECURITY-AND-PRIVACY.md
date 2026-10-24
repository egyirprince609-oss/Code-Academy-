# Browser Security and Privacy

## Threat model and mitigations

| Threat | Mitigation / boundary |
|---|---|
| Invalid or intercepted TLS | `onReceivedSslError` cancels; there is no “continue anyway” button. An HTTPS padlock means a validated encrypted connection to that origin, not that the site is honest. |
| Remote website attacking native code | No `addJavascriptInterface` or other unrestricted native bridge is exposed to remote page content. The only plugin bridge is in the trusted Code Academy shell. Metadata is extracted by a narrow top-level `evaluateJavascript` operation and is treated as untrusted text/URLs. |
| Dangerous URL schemes / intents | One native `BrowserUrlParser` accepts only ordinary HTTP/HTTPS for WebView navigation, deliberately blocks `javascript:`, `file:`, `content:`, `data:`, `blob:`, `intent:` and unsupported schemes, and asks before supported external `mailto:`, `tel:`, SMS or geo intents. |
| Local file disclosure | WebView file/content access and file-origin cross-access stay disabled for remote pages. Uploads use Android document/photo selection and URI grants; filenames are sanitized; website metadata never supplies a local filesystem path. |
| Remote permission abuse | Camera/microphone/geolocation are denied unless the site asks, a native origin-specific explanation is shown, and the required Android permission is granted. No location prompt occurs at app startup. Session grants are visible in site-info UI; WebView origin-level revocation support is limited by Android APIs and the implementation does not claim persistent universal permission management. |
| Download abuse | Downloads require explicit confirmation, use DownloadManager and Android Downloads, sanitize path characters, and open/share using content URIs with read grants. The remote server can refuse a request. |
| History leakage | Local-first. History can be disabled. History sync is separately off by default and enabled only from native browser settings. History records are not read/written to cloud while opt-out is off. No hidden telemetry or traffic proxy was added. |
| Cloud cross-account access | Existing Firebase Web Auth owns identity; records live under `users/{uid}/...`; the supplied Rules add-on checks `request.auth.uid == uid`, shape, types and bounds. Rules still must be merged, tested and deployed in the Firebase project; the implementation never claims that this console step is complete. |
| Account change/signed out | Local SQLite file and session preferences are partitioned using the UID/profile hash. Signed-out browsing uses `device`; switching user does not point the new account at the prior user's local database. Sign-out does not delete local browser data. |
| Cookies / website login session | Browser WebView profile is separate from the Code Academy shell. Normal website sessions are retained only while the same selected local Code Academy profile remains active; a profile/UID change clears browser cookies and local storage before loading the next account’s sites. Cloud sync never copies website cookies, saved passwords, form text, payment data or page content. “Clear cookies/site data” can sign a user out of websites. |
| Private browsing overclaim | On Android 9+ the private Activity runs in its own process with a separate WebView data-directory suffix. It clears isolated cookies/storage on entry and close; it doesn't write normal history, bookmarks or cloud sync. Private mode is not anonymity: websites, networks, Android/OS logging, downloaded files and external apps may still leave traces. On Android below API 28 private WebView mode is not offered; sites open in system browser instead. |
| Process death / memory | Logical tab count is bounded at 12; at most 3 WebViews stay live. Evicted tabs restore from URLs. In-page state is not promised to survive. |
| Unsafe Safe Browsing claims | Safe Browsing is enabled only where installed WebView features support it. It may not block all malicious sites and is not a guarantee. |

## Local and cloud data policy

Stored locally: URLs/titles/domain for bookmarks/history, saved session tab URLs/titles, browser preferences, and download metadata (including Android DownloadManager IDs and local content URI). Website cookie jars remain in the isolated browser WebView data directory, not in SQLite records. Private tabs are never restored or synced.

Uploaded only after sign-in and when network is available: bookmarks (including tombstones) and browser preferences. History includes page title, URL/domain and timestamp only after the user explicitly enables history sync. No traffic is routed through Code Academy servers. Cloud history already uploaded is not automatically erased when the setting is switched off; use the explicit cloud browser-data deletion action to erase it. That action retains local data but pauses sync to prevent unintentional re-upload until resumed.

## TLS, network and WebView configuration

Android's WebView/network stack handles DNS, IPv4/IPv6, TLS and requests, and respects device Private DNS, VPN and network state. There is no custom resolver, DoH/DoT endpoint, TLS interception bypass, global cleartext exception or web-content proxy. Remote file/content access and mixed-content loading are disabled. Main-frame connection failures show native error UI; ordinary HTTP responses like 404/500 are allowed to display. The native error UI does not assert a verified DNS/NXDOMAIN status based solely on WebView's general connection error.

## Firebase setup disclosure

The project has web Firebase configuration in `www/authentication.js` for `codeacademybywm`, but the inspected archive has no native `google-services.json` and no canonical `firestore.rules`. Client Firebase web API configuration is not an Admin SDK secret; it still needs appropriate provider/domain restrictions and security rules. Deploy the supplied rules add-on only after merging it into the project's final rules and testing with Emulator/Rules playground. App Check remains unconfigured by this patch and must not be described as enforced.

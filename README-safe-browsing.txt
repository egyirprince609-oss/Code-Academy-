CODE ACADEMY SAFE BROWSING — INTEGRATION NOTES

Files:
- safe-browsing.html: new responsive search hub and settings page
- code-academy-safe-browsing-preview.jpg: 1200x630 social preview image for Open Graph / Twitter metadata

Install into the root of the existing Code Academy repository beside authentication.js, notification-engine.js, menu.html, and sw.js.

Then add these two entries to the CORE array in sw.js to precache them on the next service-worker version:
  'safe-browsing.html',
  'code-academy-safe-browsing-preview.jpg',

If the service worker has an existing cache version, bump CACHE_VERSION when publishing.

Current capabilities: multi-provider web search, local recent-search history, local tab-group labels, heuristic warnings for suspicious URL patterns, Google Safe Browsing Transparency Report shortcut, browser/device voice input and text-to-speech when supported, light/dark theme, data-saver UI, notification permission, opt-in geolocation, opt-in public-IP lookup, local settings, Firestore preference sync (subject to your deployed Firestore rules), and notification-engine integration.

Important platform limits:
- A static website/PWA cannot register itself as Android's default browser or force the Android default-app prompt. That requires a native Android app/wrapper with browser intent filters and the Android system default-app flow.
- A web page cannot change Android/router DNS, create a VPN/private connection, directly control satellite connectivity, or hide the public IP. DNS selector here records a preference only; actual system DNS must be changed in Android settings or by a native/network layer.
- External websites commonly block iframe embedding, so search providers and websites open in a new browser tab. A complete in-app browsing engine requires a native WebView/browser shell or a dedicated browser engine.
- URL checks here are heuristics, not a live malware/phishing database. They cannot inspect every link on third-party pages or guarantee safety. Google Safe Browsing report is offered as an external check.
- Notifications are saved to the existing Code Academy notification engine when signed in and permitted by Firestore rules. Device push notifications still require notification permission and platform support.
- No client-side implementation can honestly guarantee "100% safe" or "no errors" across every browser/device/network. The JavaScript module was checked with Node's syntax checker; test the deployed page and Firebase rules before production use.

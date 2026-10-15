# Code Academy Safe Browser

New root-level files:

- `safe-browsing.html` — responsive browsing workspace and metadata card.
- `safe-browsing.css` / `safe-browsing.js` — dark/light UI, search providers, local URL warning heuristics, iframe viewer with external-browser fallback, tab history/groups, bookmarks, data-saver preferences, speech tools, permission-gated public-IP/location lookup, local events, optional Firebase notifications, and settings.
- `safe-browsing-preview.jpg` — optimized 1200 × 800 Open Graph / Twitter preview artwork.
- `safe-browser-icon-192.png` and `safe-browser-icon-512.png` — PWA icons.
- `safe-browser.webmanifest` and `safe-browser-sw.js` — installable web app metadata and a small offline cache for the app shell only.

## Important capability boundaries

This is a GitHub Pages web app, not a full native browser engine. Sites that block iframes or require normal browser storage/cookies should be opened with **Open in device browser**. The iframe is sandboxed and the same-origin policy prevents the app from inspecting arbitrary cross-origin page contents or scanning every link on a site. The app checks URLs entered into its own address/search input and provides a link to Google's public Safe Browsing site-status report; its local checks are heuristics, not a malware verdict or a replacement for browser-level Safe Browsing.

A website cannot designate itself Android's system-wide default browser, change Android Private DNS, inspect Wi-Fi/mobile-network internals, control satellites, or force compression of data sent by third-party websites. Android's default-browser role requires an installed native application registered for HTTP/HTTPS browsing intents and explicit user approval. This PWA provides install guidance but makes no false claim that it can set the role itself.

Data Saver reduces the app's own preloading and leaves browser-frame loading lazy; external sites still control their own scripts, images, video and network usage. Public IP lookup is made only after the user taps the IP tool. Geolocation only starts after user consent through the browser permission prompt. Browser notifications are permission-gated and only shown while the browser API permits them; reliable background push requires a push server and a configured service.

If signed in, the code attempts to append activity notifications to `users/{uid}/notifications`, the same subcollection read by `menu.html`. Firestore security rules may reject writes; in that case, the app keeps local activity and logs a warning rather than claiming the cloud write succeeded. The current `menu.html` is intentionally not rewritten in this patch because you said you want to plan its redesign separately.

## Deployment

Copy the new files directly into the existing repository root (no asset folder). Keep `authentication.js` in the same root. Deploy on HTTPS using GitHub Pages, then open:

`https://egyirprince609-oss.github.io/Code-Academy-/safe-browsing.html`

To make Code Academy the actual Android default browser later, build a native Android wrapper with browser intent filters and a RoleManager/Default Apps flow; a manifest for a PWA alone is not sufficient.

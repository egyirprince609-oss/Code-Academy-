# Code Academy Live Map — Production package

This release replaces the Live Map page and updates the required root website files, the Render map API, private-share rules, and sign-in continuation for authenticated share links.

## Website files included

- `live-map.html` — Mapbox-first renderer with a visible 2D fallback, device-location centering/marker, follow mode, streets/satellite layers, 3D buildings when the Mapbox style supports them, half/full map sizing, fullscreen mode, address details, settings, optional network-based estimate, private location links, view-event records, and video sharing through the device share sheet.
- `menu.html` — Code Academy navigation with the Live Map entry.
- `login.html` and `email-verification.html` — preserve an allowed Live Map share-link destination through sign-in/email verification.
- `sw.js` and `manifest.json` — refresh the PWA cache version and add the Live Map launch shortcut/social preview to the cache.
- `share-preview-live-map.jpg` — social preview image used by the page metadata.

## Render API

The page uses `https://code-academy-map-backend.onrender.com`.

The Render service must run `npm install` and `npm start` (Node 20+). `MAPBOX_PUBLIC_TOKEN` is required in Render Environment and must be a valid public `pk.` token with the style permissions needed by the Mapbox GL map. The API returns only the public token to the browser. Do not place an `sk.` secret token in the website files. For server-side geocoding, set a server-only `MAPBOX_SECRET_TOKEN` with the necessary Mapbox search/geocoding access; if it is not configured or lacks access, the map can still work while search/address detail availability may be reduced.

Set `ALLOWED_ORIGINS` to a comma-separated list of the exact website origins that are permitted to call the API. For the current GitHub Pages site, the origin is `https://egyirprince609-oss.github.io` (the repository path is not part of the origin). Add any other production domains only if they are genuinely used by the app.

## Firebase rules

Merge the `match /mapShares/{shareId}` block from `MAP-SHARES-FIRESTORE-RULES.txt` into the existing `service cloud.firestore` rules and publish the merged rules. Do not overwrite rules for users, learning progress, profiles, notifications, games, referrals, or other collections. Sharing creation/view alerts will remain blocked until these rules are published. The existing `users/{uid}/notifications` rules must continue to let an authenticated user create/read only their own notification records through the existing `notification-engine.js`.

A viewer must be signed in with a non-anonymous Code Academy account. A private link expires after two hours and may be revoked sooner. Each successful viewer access writes a view event that only the share owner can read.

## Deploying the static site

1. Unzip `Code-Academy-Full-Project-Live-Map-v2.zip` and upload its root files/folders to the existing repository, or replace only the named root files in the current repository. Preserve the existing `authentication.js`, `notification-engine.js`, `logo.png`, icons, learning pages, and other assets.
2. Commit and publish the files on GitHub Pages.
3. Deploy the included `server.js`, `package.json`, and `render.yaml` to the existing Render service (or replace the Render service files and redeploy). Keep the current Render environment variables set there.
4. Merge and publish the Firestore rules block.
5. Open the live site over HTTPS, choose **Locate me**, and grant the browser/device location permission. The marker should center on the map. If Mapbox cannot render, the page should automatically switch to an interactive 2D tile map rather than leaving the loading overlay in place.
6. For sharing, sign in with a non-anonymous account, choose **Start sharing my location**, confirm the consent dialog, and use **Share link** to send the generated private link. Test the link using a separate signed-in account. Confirm the owner receives the view alert and that **Stop sharing now** revokes access.

## Privacy and platform limits

- GPS and network location are separate. Device GPS is the best available browser-provided position; the accuracy figure is an estimate reported by the device. A reverse-geocoded street/city/region is map data, not a guarantee of an exact postal address.
- The network estimate is requested only after confirmation; it sends the connection's public IP to a third-party approximate geolocation provider. The result can be wrong and must not be presented as GPS or as suitable for emergency response.
- Approximate sharing rounds coordinates; address detail, accuracy, profile name, browser alerts and view alerts are configurable in settings. The app does not upload a selected video; it hands a local file to the device share sheet where supported.
- The owner page requests location only after user action and shares only after explicit confirmation. Keep the page open for regular live GPS updates. Closing or suspending a browser tab may interrupt updates; background GPS cannot be guaranteed by a normal web page. Page-exit revocation and its account alert are best effort because browsers can terminate network work during navigation.
- Account/in-app alerts are written through the existing notification engine. Browser notifications require opt-in. True device push delivery when all pages are closed requires a separate configured push delivery service; this package does not claim to create that service.

## QA report

See `LIVE-MAP-QA-REPORT.md` for the checks performed and the limits of simulated browser testing.

# Code Academy Live Map — Production correction

This patch updates the root website files and connects the page to the already-deployed Render map API.

## Files

- `live-map.html` — corrected map loading, GPS centering, 2D/satellite/3D controls, full-screen mode, account status, settings dialog, private live sharing, video sharing through the device share sheet, and optional consent-based IP/network estimate.
- `menu.html` — adds Live Map to the Code Academy account/services menu.
- `sw.js` — includes `live-map.html` in the PWA cache and increments the cache version.
- `MAP-SHARES-FIRESTORE-RULES.txt` — Firestore rules block required by location sharing.

## Deployment

1. Upload/replace `live-map.html`, `menu.html`, and `sw.js` at the existing Code Academy website root. Keep the existing `authentication.js`, `notification-engine.js`, `manifest.json`, `logo.png`, and other application assets in place.
2. Add the `match /mapShares/{shareId}` block from `MAP-SHARES-FIRESTORE-RULES.txt` inside the existing Firestore document rules, then publish the rules. Do not replace other collection rules.
3. The page is configured to use `https://code-academy-map-backend.onrender.com`. The backend should continue to have `MAPBOX_PUBLIC_TOKEN` configured in Render, and the `/health` endpoint should report `hasPublicMapToken: true`.
4. After deploying the page, open `live-map.html`, wait for the map to load, select **Locate me**, and approve device location. Sign in to create a share link. Test the link in a separate browser/private window.

## Privacy and platform limits

- GPS access and live sharing are opt-in. A private share link can reveal the selected location to anyone who receives the link. Sharing expires after two hours, and the owner can stop it sooner.
- Settings are stored on the current device. Approximate mode rounds shared coordinates; display-name sharing is off by default; system notifications are opt-in.
- The optional network estimate sends the connection IP to a third-party geolocation provider only after confirmation. It is approximate, may be wrong, and is not a GPS replacement. The app does not save the IP address from that feature.
- Video sharing hands a selected local video to the browser/device share sheet where supported. The video is not uploaded to Code Academy by this feature.
- Browser pages cannot guarantee uninterrupted tracking after being closed or suspended. Continuous background GPS requires a native platform implementation with the correct operating-system permissions and ongoing notification.

## Validation

The map page uses the project's existing `authentication.js` Firebase Auth/Firestore initialization and `notification-engine.js`. The front-end source has been syntax-checked. Firebase rules still need to be published in the Firebase Console before share creation can succeed.

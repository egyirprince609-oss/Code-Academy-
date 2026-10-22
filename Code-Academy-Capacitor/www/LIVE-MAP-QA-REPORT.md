# Code Academy Live Map — QA report

## Checks passed

- JavaScript syntax checks: Live Map module, `server.js`, `sw.js`, `login.html` module script, and `email-verification.html` module script.
- JSON parsing: `manifest.json`.
- HTML wiring: no duplicate element IDs in `live-map.html`; every literal `$('<id>')` reference resolves to an existing page element.
- Headless browser behavior test with mocked external services:
  - Mapbox GL initialization success path hides the loading overlay and sets up the Mapbox rendering controls.
  - Mapbox initialization failure falls back to the Leaflet 2D renderer and hides the loading overlay.
  - Simulated GPS latitude/longitude centers the map and creates the current-location marker in both renderer paths.
  - Simulated reverse-geocode output populates address, neighborhood, city, district, region, country, accuracy, and update-time fields.
  - Half/full sizing and light/dark settings interactions complete without page JavaScript errors.
  - Sharing-only controls remain hidden when sharing is off.
  - The settings/nav responsive layout was checked at a mobile viewport.

## Not verified against live services in this environment

External Mapbox tiles, live token scopes, external tile-provider responses, the published Firebase Firestore rules, and delivery of real Firebase notifications could not be verified in the isolated browser test. The test intentionally mocked Mapbox, GPS and geocoding APIs; it validates application logic rather than a real map-service connection. After deployment, run the end-to-end steps in `LIVE-MAP-PRODUCTION-README.md` on the public site.

## Known platform constraints

- 3D buildings require successful Mapbox style loading plus building data for that area. The fallback map is 2D, with streets, dark tiles, and satellite-layer choices from public tile sources.
- Device location requires browser/OS permission and an online-capable HTTPS context. The app cannot guarantee background tracking while closed or suspended.
- Address quality depends on the map provider's data coverage. An address field can be blank even when coordinates are available.

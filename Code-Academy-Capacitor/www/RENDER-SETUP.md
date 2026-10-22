# Code Academy Live Map — Render setup

All backend files are in the repository root: `server.js`, `package.json`, and `render.yaml`. Do not upload your real `.env` file.

## 1. Mapbox tokens

The browser map itself needs a **public** Mapbox token that begins with `pk.`. This token is designed for client-side map rendering, so it can be observed by a browser. Create a dedicated public token with only the needed public scopes and URL restrictions for `https://egyirprince609-oss.github.io/*` (or the exact URL restriction format shown by Mapbox).

A secret token beginning with `sk.` must never be used as `mapboxgl.accessToken` and must never be returned by `/api/map-config`. If you have an `sk.` token, add it only as `MAPBOX_SECRET_TOKEN` in Render for the server-side geocoding proxy. Give it only the required read scope. `MAPBOX_PUBLIC_TOKEN` is required even if you also have a secret token.

If an `sk.` token was ever committed to a public GitHub repository, revoke it in Mapbox and create a replacement; removing it from the newest commit does not remove it from Git history.

## 2. Create the Render service

1. Push the updated files to the root of the Code Academy GitHub repository.
2. In Render, choose **New + → Blueprint** and connect the repository, or create a **Web Service** using that repository.
3. For a Web Service use: Runtime **Node**, Build Command `npm install`, Start Command `npm start`, Health Check Path `/health`.
4. Wait for deployment and open `https://YOUR-SERVICE.onrender.com/health`. It should return `ok: true`.
5. In the Render service, open **Environment** and add:
   - `MAPBOX_PUBLIC_TOKEN` = your public `pk.` token (required).
   - `MAPBOX_SECRET_TOKEN` = your `sk.` token (optional; server-side geocoding only; never shared with the browser).
   - `ALLOWED_ORIGINS` = `https://egyirprince609-oss.github.io` (no trailing slash). Add any other website origin only if you actually use it.
6. Save changes and allow Render to redeploy. Open `/health` again and verify `hasPublicMapToken: true`. Do not share screenshots containing environment variable values.

If using Blueprint, `render.yaml` creates a Node web service with the expected commands. Check the `ALLOWED_ORIGINS` value before deploying.

## 3. Point the site to Render

After Render assigns the service URL, open `live-map.html` and find:

```js
const RENDER_API_BASE_URL = 'https://YOUR-RENDER-SERVICE.onrender.com';
```

Replace the placeholder with the exact base URL assigned to your Render service, for example `https://your-service-name.onrender.com` (no path and no trailing slash). This URL is not a secret. Keep all tokens in Render Environment.

The page calls `/api/map-config` for the `pk.` public token, and `/api/geocode` and `/api/reverse-geocode` for server-side place search. `/api/map-config` intentionally never returns the `sk.` token.

## 4. Firestore location-sharing rules

Merge `MAP-SHARES-FIRESTORE-RULES.txt` into the existing Firebase Firestore rules; do not replace the full rules file. This collection uses high-entropy link IDs, owner-only writes, read-only shared links until expiry, and a maximum two-hour expiration. Publish the rules before testing sharing.

## 5. Test

- `GET /health` shows `ok: true` and `hasPublicMapToken: true`.
- `GET /api/map-config` returns JSON containing a `pk.` `mapboxPublicToken` only. It must never include `MAPBOX_SECRET_TOKEN`.
- `GET /api/geocode?q=Accra` returns up to five results. This uses Mapbox and may consume usage.
- On the deployed site, open `live-map.html`, check the browser console and map status, tap **Locate me**, and approve location permission.
- Start sharing and send the link to a trusted recipient. The recipient should open the same site, see the shared marker, and get the two-hour expiry message. Stop sharing to revoke early.
- The PWA manifest contains shortcuts for **Scan current location** and **Share my live location**. Shortcut visibility depends on browser/launcher support; a TWA APK may require native Android shortcuts separately.

## Privacy and limitations

The sender's web page must remain active for reliable live position updates. A closed/suspended page cannot guarantee tracking; dependable background tracking needs a native Android foreground location service. Shared location links are bearer links: anyone with the URL can view the location until it is stopped or expires, so share privately.

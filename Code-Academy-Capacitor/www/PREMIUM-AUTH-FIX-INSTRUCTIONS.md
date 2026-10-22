# Code Academy Premium — authentication token diagnostic fix

Replace these two files in the root of the Code Academy GitHub repository:
- `premium-admin.js`
- `premium_api.py`

Keep `premium-admin.html` importing `./authentication.js`, and ensure its payment API meta tag is:

```html
<meta name="payment-api-base" content="https://code-academy-premium-api.onrender.com">
```

Make the same API URL change in `premium.html` if not already done.

Commit the updated files. If Render is connected to that repository and auto-deploy is enabled, Render should deploy the changed `premium_api.py`. Otherwise manually deploy the latest commit from the Render service dashboard. GitHub Pages will publish the updated JavaScript as well.

Then:
1. Open the admin page in Chrome, refresh it, and check the status. The admin JavaScript now retries once with a forced Firebase ID-token refresh if the backend reports `INVALID_SESSION`.
2. If the backend still rejects the token, open Render → service → Logs, reproduce the problem once, and look for `Firebase ID-token verification failed`. The updated backend logs the Firebase SDK's exception type and diagnostic message, but never the bearer token.
3. Confirm Render environment variable `FIREBASE_PROJECT_ID` is exactly `codeacademybywm` and that `FIREBASE_SERVICE_ACCOUNT_JSON` is the JSON service account file from that same Firebase project. The patch checks the JSON's `project_id` against this variable.
4. Only after token verification succeeds should you act on `ADMIN_UIDS`. That variable must contain the signed-in reviewer's Firebase UID exactly. `ADMIN_ONLY` means authentication worked but that UID is not allowlisted; `INVALID_SESSION` means verification failed earlier.

Security: never paste a service-account private key, full Firebase ID token, API secret or WhatsApp token into chat, GitHub, or screenshots. This patch does not enable automatic MTN payments; that still requires approved MTN Collections credentials.

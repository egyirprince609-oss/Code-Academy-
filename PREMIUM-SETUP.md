# Code Academy Premium — installation and payment setup

These files are intended to sit together in the existing Code Academy website root. The ZIP is flat: it contains files only and no subfolders. Replace the old root `premium.html` with this version, and add the other files beside your existing `authentication.js`.

## What this package does

- `premium.html` / `premium.css` / `premium.js`: responsive premium plan page, account sign-in, checkout flow and transaction-status UI.
- `premium_api.py`: Python API that verifies Firebase ID tokens, creates payment orders, verifies MTN request-to-pay status server-side when an approved API merchant is configured, and writes account premium status only on the server.
- `premium-admin.html` / `premium-admin.js`: review panel for pending manual MoMo submissions. Its backend endpoints are allowlisted by Firebase UID.
- `premium-firestore-rules-fragment.txt`: security changes to merge into your existing rules. Do not replace all your rules with this fragment.
- `requirements-premium.txt`: Python dependencies.
- `.env.example`: names of the server-side settings only; it contains no provider credentials.

## Important payment limitations

1. **GitHub Pages serves HTML/CSS/JavaScript; it does not run the Python backend.** Deploy `premium_api.py` to a separate HTTPS Python hosting service. Configure its start command as `gunicorn --bind 0.0.0.0:$PORT premium_api:APP` (or the equivalent supported by your host).
2. Change the empty `content` value in the `payment-api-base` meta tag in both `premium.html` and `premium-admin.html` to the deployed API base URL, for example `https://your-secure-api-host.example`. Use the actual URL from your hosting provider, not that example.
3. The included mode is **manual MoMo transfer with admin verification**. The user creates an order, transfers the exact displayed amount through their own official wallet flow, then submits the genuine provider transaction reference. The user is not upgraded until an authorized reviewer checks the actual incoming transaction in the receiving account and approves the order in `premium-admin.html`.
4. Automatic MTN request-to-pay is supported by the API only after MTN Collections merchant onboarding and valid server-side credentials are provided. Until it is configured, the page must not claim that an MTN PIN prompt was sent.
5. Card, debit-card, and bank checkout are intentionally **disabled**. They need an approved gateway/merchant account and a real server-side integration. This package does not collect card numbers, CVVs, bank passwords, wallet PINs or OTPs.
6. A regular personal MoMo transfer can display the wallet's registered account name (currently configured here as **Constance Mensah**), not a label chosen by this webpage. Do not advertise the recipient as “Code Academy” unless the payment provider has registered/approved that merchant display name. Ensure the named wallet owner has explicitly authorized use of the number before accepting payments.
7. The approximate GHS amounts use the fixed display assumption GH₵10 per US$1. The backend charges the configured fixed GHS amount shown at checkout; this is not a live FX conversion.

Because the developer is under 18, an eligible parent/guardian or authorized adult/business operator needs to handle merchant onboarding, provider agreements, account credentials and payment review. Do not bypass any age or identity requirement.

## Backend setup

1. Install Python 3.10 or newer on a trusted server. Upload `premium_api.py` and `requirements-premium.txt` to the backend service.
2. Install packages with `pip install -r requirements-premium.txt`.
3. In the host's **private environment/secrets settings**, configure:
   - `FIREBASE_PROJECT_ID=codeacademybywm`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` with the private service-account JSON as a secret **or** `GOOGLE_APPLICATION_CREDENTIALS` pointing to a private service-account JSON file available only on the server.
   - `FRONTEND_ORIGINS=https://egyirprince609-oss.github.io` plus only any trusted local test origins you need.
   - `PAYMENT_MODE=manual_momo`
   - `MOMO_RECIPIENT_PHONE=233593675745`
   - `MOMO_RECIPIENT_NAME=Constance Mensah`
   - `ADMIN_UIDS` as the comma-separated Firebase Auth UID(s) for the authorized payment reviewer(s).
4. Do **not** put a Firebase service-account JSON, MTN API secret, WhatsApp token, or `.env` file in GitHub, the browser code, the APK, or the ZIP shared publicly.
5. Deploy, then open `https://YOUR-BACKEND/api/health`. It should return JSON with `ok: true`. Then open `https://YOUR-BACKEND/api/config`. These endpoints do not need login.
6. Update the `payment-api-base` meta tag in both front-end HTML pages to your backend HTTPS origin.
7. Sign into Code Academy, visit `premium-admin.html`, copy the shown Firebase UID, and put that UID into the backend's `ADMIN_UIDS` secret. Restart/redeploy the backend. Only an authorized reviewer should be allowlisted.
8. Merge the recommendations in `premium-firestore-rules-fragment.txt` into your actual Firestore rules. In particular, client code must never be permitted to write `premium`, `premiumUntil`, or `subscription`, and must not access `premiumOrders` directly. Firestore permissions combine with OR, so remove conflicting broad write rules rather than simply appending a restrictive rule.
9. Check the API logs and test with a small sandbox/test transaction before using real money. Verify sign-in, rejected orders, failed payments, duplicate approval attempts, expiry extension, and the reviewer allowlist.

## Enabling automatic MTN MoMo

A personal MoMo number by itself does not supply the API credentials needed to trigger an authenticated Request-to-Pay prompt. An authorized adult/business operator must complete official MTN Collections onboarding and get the API user, API key and Collection subscription key. Then set the following on the server only:

```env
PAYMENT_MODE=mtn_momo
MTN_TARGET_ENVIRONMENT=mtnghana
MTN_API_BASE_URL=https://proxy.momoapi.mtn.com
MTN_COLLECTION_API_USER=YOUR_APPROVED_API_USER
MTN_COLLECTION_API_KEY=YOUR_APPROVED_API_KEY
MTN_COLLECTION_SUBSCRIPTION_KEY=YOUR_COLLECTION_SUBSCRIPTION_KEY
```

Use the separate MTN sandbox credentials and `MTN_TARGET_ENVIRONMENT=sandbox` / `MTN_API_BASE_URL=https://sandbox.momodeveloper.mtn.com` for sandbox testing. Never use test credentials for real payments. The server requests payment from the payer's number, then checks the provider's transaction status; the payer must approve through their official provider client. Automatic activation requires a successful provider result whose amount and currency match the server's order.

Official documents: [MTN MoMo Developer Portal](https://momoapi.mtn.com/), [Ghana Collections details](https://momoapi.mtn.com/Ghana_Collection_productDetails), [Ghana API terms](https://momoapi.mtn.com/ghana_apitermsandcondition).

## WhatsApp owner alerts

Automatic WhatsApp alerts require the **WhatsApp Business Platform Cloud API**, not just the ordinary WhatsApp app. In Meta's developer/business tools, configure an approved message template whose body contains exactly eight parameters (`{{1}}` through `{{8}}`). Set these backend secrets:

```env
OWNER_WHATSAPP=233XXXXXXXXX
WHATSAPP_ACCESS_TOKEN=YOUR_SERVER_SIDE_TOKEN
WHATSAPP_PHONE_NUMBER_ID=YOUR_META_PHONE_NUMBER_ID
WHATSAPP_GRAPH_VERSION=THE_CURRENT_SUPPORTED_VERSION
WHATSAPP_TEMPLATE_NAME=your_approved_template_name
WHATSAPP_LANGUAGE_CODE=en
```

The template parameters are: event/status, user display name, email, abbreviated Firebase UID, plan name, GHS amount, order ID, and transaction reference. The backend sends a **review-needed** notification for manually submitted references, and a **confirmed** notification only after the order is approved/verified. If WhatsApp is not configured or Meta's request fails, the payment record stays intact; WhatsApp delivery is not represented as guaranteed.

## Premium data and connecting other pages

On successful verification, the server stores the subscription in `users/{uid}`:

- `premium: true`
- `premiumUntil: Timestamp`
- `subscription.status`, `planId`, `planName`, `startedAt`, `expiresAt`, `paymentOrderId`, `paymentMethod`, `paymentAmountGhs` and `transactionReference`

On manual payment, this subscription is not written until the authorized backend approval. Other Code Academy pages must read this server-managed subscription and enforce their own feature gates. Merely adding this page does not automatically change every lesson, game, or AI page. The server should remain the authority for premium fields.

## Testing and troubleshooting

- `PAYMENT_API_URL_NOT_CONFIGURED`: edit the `payment-api-base` meta tag in both HTML pages.
- `FIREBASE_ADMIN_NOT_CONFIGURED`: configure the private Firebase Admin service account on the backend.
- `INVALID_SESSION`: sign in again; the API verifies Firebase ID tokens.
- `ADMIN_UIDS_NOT_CONFIGURED` / `ADMIN_ONLY`: configure the authorized reviewer UID in the host's environment.
- `MTN_MERCHANT_NOT_CONFIGURED`: complete merchant onboarding and configure all three MTN Collections credentials before selecting automatic MTN checkout.
- `MTN` provider errors: the API returns the provider code/message when available. Inspect backend logs for connectivity/configuration errors; do not publish secret-bearing logs.
- If automatic WhatsApp messages fail, check the server log, number ID, supported Graph API version, access-token permissions and approved template name/language. Do not send access tokens through WhatsApp.

The page and API files can be validated locally, but live payment behavior cannot be proven until the production merchant, Firebase Admin credentials, hosting URL, rules and provider configuration are supplied and tested.

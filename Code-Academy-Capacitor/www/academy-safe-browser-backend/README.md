# Academy Safe Browser — backend bundle

This is the backend paired with `academy-browser.html`. It is a real service layout, not a JavaScript-only mock-up: it includes search aggregation through a private SearXNG container, optional Brave Search API fallback, Google Web Risk URL lookup, Academy URL heuristics/blocklist, ClamAV upload scanning, quarantine review, user reports, rate limits, DNS-over-HTTPS diagnostics, SQLite metadata, Docker, and HTTPS reverse-proxy guidance.

**Important:** do not present this as 100% protection. It identifies known threat-list matches, local suspicious patterns, and known file signatures. Unknown/new threats can evade detection. A webpage also cannot intercept every external browser navigation, scan every phone download automatically, or change Android/iOS system DNS/firewall settings.

## What the API does

| Endpoint | Function |
|---|---|
| `GET /api/health` | Backend health and feature-configuration flags (never reveals secrets). |
| `GET /api/config` | Public capability description. |
| `POST /api/search` | Queries self-hosted SearXNG, optionally Brave Search API, normalizes/de-duplicates results, and checks up to 12 top URLs. Private mode skips Academy cache and optional Brave API. |
| `POST /api/url-check` | Validates URLs, checks the Academy blocklist and heuristics, and calls Google Web Risk when configured. |
| `POST /api/reports` | Adds a phishing/scam/malware report to an administrator review queue. User reports alone do not auto-block sites. Query-string tokens are removed before storing reports. |
| `POST /api/downloads/scan` | Receives a user-selected file copy, computes SHA-256, checks basic signatures, and streams the bytes to ClamAV. Risky/unscanned copies are kept in a private quarantine volume; clean copies are discarded. |
| `GET /api/downloads/history` | Returns only aggregate scan counts to avoid exposing other visitors' filenames. |
| `GET /api/dns/providers`, `POST /api/dns/test` | Shows trusted diagnostic profiles, tests a built-in DoH provider from the server, or format-validates a custom HTTPS endpoint without contacting arbitrary hosts. These calls **do not change device DNS**. |
| `GET /api/security/summary` | Public aggregate feature counters only. |
| `GET /api/admin/reports` | Admin-token-protected report review queue. |
| `POST /api/admin/reports/{report_id}/review` | Mark a report reviewed/dismissed; optionally add the submitted domain to the blocklist after manual verification. |
| `POST /api/admin/blocklist` / `DELETE /api/admin/blocklist/{domain}` | Add/remove Academy blocklist domains with an admin token. |
| `GET /api/admin/quarantine` / `DELETE /api/admin/quarantine/{scan_id}` | Admin-token-protected quarantine review/delete. |

## 1. Prepare the configuration

1. Copy `.env.example` to `.env`.
2. Generate **two different random secrets** and replace `SEARXNG_SECRET` and `ADMIN_TOKEN`. Example command:

   ```sh
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

   Run it twice. Never publish `.env` or commit API keys to GitHub.
3. In Google Cloud, enable **Web Risk API**, create a restricted API key, and set `WEBRISK_API_KEY`. Web Risk is the configured live URL reputation service. A clean response only means “no known match at check time”; it is not a guarantee.
4. (Optional) Set `BRAVE_SEARCH_API_KEY` for a second independent web search provider. The key stays on the backend. If omitted, Academy uses SearXNG only.
5. Confirm `ALLOWED_ORIGINS` includes the exact static site origin, without a trailing slash. For this project, that is `https://egyirprince609-oss.github.io` (GitHub Pages project paths still use that origin).
6. Keep `ALLOW_EXECUTABLE_DOWNLOADS=false`. The API blocks executable/installer extensions by default even if ClamAV does not find a known signature.

## 2. Deploy with Docker Compose

Use a Linux server or supported Docker host with Docker Engine and the Compose plugin. The ClamAV image needs additional RAM and time on its first start to download virus definitions.

```sh
cp .env.example .env
# Edit .env with a secure editor and replace all CHANGE_ME secrets.
docker compose build
docker compose up -d

docker compose ps
curl http://127.0.0.1:8000/api/health
```

Search may be slower or briefly empty while SearXNG initializes its engines. Upstream search engines can rate-limit or CAPTCHA metasearch services; monitor the container logs and disable any engine that violates a service's terms.

The API binds to `127.0.0.1:8000`, and SearXNG/ClamAV have **no host-published ports**. Do not change this to `0.0.0.0:8000` on a public server. ClamAV's TCP protocol does not provide authentication or encryption, so keep it on the private Docker network.

## 3. Publish HTTPS for the API

The browser frontend must call the backend over HTTPS when hosted on GitHub Pages. Point an API subdomain (for example, `academy-api.example.com`) to the server and put Caddy or Nginx in front of the locally bound API. `Caddyfile.example` is a template; replace its domain and follow Caddy's official install instructions. Allow inbound TCP 80/443 for Caddy and SSH only as needed. Do not expose port 8000 or 3310 publicly.

A restrictive server firewall on a UFW-based host usually starts with rules like these (verify SSH access/port before enabling to avoid locking yourself out):

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8000/tcp
sudo ufw deny 3310/tcp
sudo ufw enable
sudo ufw status verbose
```

These commands configure the **server's** firewall, not a visitor's phone. Cloud provider firewall/security-group rules should match. Do not run the example blindly if SSH uses another port.

## 4. Connect the frontend

1. Copy `academy-browser.html` to the root of your Code Academy GitHub repository as `browser.html`.
2. Copy `academy-browser-preview.png` from the ZIP to that same repository root. The Open Graph/Twitter metadata in the HTML points to:

   `https://egyirprince609-oss.github.io/Code-Academy-/academy-browser-preview.png`

3. Open `browser.html`, click **Settings → General**, and enter your public HTTPS API URL, e.g. `https://academy-api.example.com`. Save and tap **Test connection**. Do not enter API keys in the frontend.
4. Add a link to `browser.html` from the Academy menu/dashboard when you are ready.
5. GitHub Pages serves static files; it does not run FastAPI, Docker, ClamAV, or SearXNG. Those must run on the backend host.

When the API URL is blank, the page offers direct links to official external search providers, but those external results are not checked by Academy before they load. Configure the backend to display in-page results and live safety indicators.

## 5. Verify the protections

- Search: POST a JSON body such as `{"query":"Python programming documentation","mode":"web","page":1,"safe_search":true,"language":"en"}` to `/api/search`.
- URL checks: send `{"url":"https://example.com"}` to `/api/url-check`. With no Web Risk key, benign domains should be **unverified**, not falsely labelled safe. Configure Web Risk before expecting live-known-threat verdicts.
- File scanning: choose a small, harmless PDF/text file in the browser's **Scan a file** tool. Check the scanner result. If ClamAV is down, the result must say **unscanned**, not clean.
- Quarantine: upload a flagged executable-type file only in a controlled test environment; the backend never executes uploaded content. Review and delete retained files via the admin API.
- Blocklist: use the admin API with `X-Admin-Token`; never add user-reported domains automatically without review.
- DNS: `/api/dns/test` proves the server reached a resolver endpoint. It does not prove the visitor device uses that resolver.

## 6. Admin API examples

```sh
# Review user reports (replace URL and token locally; do not publish token):
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://academy-api.example.com/api/admin/reports

# Add a confirmed malicious domain:
curl -X POST https://academy-api.example.com/api/admin/blocklist \
  -H "X-Admin-Token: $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"domain":"confirmed-bad.example","reason":"Manually confirmed malicious by administrator","severity":"dangerous"}'

# Review quarantine metadata:
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://academy-api.example.com/api/admin/quarantine
```

Replace the example domain with a confirmed threat when using the admin API. The `.example` top-level domain is reserved for examples/testing.

## Privacy and safety boundaries

- Academy does not store normal search text in an account database. The backend briefly caches non-private search responses in process memory for five minutes. Private mode bypasses that cache and skips Brave API; requests still pass through SearXNG and its configured upstream engines.
- URL checks send the URL to Google Web Risk when enabled. The user should be informed of this before production deployment; no API key is exposed to the browser.
- URL heuristics can have false positives and false negatives. The backend does not fetch arbitrary user URLs, which avoids a major server-side request forgery risk.
- Uploaded files are streamed to ClamAV, not executed. Only suspicious, blocked, infected, or unscanned copies are retained in quarantine, which is private server storage. Automatic cleanup occurs at startup; review storage/retention and backups in production.
- A clean ClamAV result means no known signature was found, not that a file is harmless. The frontend does not intercept native/browser download events or remove the original copy from a phone.
- DNS tests validate a server-side DoH query only. Native browser permissions, cookie policies, local firewall changes, tab/process isolation, TLS certificate UI, and system DNS require a browser extension/native app or operating-system support.
- This bundle has no built-in user account/session identity. Do not expose per-user reports/history in a multi-user app until proper Academy Firebase ID-token verification and per-user authorization are implemented.

## Run the automated tests

With the Python requirements installed, run from this directory:

```sh
python -m unittest discover -s tests -v
```

The tests use offline/fake provider conditions. They verify URL validation, non-public IP warnings, the honest `unverified` state when Web Risk is absent, safe report-query scrubbing, manual admin review, custom DNS format validation, search fallback, and default executable quarantine. They do not replace live integration testing against your own SearXNG, Google Web Risk, and ClamAV services.

The included per-process cache and rate limiter are suitable for this starter deployment, but are not shared across multiple workers/servers. Put the API behind your provider's edge/rate-limiting controls before public launch.

## Troubleshooting

- **Search empty:** inspect `docker compose logs --tail=200 searxng api`; check that SearXNG has network egress and its JSON format is enabled in `searxng/settings.yml`.
- **Google Web Risk unverified:** ensure API key, API enablement, billing/quota, and URL restrictions are correct. The frontend should not show a green checked badge without a successful lookup.
- **ClamAV unavailable:** wait for initial virus database updates; check `docker compose logs --tail=200 clamav`; confirm the API resolves `clamav:3310` on the private network.
- **CORS error:** set `ALLOWED_ORIGINS` to the exact GitHub Pages origin, restart the API service, and check the HTTPS/API URL in Settings.
- **HTTP blocked from a GitHub Pages page:** deploy the API with valid HTTPS; browsers block mixed content.

## Official documentation used

- SearXNG Search API: https://docs.searxng.org/dev/search_api.html
- SearXNG server settings: https://docs.searxng.org/admin/settings/settings_server.html
- Google Web Risk Lookup API: https://docs.cloud.google.com/web-risk/docs/lookup-api
- Brave Search API: https://api-dashboard.search.brave.com/api-reference/web/search/get
- ClamAV clamd INSTREAM protocol: https://docs.clamav.net/manual/Usage/ClamdProtocol.html

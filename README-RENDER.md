# Academy Safe Browser — flat root deployment bundle

This ZIP contains the backend source and matching frontend integration files directly at the ZIP root. There is no enclosing project folder inside the ZIP.

## Included files

- `Dockerfile`: Render-compatible image build using repository-root files.
- `main.py`: FastAPI API, the API health endpoint, image-result URL handling, and a status homepage at `/`.
- `requirements.txt`: Python dependencies.
- `browser.html`: Academy Browser page with its default API URL set to `https://code-academy-ium.onrender.com`.
- `authentication.js`, `logo.png`, and `academy-browser-preview.png`: frontend resources used by the browser page.
- `.env.example`: a configuration template with no live secret keys.
- `.dockerignore`: prevents local caches and secrets from bloating the Docker build.

## Upload correctly

GitHub does not unpack an uploaded ZIP for Render. Download and extract this ZIP on your phone, then upload/commit the extracted files into the **root** of `https://github.com/egyirprince609-oss/Code-Academy-`, branch `main`. Do not upload the ZIP as one file and expect Render to use its contents. Existing files with the same names (especially `browser.html`, `authentication.js`, and `logo.png`) will be replaced by the bundled versions, so review before overwriting if you have newer changes.

## Render settings

For your existing Render Docker Web Service:

1. Repository/branch: `egyirprince609-oss/Code-Academy-`, branch `main`.
2. Runtime: Docker.
3. Root Directory: leave blank.
4. Dockerfile Path: `./Dockerfile`.
5. Docker Context: repository root (`.`) where that setting is available.
6. Health Check Path: `/api/health`, if the UI offers this field.
7. Deploy the latest commit and wait until the service says `Live`.

The Dockerfile copies `main.py` and `requirements.txt` from the repository root and starts `uvicorn main:app` on Render's injected `PORT` (default 10000). It does not depend on the old `academy-safe-browser-backend/` subfolder or its older `app.main:app` start command.

## Browser-to-API connection

The bundled `browser.html` sets the built-in API URL with this metadata entry:

`<meta name="academy-api-base" content="https://code-academy-ium.onrender.com">`

This is the primary Render URL shown in your dashboard. Once this `browser.html` is committed to GitHub Pages, visitors receive this default automatically. The browser settings allow a visitor to override the URL locally on their own device; that override does not alter the site-wide default for other users. Empty/legacy saved API values migrate to the built-in default.

Test after deployment:

- Backend homepage: `https://code-academy-ium.onrender.com/`
- API health: `https://code-academy-ium.onrender.com/api/health`
- API configuration: `https://code-academy-ium.onrender.com/api/config`

The homepage should return HTML, not `{"detail":"Not Found"}`. Health should return JSON with `"ok": true`.

## Required supporting services

This Dockerfile runs the **Python API only**. The original backend is designed to connect to separate SearXNG and ClamAV services. Putting source files at the same root solves Render's Dockerfile/build-path problem; it does not turn those separate server programs into part of this API process.

- The API can be healthy while `features.searxng_reachable` and `features.clamav_reachable` are false.
- Web search requires a reachable SearXNG service (`SEARXNG_URL`) or an optional `BRAVE_SEARCH_API_KEY` stored as a Render environment secret. In private mode this backend intentionally skips the optional Brave provider, so private search requires SearXNG.
- File scanning requires a reachable private `CLAMAV_HOST` / `CLAMAV_PORT`. Without ClamAV, the backend must not report a file as successfully scanned.
- Full live Google Web Risk checks require `WEBRISK_API_KEY`. Without it, unknown URLs remain `unverified` rather than being labelled safe.

Configure service secrets in Render Dashboard → service → Environment. Do not commit a real `.env` file or API keys. Set a long random `ADMIN_TOKEN` before enabling admin endpoints. The `.env.example` file is for reference only; Render does not automatically import it.

## Storage and free instance notes

SQLite and quarantine data are placed under `/data` and `/quarantine`, writable by the non-root application user. Without a supported persistent disk, data in these directories can be lost on restarts/redeploys. Render free web services can spin down when idle, so the first request afterward may be delayed.

## Safety/privacy boundaries

A URL check is not a guarantee of safety. GPS is not needed by the API unless the user explicitly opts in within the browser. Browser-side public-IP lookup contacts a third-party service. A user-selected file upload sends that selected copy to the backend; it does not scan every file stored on the phone. Account notifications still depend on Firebase setup and Firestore permissions in the existing `authentication.js`.

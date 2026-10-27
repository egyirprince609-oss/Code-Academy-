# Browser engine reliability notes

## Engine model
- The PWA runs local controls before it waits for optional Firebase account sync. Firebase network/import failures now leave the browser UI active and show the exact error.
- Search results first use the configured Academy Search API/Search Worker and supported public APIs. If every result source fails, the error panel shows the source error and a real link to the selected provider.
- A normal website running as a PWA cannot bypass another website's `X-Frame-Options` or `Content-Security-Policy frame-ancestors`. The PWA therefore opens destination pages as actual browser tabs. The Android WebView package uses the native bridge to render sites in the native browser view.
- The 3 themed error illustrations are in `assets/errors/`: network interruption, unreachable site, and DNS lookup failure. A page cannot truthfully identify remote DNS/HTTP status for arbitrary third-party content unless a trusted backend/native network layer reports it; the UI shows errors actually observed from available sources.

## Deploy and validate
1. Deploy the `browser/` directory under the repository's GitHub Pages path.
2. In Firebase Authentication, add the deployed GitHub Pages host to Authorized domains. Confirm Email/Password, Google, and Phone providers and email templates are configured.
3. Set a trusted HTTPS `Search endpoint` in browser settings for broad ranked result pages. The repository's `academy-safe-browser-backend` is an optional SearXNG-based backend and must be deployed separately; a static GitHub Pages site cannot itself host a private API process.
4. PWA mode opens arbitrary third-party sites in a separate full browser tab; the Android APK's native WebView bridge can display them within the native browser.

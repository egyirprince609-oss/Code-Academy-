# Code Academy Safe Browser — connectivity fix v2

## Why sites showed “refused to connect”
The earlier page placed target websites in an iframe. Many websites reject embedding with `X-Frame-Options` or Content Security Policy `frame-ancestors`. Browser security enforces those response policies; a client-side page cannot override them. Cross-origin `fetch()` is separately restricted by CORS. See:
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS

## What changed
- Searches and direct URLs now open as top-level pages in a separate device-browser tab; the app no longer tries to render external destinations inside an iframe.
- If the popup is blocked, the page presents a direct link and retry button rather than a blank panel.
- The Safe Browser workspace stays available for local tab records, history, bookmarks, safety warnings and settings. These are launch records; a static web app cannot inspect or control the browser's external tab history.
- The homepage loads current technology headlines from the public Hacker News Firebase API, with local caching and a refresh button. It shows cached stories or a clear error when the feed cannot load. Search remains separate from the headline feed.
- The long address bar is the primary action. The home feed is focused and the IP/location/connection tools are inside the expanded settings panel.
- Current URL share uses the native Web Share API where supported and clipboard fallback otherwise.
- `safe-browsing-preview.jpg` is 1200×630 for Open Graph/Twitter preview metadata.
- The service worker cache version is incremented and only caches app-shell resources; it does not prefetch external sites.

## Important boundaries
This is a GitHub Pages web app. GitHub Pages does not run PHP/server-side proxy code: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages . A normal site cannot become Android's system-default browser without a native application registered for browser intents and user approval. It also cannot control Android DNS, mobile networks, satellites or force compression of traffic from other websites.

This page performs local URL heuristics, not a guaranteed live malware verdict. It cannot read arbitrary contents/links of a cross-origin website due to browser security. When an external page cannot connect, the device browser is the component that can show its exact network/DNS/TLS error. This workspace reports only the signals available to it (such as the browser's online/offline state or whether a new tab could be opened).

## Deployment
Copy updated root-level files into the root of your existing GitHub Pages repository. Keep `authentication.js` in the root for optional account notification sync. External websites and searches will now open as ordinary top-level pages in a new device-browser tab; this is intentional and avoids iframe denial.

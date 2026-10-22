# Code Academy menu rebuild — audit and installation notes

## Included replacement/addition files

- `menu.html` — refreshed dashboard, category-grouped navigation, additional validated feature cards, responsive card sizing with natural page scrolling and preserved Firebase/account/orientation flow.
- `settings.html` — new device/app settings page for notifications, location, camera/microphone tests, orientation, clipboard, storage, vibration/fullscreen, sharing, installation and replaying the dashboard tour.
- `manifest.json` — updated PWA metadata, adaptive orientation (`any`), valid app start route, icons, screenshots and shortcuts.
- `sw.js` — versioned shell caching, offline navigation fallback, push notification display and safe notification-click routing.
- `pwa.js` — one shared install prompt used by the dashboard button, landing page and install banner (prevents duplicate prompt handling).
- `share-preview.jpg` and `share-preview.png` — 1200×630 social preview generated from new Code Academy dashboard artwork.
- `logo.png`, `web-app-manifest-192x192.png`, `web-app-manifest-512x512.png` — existing matching brand icon assets required by the manifest.

## Navigation categories now exposed

**Learning:** Courses, Progress, Community, Certificates.

**Code & Build:** Code Editor dashboard, Saved Code, HTML Elements, CSS Styles, Web Structure, HTML Project Lab and Ready Projects.

**Practice & Productivity:** Game Arena, Quiz Arena, Study Planner, Time & Activity, Live Map and Saved Notes.

**Account & Services:** Profile, Security Center, Settings & Permissions, About Us, Support, Buy Data and Logout.

The app's 17-language workspaces are reachable through `editor-dashboard.html`; the dashboard also opens the existing project and learning pages directly. The existing first-run orientation tour remains enabled and no longer contains an AI Mentor step.

## Routes inspected before adding menu entries

The existing root HTML files were inventoried from the supplied ZIP. Menu entries were restricted to pages that exist and are non-empty in the archive (plus the newly created `settings.html`). The following useful files were found and surfaced as links: `course.html`, `project.html`, `progress.html`, `community.html`, `certificate.html`, `CODEEDITOR.html`, `editor-dashboard.html`, `note.html`, `games_dash.html`, `live-map.html`, `App_quiz.html`, `html_element.html`, `CSS.html`, `HTMLS.html`, `html_project.html`, `ready-projects.html`, `plan.html`, `time.html`, `security-center.html`, `profile.html`, `aboutus.html` and `contactus.html`.

The root `data.html`, `py_dashboard.html` and `js_dashboard.html` files in this ZIP are zero bytes and must not be used as destinations. The purchase/data-bundle path in the rebuilt menu now opens `https://code-acada.jiyudata.store`. No AI Mentor or textbook-library action is included in the rebuilt menu/search/orientation.

## Permission and notification limits

Browsers require HTTPS (or localhost) and an explicit user gesture for many device permissions. Settings asks for access only after a tap; it does not and cannot silently grant permissions. Camera and microphone tests stop their media tracks immediately. The notification test sends a local/browser notification. Genuine remote Web Push still needs a configured subscription + application server/VAPID setup; Firebase/in-app notification history is a separate feature.

## PWA vs. APK

The manifest and service worker are prepared for a normal installable PWA/WebAPK flow, subject to HTTPS hosting, browser eligibility, icons and service-worker registration. A `manifest.json` cannot rewrite an APK/AAB that has already been compiled. To publish an APK/AAB with the latest title/icon/launch metadata, rebuild the native Android wrapper or your existing Android pipeline and confirm `.well-known/assetlinks.json` contains the exact package name and signing-certificate fingerprint of the release build. The existing asset-links configuration was not replaced by this patch.

## Apply

Copy the included files to the same root directory where the current `index.html`, `menu.html`, `manifest.json`, `sw.js`, `pwa.js` and `share-preview.jpg` live, replacing those files and adding `settings.html`. Keep the existing `authentication.js`, Firebase settings, `.well-known/assetlinks.json`, unrelated language-specific service workers and page files in place; replace `pwa.js` with the included shared-prompt version. Deploy over HTTPS and open the app once online to let the new service worker install and refresh its cache.


## Validation performed

- Parsed the JSON manifest and embedded JSON-LD.
- Checked JavaScript syntax for the menu module, settings-page script, shared PWA installer and service worker with Node.js.
- Parsed CSS from the landing page, dashboard and settings page; no CSS parser errors were reported.
- Checked for duplicate element IDs, broken local menu links and missing menu-card targets.
- Verified the generated social-preview images are exactly 1200 × 630 pixels and that all manifest icon, screenshot and shortcut paths exist.
- Verified the rebuilt menu includes no AI Mentor or textbook-library entry, and the data-bundle link uses the supplied URL.

A live Chromium visual run could not be performed in this environment because the browser runtime blocked both local HTTP and local-file navigation. Please still open the deployed pages on your Android phone and desktop after publishing to confirm device-specific permission prompts and install eligibility; these are controlled by the browser and operating system.

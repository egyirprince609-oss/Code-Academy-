CODE ACADEMY — GAMES + PWA UPDATE
=================================

CONTENTS
--------
This update contains the 25 requested core files:
• 10 updated game pages: digital_vault.html, detective_man.html, mind_palace.html,
  civilization.html, truth_protocol.html, code_breaker.html, cybermission.html,
  code_racer.html, algorithm_defender.html and code_quest.html.
• 10 separate question/challenge banks (nine 200-question JSON banks and the 200-mission Code Racer deck).
• games_dash.html, manifest.json, sw.js, index.html and home.html.

Five existing Code Academy share-preview images are included for metadata and link previews, along with the two PWA icon files referenced by manifest.json and a repaired pwa.js install helper. That installer helper is an additional compatibility file because the existing menu and lesson pages already load it.

INSTALLATION
------------
1. Back up the current repository first.
2. Extract this ZIP into the SAME root folder as the existing Code Academy project.
   Allow the included files to replace their old versions.
3. Do NOT delete or move the rest of your existing project. In particular, keep:
   authentication.js, game-platform.js, notification-engine.js, pwa.js, menu.html,
   signup.html, login.html, verify-email.html, Firebase config and all policy/support pages.
   The new game pages intentionally reuse those existing authentication and notification modules.
4. Commit and publish the combined repository. The manifest and service worker expect
   the app to be hosted under one directory/scope, as on the current GitHub Pages site.
5. Test sign-in routing, each game, one correct answer, menu notifications, language preference,
   offline loading after the first visit, and PWA installation on a real browser.

QUESTION BANKS
--------------
Each of the nine quiz-style games has 200 distinct question prompts with four answer choices,
answer index, difficulty, category and explanatory feedback. Code Racer has 200 distinct coding
missions. Every page embeds the first 50 bank entries as a local fallback, so a temporary JSON
fetch failure does not reduce the practice experience to two or three built-in questions.
Additional progress from these new practice panels is saved in browser local storage; the preferred
language uses code_academy_preferred_language_v1. Correct answers can be awarded through the existing
CodeAcademyPlatform bridge when a signed-in connection is available. Account-linked rewards and game
notifications depend on the configured Firebase rules and the current authenticated session.

LANGUAGE, VOICE AND TRANSLATION
-------------------------------
English is the default. Practice question text can be translated through public LibreTranslate-compatible
mirrors; public mirrors may be rate-limited, temporarily unavailable, or lack a selected language.
Browser/device speech voices differ. When a selected-language voice is unavailable, the game voice
falls back to an English voice when possible. Programming syntax and source code remain unchanged.

PWA, NOTIFICATIONS AND BACKGROUND WORK
--------------------------------------
The service worker caches core pages, game banks and available image assets; it also handles incoming
Web Push payloads and notification clicks. Web Push still requires a configured push sender/provider,
subscription/permission flow and server/VAPID setup. This bundle does not invent that server. A browser
service worker cannot keep arbitrary JavaScript timers running indefinitely after the app is fully closed;
use platform-supported scheduling or server push for reliable background reminders in a packaged Android
APK/TWA. APK/TWA packaging also requires the appropriate Android wrapper and Digital Asset Links setup.

The static metadata and public landing page improve crawlability, but search indexing/domain verification
is ultimately controlled by Google and the hosting provider, not by an HTML file alone.

CODE ACADEMY — TEN-GAME UPDATE
Updated: 13 October 2026

INSTALLATION
1. Extract this ZIP into the ROOT of the existing Code Academy repository.
2. Keep all files at the repository root; do not move them into a folder.
3. Overwrite the included files when asked. Leave every other existing site file in place.
4. Commit/push the files to GitHub Pages, then wait for deployment before testing.
5. Test while signed in with a Code Academy account. These games intentionally redirect signed-out users to login.html.

CANONICAL TEN-GAME DASHBOARD (games_dash.html)
01  Logical Vault       digital_vault.html
02  Digital Detective   detective_man.html
03  Mind Palace         mind_palace.html
04  Civilization Puzzle civilization.html
05  Truth or Lie        truth_protocol.html
06  Code Breaker        code_breaker.html
07  Cyber Mission       cybermission.html
08  Code Racer          code_racer.html
09  Algorithm Defender  algorithm_defender.html
10  Code Quest          code_quest.html

LEGACY FIVE-GAME DASHBOARD (game_dash.html)
Code Breaker -> code_breaker.html
Cyber Mission -> cybermission.html
Code Racer -> code_racer.html
Algorithm Defender -> algorithm_defender.html
Code Quest -> code_quest.html

INTEGRATION
- authentication.js remains the source of the existing Firebase account/authentication.
- game-platform.js connects supported games to the current user profile and tracks game rewards/history.
- The shared reward engine deduplicates rewards using a stable challenge key. The new games grant 5 XP and 2.5 coins for each first-time completed case/wave/node.
- Game activity/reward notifications are written under users/{uid}/notifications. menu.html listens to that same collection and now queries newest records first.
- game-responsive.js and game-responsive.css measure viewport changes and provide responsive phone/tablet/desktop styling. Zoom is not disabled by the updated game pages.
- Local page references use root-level filenames, matching the repository layout.

IMPORTANT NOTIFICATIONS NOTE
This update delivers account-backed IN-APP notifications that appear in the Code Academy menu notification panel. It does NOT by itself send native push notifications while the PWA/APK is closed. Background/device push requires Firebase Cloud Messaging, a service worker, browser permission/VAPID configuration, and a trusted server-side or Cloud Functions send workflow.

FIREBASE NOTE
Reward and notification writes require the existing Firestore rules to permit an authenticated user to read/write their own users/{uid} profile and the relevant gameProgress, gameHistory, and notifications subcollections. If an update is rejected, check the browser console and Firebase rules; do not make the database publicly writable.

VALIDATION PERFORMED
- Parsed inline JavaScript in the ten games and both dashboards with Node.js syntax checks.
- Parsed the shared platform/responsive scripts and existing authentication/notification scripts.
- Audited dashboard paths, local root-level references, viewport metadata, titles, descriptions, and canonical links.
- These static checks do not replace a live Firebase/browser test on desktop and physical Android devices.

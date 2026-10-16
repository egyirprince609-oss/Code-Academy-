CODE ACADEMY LIVE MAP — INSTALL NOTES
====================================

FILES INCLUDED
--------------
gps-map.html                         New Live Map page.
share-preview-map.png                1200 x 630 social-sharing image.
menu.html                            Adds the Live Map menu entry.
manifest.json                        Adds Live Map PWA shortcut and preview metadata.
sw.js                                Caches the new page and image; updates cache version.
privacy.html                         Describes GPS, provider requests and notification behavior.
.github/workflows/build-aab.yml      TWA/Android build configuration with location and notification delegation.

INSTALL INTO THE EXISTING REPOSITORY
------------------------------------
1. Extract this ZIP at the root of the Code-Academy- repository, preserving folders. Allow it to replace the included versions of menu.html, manifest.json, sw.js, privacy.html and .github/workflows/build-aab.yml.
2. Commit/push to the main branch and wait for GitHub Pages to deploy the files.
3. If an old version remains cached, fully close the PWA/browser tab, reopen it, and refresh. The service-worker cache version was bumped.

MAP PROVIDER SETUP
------------------
The page has a working 2D OpenStreetMap fallback. Enhanced 3D buildings, terrain and Mapbox satellite styling require a Mapbox PUBLIC access token.

For a quick test, open Live Map, choose 3D, tap Configure 3D map, and enter a token beginning with pk. That token is saved only in that browser's localStorage. Other users will not receive that browser-only token.

For production, set MAPBOX_ACCESS_TOKEN near the top of gps-map.html to your Mapbox PUBLIC token. Restrict the token to your website's allowed URL/origin in the Mapbox account dashboard. Do not put a secret/server token in front-end HTML. Mapbox's GL JS guide: https://docs.mapbox.com/mapbox-gl-js/guides/.

GPS, PRIVACY AND PERMISSIONS
----------------------------
- GPS is requested only after the user taps Locate me or Start live GPS and approves the device/browser permission. Precise mode is requested with enableHighAccuracy.
- Live GPS runs while this page is active and is stopped when turned off or the page is hidden/closed. This web page does not implement silent background tracking.
- Device notifications are requested only after the user taps Device notifications. Local device notifications can include latitude, longitude, reported accuracy, available altitude, speed/direction, place context and update time. Depending on phone settings, details may appear on the lock screen.
- Account activity notifications use the existing notification-engine.js feed. Exact coordinates are excluded from that feed unless the user checks Include coordinates. A confirmed location share is a separate action.
- Place search/reverse lookup and map display may send the relevant query or coordinates to the selected map/geocoding provider. Providers may process those requests under their own policies.
- The page uses the existing authentication.js auth session and rememberReferral() engine, reads a user's referralCode for share links, and uses the shared code_academy_preferred_language_v1 preference for UI language and voice.

REALISM LIMITATIONS
-------------------
This is a GPS map, not a live camera or street-surveillance feed. 3D buildings, road labels, satellite imagery and terrain depend on provider coverage and may be dated or incomplete. It cannot show a person's literal front/back/sitting view or reveal every car, house material or object in real time. Device GPS altitude/heading can be missing or approximate, and GPS accuracy is not guaranteed survey-grade. The map is not an emergency-dispatch service. For urgent missing-person or safety incidents, use appropriate local emergency services and trusted, consent-based location sharing.

ANDROID / TWA BUILD NOTES
-------------------------
The GitHub Actions workflow now sets enableNotifications=true, enables Bubblewrap locationDelegation, and uses the correct GitHub Pages project path for the start URL. Run it from GitHub: Actions > Build Code Academy Android App > Run workflow. Supply a version code higher than the latest version already uploaded to Google Play.

For a SIGNED APK/AAB, configure these GitHub Actions repository secrets with the EXISTING signing key that corresponds to the fingerprint used by the deployed Digital Asset Links file:
- ANDROID_KEYSTORE_BASE64
- ANDROID_KEYSTORE_ALIAS
- BUBBLEWRAP_KEYSTORE_PASSWORD
- BUBBLEWRAP_KEY_PASSWORD

If signing secrets are not configured, the workflow deliberately builds unsigned preview artifacts only. Unsigned artifacts are not ready for normal installation or Google Play upload. Do not generate a new signing key for an existing Play Store app unless you understand the signing-key/update implications. Verify that Digital Asset Links is reachable at the Android app's origin root and contains the matching package/fingerprint.

The page can show local device notifications while it is open and saves activity to the existing in-app notification feed. Receiving push notifications while the app is fully closed still requires a real push subscription/sender backend; a service-worker handler alone does not send push messages.

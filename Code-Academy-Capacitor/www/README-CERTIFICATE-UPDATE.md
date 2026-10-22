# Code Academy Certificate System Update

This package replaces the existing certificate center, certificate setup, certificate view and public verification page. It also includes the shared certificate rules engine and small updates to `menu.html` and `lesson.html` so certificate unlock and public view notifications reach the existing notification bell.

## Files to copy into the root of your Code Academy repository

- `certificate.html` — displays 40 course certificates (beginner + professional) and the 41st Grand Master distinction.
- `certificate_setup.html` — checks eligibility, reads recorded quiz results, accepts a certificate photo and learner signature, and issues the credential.
- `certificate_view.html` — renders the certificate front and patterned back, generates QR and Code 128 barcode, and supports print, two-page PDF download, share and save.
- `verify.html` — public certificate registry checker and learning-app entry page.
- `certificate-engine.js` — shared course catalog, progress normalizer and score calculations required by the pages above.
- `menu.html` — your original menu with a certificate-view activity listener added. It forwards new public verification events to the existing menu notification feed.
- `lesson.html` — your original lesson engine with milestone notifications added at Lessons 5 and 10 when the saved accuracy meets the 50% threshold.
- `FIRESTORE-CERTIFICATE-ACTIVITY-RULES.txt` — an additional Firestore rule for public view-event records.

The archive does not replace `authentication.js`, `notification-engine.js`, `logo.png`, your lesson JSON banks, dashboards or your other pages. Keep those existing root files in place.

## Eligibility implemented

Each of the 20 courses has two credentials:

- **Beginner:** lessons 1–5 completed and at least 50% quiz accuracy across saved quiz answers for those lessons.
- **Professional:** lessons 1–10 completed and at least 50% quiz accuracy across saved quiz answers for the course.

The 41st credential is the **Code Academy Grand Master** distinction. It requires all 200 lessons, all 40 course certificate records to have been issued, and scores recorded for all 20 courses with an average course accuracy of at least 50%. It is labeled as a Code Academy learning distinction, not as an accredited university degree.

The rules engine reads the lesson app's `users/{uid}.lessonQuestionResults` first and uses `users/{uid}/lessonHistory` as a fallback. A lesson count by itself does not satisfy the score requirement.

## Firebase setup required for cross-device view notifications

1. Open Firebase Console → Firestore Database → Rules.
2. Keep your existing rules. Add the `match /certificates/{certificateId}/views/{viewId}` block from `FIRESTORE-CERTIFICATE-ACTIVITY-RULES.txt` inside your current `match /databases/{database}/documents` block.
3. Publish the merged rules.
4. Test by opening an issued credential's `verify.html?id=...` link in another browser/device, then view the owner's menu notification bell. When the menu is already open, new view events are monitored live; when it is not open, the events can be turned into notifications on the next menu or certificate-center visit.

No client-only website can display in-app notifications while the owner's app is completely closed unless push notifications/backend messaging are configured. The event feed intentionally does not store IP addresses or device fingerprints. The public event rule is best-effort activity tracking; it is not a tamper-proof audit trail.

## Validation notes

Inline JavaScript syntax is checked with Node.js. The package keeps the current Firebase v10.7.1 imports and the project's existing public certificate registry path `certificates/{certificateId}`. Browser/Firebase end-to-end operation still depends on the deployed Firestore and Storage rules, network availability, and loading the site's existing `logo.png` and `authentication.js`.

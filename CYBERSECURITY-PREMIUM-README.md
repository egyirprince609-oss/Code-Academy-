# Code Academy — Cybersecurity Premium Courses

## New root-level routes
- `cybersecurity dashboard.html`: 10-lesson defensive cybersecurity track.
- `ethical hacking dashboard.html`: 10-lesson authorized assessment track.
- `cybersecurity lesson.html?course=cybersecurity&lesson=1` or `?course=ethicalhacking&lesson=1`: lesson player cloned from the existing `lesson.html`, retaining language selection, lesson-history drawer, narration, PDF/share support, XP, coins, hearts/refill, Firestore quiz saving and ordered course progress.
- `cybersecurity certificate.html`: special certificate center.
- `cybersecurity certificate setup.html?course=cybersecurity&level=beginner` (or `ethicalhacking`, `professional`, `level=grand_master`): eligibility and issuance.
- `cybersecurity certificate view.html?id=...`: view, print, download PNG, export public record and share verification URL.
- `cybersecurity certificate verify.html?id=...`: public record verification. `cybersecurity verify.html` is an alias.

## Course data and visuals
Twenty per-lesson JSON files and two aggregate course manifests (`cybersecurity_course.json` and `ethicalhacking_course.json`) are in the website root. The manifests embed the full 10-lesson course content for inspection/export. Per-lesson files are in the website root: `cybersecurity_lesson_1.json` through `_10.json` and `ethicalhacking_lesson_1.json` through `_10.json`. Each lesson contains six unique root-level SVG diagrams (120 total), at least five trusted practice/reference links, multiple teaching sections, a controlled practice example, and five knowledge-check questions. The question order is randomized within the quiz section while question IDs remain stable so existing per-user answer persistence remains correct.

## XP and certificates
The new lesson route reuses the original answer handler: each correct answer awards 5 XP and 2.5 coins; an incorrect answer removes one heart; the existing heart regeneration/refill flow remains in use. Completing each lesson updates the same `users/{uid}` progress fields under `progress.cybersecurity` and `progress.ethicalhacking`, plus `completedLessons` and `lessonQuestionResults`. Beginner eligibility requires 5 completed lessons and at least 50% saved quiz accuracy for those lessons; Professional requires all 10 and at least 50%; Grandmaster requires both tracks complete and the four Beginner/Professional certificates already issued.

## Certificate data/privacy
Public records in `certificates/{credentialId}` include only verification details. Signature and optional photo are stored with the learner's private `users/{uid}/certificates/{course_tier}` record, not on the public root document. The verification page does not reveal account email, Firebase UID, quiz history or private signature/photo. Certificate issuance uses a Firestore batch; the active Firebase rules still need to permit the needed writes and reads. This patch does not modify production Firestore rules.

## Safety and external resources
The ethical-hacking course is limited to the learner's own systems or training labs covered by explicit written authorization. It does not teach collecting private information about suspected people or obtaining real credentials. Practice examples use synthetic records, and external providers' rules must be followed.

## Deployment caveat
Static validations cover JSON parsing, each lesson's image/link/quiz counts, diagram file references, inline JavaScript syntax, core local routes and archive integrity. A live sign-in test and end-to-end Firestore certificate issue/verification test still need to be run after deployment in your configured Firebase project. A paid-premium entitlement gate is not imposed because the current repository does not expose a clearly defined, verified premium-entitlement field; once the app's billing system has a single trusted activation field, access can be locked to that verified value without guessing and accidentally blocking legitimate learners.

# Code Academy — New Learning Pages

## What I inspected

The uploaded archive is `Code-Academy--main.zip`. It originally contains 184 HTML pages; this update adds three new pages, for 187 HTML pages in the updated project, plus shared JavaScript/CSS and lesson content. Key learner flows inspected for overlap and integration included:

- `course.html` (the current all-courses entry page), `menu.html`, `progress.html`, and `profile.html`.
- `plan.html` for study scheduling and reminders, `time.html` for focus/activity timing, and `note.html` for general notes.
- `lesson.html`, `quiz.html`, `App_quiz.html`, `challenge.html`, `ready-projects.html`, `project.html`, `community.html`, `textbook-library-v3.html`, and existing course dashboards.
- `authentication.js` and `notification-engine.js`, which already provide the shared Firebase account helpers/profile path and per-user `users/{uid}/notifications` feed.

The archive does not contain a file named `Courses.html` (capital C); the current all-courses entry is `course.html`. `main_dashboard.html` also exists as a simpler, separate dashboard that stores an XP/course sample in localStorage. The new pages do not change that legacy dashboard or its XP logic.

## Pages added

### 1. `learning-roadmap.html` — recommended course path

The learner chooses one of four skill pathways: Frontend Web, Python & Backend, Software Foundations, or Cybersecurity Foundations. The page reads the existing account's progress, completed lessons, and certificates to show course states and propose the next course. It also looks at the learner's saved Mistake Notebook for review signals. The selected pathway is saved to `users/{uid}/learningTools/learningRoadmap`.

This is deliberately different from the existing `plan.html` timetable and `progress.html` dashboard: it is a course-sequencing and next-step page, not another calendar or XP dashboard.

### 2. `practice-lab.html` — spaced-repetition practice

The page provides 12 starter questions across HTML, CSS, JavaScript, Python, React, SQL, and general programming fundamentals. It shows an explanation after an answer and records per-question attempts, accuracy, streak, and a next review date. Correct-answer intervals grow (1, 3, 7, 14, then 30 days); incorrect answers return after one day. Review state is saved to `users/{uid}/learningTools/practiceReview`.

The practice questions are a new small starter bank; this page does not claim to index every existing quiz/lesson question. It deliberately does not award XP or rewrite course progress to avoid duplicate or accidental rewards.

### 3. `mistake-notebook.html` — a private error-to-learning log

Learners record the course, topic, what went wrong, corrected code/approach, and why the fix works. Entries can be searched, filtered, edited, deleted, and marked as needing review or relearned. The page hides the correction behind a reveal control to encourage recall first. Entries are saved to `users/{uid}/learningTools/mistakeNotebook`.

This differs from the existing `note.html`, which is a general notes page: the notebook is structured around mistakes, corrections, explanations, and deliberate review.

## Shared integration files

- `learning-tools-engine.js`: uses the existing `authentication.js`, account profile, email-verification flow, and `notification-engine.js`.
- `learning-tools.css`: shared responsive dark/cyan/violet styling aligned with the app's current visual language.
- `LEARNING-TOOLS-FIRESTORE-RULES.txt`: owner-only Firestore rules addition to consider if the deployed rule set does not already authorize `users/{uid}/learningTools/{toolId}`.

The three pages require a signed-in account. Unauthenticated users go to `login.html`; unverified email/password accounts go to `email-action.html?pending=1`, in line with the app's existing verification flow. The Google provider is not made to repeat the password-provider verification flow.

Each page includes the shared per-user notification feed and can display/update the same notices used by the existing app. Practice completion and mistake-review events can generate notifications through the existing central notification engine. Notifications link only to same-origin app URLs in the new shared UI.

## Navigation updates

- `menu.html`: added a **Study Tools** section with Learning Roadmap, Practice Lab, and Mistake Notebook.
- `course.html`: added the same three destinations to its side navigation.
- `sw.js`: bumped the app-shell cache version and added the new pages/shared assets to the static pre-cache list.
- `manifest.json`: added app shortcuts for the three new learning tools.
- The new pages link back to the existing menu, courses, progress, and profile pages.

## Authentication and role handling

The archive has a shared authenticated-user/profile system, but no central, consistent role schema or role authorization policy was found in the account integration inspected. The new pages therefore stay available to authenticated learners and read an optional `role`, `accountRole`, or `userRole` field only to display an account label if one already exists. They do not invent an admin/teacher permission model, elevate roles, or expose privileged actions. Client-side visibility alone should never be used to secure admin data.

## Storage and existing feature safety

The new tools store their own documents beneath the signed-in user's document path and use a UID-specific localStorage backup if Firestore access fails. They do not overwrite the root user document and do not write XP, coins, streaks, certificates, or course progress.

To enable cloud sync, merge `LEARNING-TOOLS-FIRESTORE-RULES.txt` into your deployed Firestore rules if required. The snippet is not a replacement for your current rules and does not deploy itself. Without permission to read/write the new subcollection, the tools will continue to save locally and visibly report a cloud-sync issue.

## Files in this update

Added:
- `learning-roadmap.html`
- `practice-lab.html`
- `mistake-notebook.html`
- `learning-tools-engine.js`
- `learning-tools.css`
- `LEARNING-TOOLS-FIRESTORE-RULES.txt`
- `LEARNING-PAGES-IMPLEMENTATION.md`

Updated:
- `menu.html`
- `course.html`
- `sw.js`
- `manifest.json`

## Validation performed

- Checked syntax of each new inline JavaScript module and `learning-tools-engine.js` with Node's parser.
- Checked the route references in the new navigation and verified required shared files exist in the project root.
- Confirmed the original app-specific auth module and notification engine are reused; no second Firebase configuration is added.

This is static/source validation only. The ZIP was not deployed to Firebase Hosting/GitHub Pages and has not been tested against your live Firebase credentials or Firestore rules. The bundled Android APK/AAB files, if present in the project archive, have not been rebuilt; this update changes web source files only. Please test sign-in, email-verification routing, Firestore sync, notifications, and mobile layouts in your deployed/staging environment.

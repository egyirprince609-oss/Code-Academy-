# Code Academy — Course Home Redesign

## What changed

- Rebuilt `course.html` as a responsive, searchable course catalogue showing **22 tracks**. This includes the 20 language/web/data tracks already listed and the existing Cybersecurity and Ethical Hacking tracks.
- Rebuilt the five original course overview files: `HTML.html`, `CSS.html`, `JavaScript.html`, `Python.html`, and `React.html`.
- Added 17 root-level course home pages for the other tracks. No new application folders were created.
- Added the shared root-level `course-home.css` and `course-home.js` assets for responsive layouts, course-specific imagery/theme, animated hero panels, course actions, authentication, profile stats, and notifications.
- Added `course-resource.html`, a working course-aware page for roadmaps, cheat sheets, mini-project prompts, practice challenges, study plans, concepts, and short quizzes. Added `courses.html` as a root-level compatibility redirect because five preserved legacy dashboard pages link to that filename while the canonical catalogue is `course.html`.

## Course-home routes and preserved lesson dashboards

| Course home | Start Lesson destination |
|---|---|
| `HTML.html` | `html_dashboard.html` |
| `CSS.html` | `css_dashboard.html` |
| `JavaScript.html` | `javascript_dashboard.html` |
| `Python.html` | `python_dashboard.html` |
| `React.html` | `react_dashboard.html` |
| `java-home.html` | `Java.html` |
| `c-home.html` | `C.html` |
| `cplusplus-home.html` | `CPlusPlus.html` |
| `csharp-home.html` | `CSharp.html` |
| `php-home.html` | `PHP.html` |
| `typescript-home.html` | `TypeScript.html` |
| `go-home.html` | `Go.html` |
| `rust-home.html` | `Rust.html` |
| `kotlin-home.html` | `Kotlin.html` |
| `swift-home.html` | `Swift.html` |
| `dart-home.html` | `Dart.html` |
| `ruby-home.html` | `Ruby.html` |
| `sql-home.html` | `SQL.html` |
| `r-home.html` | `R.html` |
| `lua-home.html` | `Lua.html` |
| `cybersecurity-home.html` | `cybersecurity dashboard.html` |
| `ethical-hacking-home.html` | `ethical hacking dashboard.html` |

Every home page has **21 course action cards** plus the hero navigation buttons. Dedicated existing editors are linked where available; Rust, Kotlin, and Dart use the existing multi-language `CODEEDITOR.html` workspace. The security tracks use their existing security tools rather than pretending to offer a language-specific code editor.

## Authentication and notifications

The new pages use the existing `authentication.js` module. Authenticated profile data is read from the existing `users/{uid}` document. The notification drawer listens to `users/{uid}/notifications`, shows unread counts, opens notification destinations, and supports marking one or all notifications as read. Password-provider accounts that still require email verification are routed to the existing verification flow.

## Preservation and checks

- The existing `menu.html`, `lesson.html`, `authentication.js`, `notification-engine.js`, all 22 original lesson-dashboard destinations listed above, and their lesson content were left unchanged.
- Static validation found 22 course configurations, verified every configured home/lesson/editor destination exists, and confirmed 21 launchpad actions per course.
- The protected dashboard/authentication files were compared byte-for-byte with the originally uploaded ZIP and are unchanged.
- Live Firebase sign-in, Firestore security-rule permissions, and a real authenticated browser session were not available for end-to-end verification in this environment; those should still be checked after deployment.

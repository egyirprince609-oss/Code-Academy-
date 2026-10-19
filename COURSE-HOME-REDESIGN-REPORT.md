# Code Academy Course Home & Route Fix

## Preservation boundary
- The original `course.html` catalogue's layout, CSS, external course-logo URLs, search behavior, user profile/XP rendering, loading spinner, Firestore profile read, and authentication redirect were preserved.
- The only changes made inside `course.html` are the 20 values used by the catalogue's `file` destinations. Those values now go to new course-home files.
- `Courses.html` is a same-content, exact-case compatibility copy of the updated `course.html` for callers that use that spelling.
- Existing lesson dashboards, `lesson.html`, lesson JSON, coding editors, `authentication.js`, `notification-engine.js`, `menu.html`, settings, messages, and progress pages were not overwritten.

## New root-level pages
- 22 course home pages, including the two separate security tracks (not inserted into the 20-card catalogue).
- 440 unique course-specific destination pages: 20 per track.
- One shared `share-code-academy.html` page, using native mobile sharing with clipboard fallback.
- 22 course-specific 1200×630 Open Graph preview images (`og-*.png`). Every generated home and resource page includes Open Graph and Twitter large-image metadata; each course description is at least 163 characters.

## Navigation and connections
- Every home has 20 route cards with a distinct, existing root-level destination page.
- The prominent `Start Lesson` buttons lead to the project's existing course lesson dashboards/pages.
- The editor route cards land on course-specific resource pages whose launch actions target the actual editor/workspace already present in the project; no fake editor implementation was added.
- Home/resource pages use the existing `authentication.js` Firebase auth and profile documents. They read the existing per-user notifications at `users/{uid}/notifications`, display unread counts and current notification content, and mark a notification read before following its in-app link where possible.
- The new course pages include working routes to the current dashboard, account progress, quiz/challenge tools, project workspace, AI Mentor, messages/notes and settings pages.
- Every course home uses a fixed-height `100dvh` layout with page-level overflow disabled and responsive compact layouts. Small notification panels can scroll internally; the page itself does not.

## File-count arithmetic
The requested structure of 22 homes + 20 extra destination pages per course is 22 × 21 = 462 course-specific pages, not 421. Adding the `Courses.html` compatibility copy and the common share page means **464 new HTML files**, plus the modified original `course.html`, 22 preview images and this report.

## Testing notes
- All 22 course-home files, all 440 action destination files, and all 22 preview images are present at the project root.
- Local links from the new course homes/resources to generated pages and existing root files were checked.
- Python syntax-level generation checks and ZIP integrity checks passed.
- A real signed-in Firebase browser session is not available in this packaging environment. Live auth permissions, Firestore notification rules, and share-menu behavior should therefore receive a final smoke test after deployment.

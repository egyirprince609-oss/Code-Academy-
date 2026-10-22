# Code Academy — Ready-to-Do Projects

Added 255 progressive project starters (17 editors × 15 samples each), a card-based responsive gallery, direct editor handoff, ZIP download and optional folder extraction.

## New root files
- `ready-projects.html` — feature page and sharing metadata.
- `ready-projects.js` — Firebase auth gate, search/filter, modal, download/extraction and editor handoff.
- `ready-projects.json` — 255 projects including commented code and per-project README/requirements where needed.
- `ready-projects-preview.png` — social preview in the website root (1200×630).
- `ready-player-ship.png`, `ready-enemy-drone.png`, `ready-target.png`, `ready-road.png` — generated root-level visual assets; relevant Python game ZIPs include their PNG assets under each project's `assets/` directory.

## Editor integration
`CODEEDITOR.html` recognizes `?lang=LANGUAGE&ready=TOKEN`, imports all the starter's text files and selects the correct entry file. For a verified user, it creates a separate project document in `users/{uid}/projects/ready_TOKEN`; it does not overwrite the usual language starter. If email verification is still pending, the project opens locally and the page asks the user to verify before cloud saving.

## Deploy
Upload these root files and the modified `CODEEDITOR.html`, `editor-dashboard.html`, `project.html` and `menu.html` into the repository root. Do not put them in a folder. Retain your existing `authentication.js` and Firebase rules.

## Extraction behavior
When supported, the page asks permission to write files into a user-selected folder and shows the chosen directory name plus relative project path. Browser privacy controls prevent web pages from reading the absolute device filesystem path. If direct folder access is unavailable, it downloads a ZIP to the browser's Downloads location instead.

## Runtime notes
Projects with no dependencies use built-in language features. Python pygame examples and the scikit-learn example include setup notes and requirements. They can be opened for editing in the browser, but require a compatible local Python runtime to fully run. Compiled languages may require the current editor compiler service or a local toolchain. The gallery accurately labels these requirements.

## Validation
- 255 project records validated: 15 per editor, stage 15 marked Grandmaster.
- Each record has an entry file and README/source content.
- Inline HTML and JS syntax checks and archive integrity checks are run before delivery.
- Live Firebase authentication/saving must be verified after deploying under your existing Firestore security rules.

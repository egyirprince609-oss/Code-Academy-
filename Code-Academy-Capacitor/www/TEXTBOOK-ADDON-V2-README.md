# Code Academy Textbook Add-on v2 — Additive patch only

## This ZIP is not a replacement project

This ZIP contains only newly created files for your existing Code Academy repository. It does **not** include a copy of the app, and it does not replace `lesson.html`, `authentication.js`, the dashboard, existing lesson data, `logo.png`, or current course images. The new engine, styles, verification registry, metadata art, and cover assets have `ca-textbook-…-v2` names. `textbook-library.html` and `verify-textbook.html` were checked against the uploaded repository and were not already present.

## Install from your phone

1. Download and extract this ZIP.
2. Open the existing Code Academy repository—the root containing `index.html`, `lesson.html`, `logo.png`, and course lesson data.
3. Upload only the files in this patch and the complete `ca-textbook-assets-v2/` folder into that root. Do not delete or replace existing files.
4. Commit and allow GitHub Pages to publish.
5. Open `textbook-library.html` to use the builder and `verify-textbook.html` to check book codes.
6. Add a link to `textbook-library.html` in your finished app menu when you are ready. This patch deliberately does not edit your existing dashboard or navigation.

## Reading original lesson files

The loader tries common root-level formats including `html_lesson_1.json`, `javascript_lesson_1.json`, `HTML lesson 1.js1`, `html_lesson_1.js1`, and equivalent names for other courses. JSON-formatted `.js1` files are parsed as data and never executed as source code. Supported `quiz` blocks are omitted from the teaching pages and placed after the corresponding lesson. Code blocks and headings keep distinct print styling.

The ZIP you supplied contains ten lesson-file paths each for **HTML, CSS, JavaScript, and React** (40 paths total). The `html_lesson_4.json` file is empty/invalid JSON in the uploaded project, so the builder correctly flags HTML lesson 4 as missing source data. I did not find original lesson files for the other 16 courses in the uploaded ZIP. All twenty courses are selectable, but the builder reports which source lesson files were found and only uses the embedded, separately named publisher curriculum for the missing lesson numbers. When you upload the real source files later with a supported naming style, it will load those files without overwriting them.

## Each generated book contains

- A separate course cover illustration, publisher details, internal book ID, QR code, and Code 128 barcode.
- Copyright and responsible-use notes, acknowledgements, table of contents with generated page numbers, preface, usage guide, and course roadmap.
- Source lesson content, when present, plus enhanced concept explanations, worked application, code lab, debugging checklist, practical assignment, and notes.
- Lesson exercise pages kept separate from the teaching pages.
- A cumulative bank of **300 distinct scenario-based multiple-choice questions per course**, with four alternatives per item.
- A blank working page after the cumulative bank, followed by solutions and explanations for the assessment items.
- A glossary and back cover with author biography and the textbook series list.

Each question and each keyed solution occupies an intentional print page. The resulting design is meant to exceed 500 A4 page sections per course. Check the real browser print/PDF preview before printing; browser page count can vary if a printer or browser changes scaling, margins, or font metrics.

Use **Print / Save PDF** and choose **Save as PDF** in the print dialog. Use **Download standalone HTML** to save the generated book as one HTML file with available artwork embedded. Keep the original app repository backed up separately.

## QR, barcode, and verification caveat

Each initial 2026 course has an internal Code Academy book ID (for example `CAP-2026-HTM-001`), a separate verification code, a QR image opening the public verification page, and a scannable Code 128 barcode that carries the book ID. These are internal publisher IDs—not ISBNs.

The verifier requires both book ID and verification code. It supports direct QR links, manual verification, and a camera scanner if the page is served over HTTPS, the scanner library loads, and camera permission is granted. Positive verification confirms the entry in this static registry, but a copier could reproduce the QR/barcode too. Strong anti-counterfeit enforcement requires a protected server-side registry or another protected verification service. This static page is not cryptographic proof that a physical copy is unique.

## Review before a public or commercial edition

- Review subject accuracy, answers, terminology, and grammar; run all code examples against the current language/framework versions.
- Some original source quizzes may not include a reliable answer key. Those are labelled for editorial review rather than assigned a guessed answer.
- Check external URL domains, HTTPS, version compatibility, and third-party licenses. Never put secrets or private learner information in unknown online tools.
- Test a printed proof, QR scan, and barcode scan with a second device.
- The bio is based on details supplied by the author. No postal-office box or ISBN has been invented.

## Files in this patch

- `textbook-library.html`
- `verify-textbook.html`
- `ca-textbook-engine-v2.js`
- `ca-textbook-curriculum-v2.js`
- `ca-textbook-registry-v2.js`
- `ca-textbook-verify-v2.js`
- `ca-textbook-theme-v2.css`
- `ca-textbook-assets-v2/` — twenty new course covers, twenty QR images, twenty barcodes, author photo under a unique filename, and the social-preview image.

# Code Academy Textbook Add-on v3 (root-only)

This is an additive package for the existing Code Academy repository. It does **not** contain or replace your app. All files in this ZIP are at the archive root; no extra folder is needed.

## Files

- `textbook-library-v3.html` — responsive textbook studio.
- `verify-textbook-v3.html` — public verification page with camera scanning for QR and common barcode formats, plus manual entry.
- `ca-textbook-engine-v3.js` — reads original source lesson files; builds the book pages; generates runtime covers; calls QR/barcode generation.
- `ca-textbook-curriculum-v3.js` — independent supplemental curriculum for the 20 programming books plus the extra Cybersecurity book.
- `ca-textbook-theme-v3.css` — print layout and responsive interface.
- `ca-textbook-firebase-v3.js` — shared global Firebase registry (`textbookRegistryV3`), no per-learner account records.
- `textbook-registry-rules-fragment-v3.json` — the new RTDB rule subtree to merge into your existing rules.
- `ca-textbook-author-photo-v3.jpg` — your provided author portrait renamed for this add-on only.
- `ca-textbook-social-preview-v3.png` — Open Graph / social metadata image.

The QR codes are generated in the browser using QRCode.js and the barcodes using JsBarcode; no QR/barcode images are stored in a folder. Course cover artwork is generated at runtime as an SVG data URI. The only new images are the author photo and the one share-preview graphic, both at the repository root.

## Install safely

1. Download and extract this ZIP.
2. Upload **only these root files** into the existing `Code-Academy-` repository. Do not replace `authentication.js`, original lessons, `logo.png`, dashboard pages, or any existing application file.
3. Open the Firebase Console for project `codeacademybywm` → Realtime Database → Rules.
4. **Merge the `textbookRegistryV3` child from `textbook-registry-rules-fragment-v3.json` into the existing top-level `rules` object. Do not replace your app's current rules with this fragment.** Review existing ancestor rules before publishing; a broad `.read`/`.write` grant on an ancestor can override child-level restrictions.
5. The write rule permits only a signed-in user whose **verified email** is `egyirwisemanprince@gmail.com` or `egyirpnce609@gmail.com`. Verify the publisher email in Firebase Authentication, then sign into your existing Code Academy app in the same browser origin.
6. Visit `textbook-library-v3.html` and select **Register textbooks in Firebase**. It creates or reuses one global registry record per course (20 existing curriculum titles plus Cybersecurity). The registry path is shared publisher data and is not nested under `/users/{uid}`.
7. Build a book. The builder reads lesson sources at root using patterns like `html_lesson_1.json`, `html_lesson_1.js1`, `HTML lesson 1.js1`, and related filename variants. Original files are fetched and never edited. If a `.json` file contains a JSON object inside an assignment wrapper, the reader extracts and parses that object as data; it does not execute the wrapper's code. When a source lesson truly cannot be parsed or found, the system labels the source gap and adds the separate supplemental curriculum.
8. Use **Print / Save PDF** and select A4 / Save as PDF. Verify page count and page breaks in the browser print preview before making a commercial print run.

## Firebase data model

The database path is `/textbookRegistryV3/{courseId}`. Each record contains a random generated `bookId`, a random `verificationCode`, course/title, publisher, issuance time, status, publisher UID/email and verification URL. The QR encodes the verification URL; the Code 128 barcode encodes the book ID. Public verification reads the shared registry and checks status plus the code when it is supplied.

**Security warning:** the browser JavaScript cannot safely hide privileged access. The Firebase security rules are the actual authority and must be merged correctly. Never make the entire Realtime Database publicly writable. If the rules deny access, the site displays an error rather than pretending a record was registered.

## Page count and editorial quality

The book template makes one designed print section per question and one per answer explanation. A 300-question bank plus its 300 solutions already creates 600 dedicated sections before front matter, original lessons, chapter supplements, lesson exercises, blank working page, glossary, and back cover. The UI counts those page sections; browser print engines and text wrapping can affect final pagination. Confirm the actual PDF is 500+ physical pages before publication; the app does not insert hundreds of meaningless blank pages to claim a page count.

The extra Cybersecurity course covers lawful scope, defensive networks, threat modelling, identity/access controls, hardening, secure coding, monitoring, authorized lab testing, cloud/backup/privacy, and a defensive capstone. Its labs are designed for fictional or owned/authorized environments.

Before sale/publication, have a qualified reviewer check the generated lessons, answer keys, code examples, language versions, URLs, copyrights and licenses. The publisher ID is an internal tracking ID, not an ISBN. QR verification confirms an issued registry record but cannot prove a specific physical copy was not duplicated.

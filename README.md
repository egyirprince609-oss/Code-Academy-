# Code Academy — 200 Lesson JSON Pack

This pack contains 200 root-level lesson JSON files for the 20 course IDs supported by the supplied `lesson.html` and course dashboards. Each course has lessons 1–10.

## Installation

1. Unzip this archive.
2. Copy all 200 `.json` files into the **same directory as `lesson.html`** in your Code Academy project (the repository root in the supplied ZIP). Do not put them in a separate subfolder unless you also change the loader in `lesson.html`.
3. Keep the filenames exactly as provided. The lesson engine fetches names such as `html_lesson_1.json`, `cplusplus_lesson_4.json`, and `python_lesson_10.json`.
4. Commit/publish the updated files and test each course from its dashboard.

## Included course IDs

`html`, `css`, `javascript`, `python`, `react`, `java`, `c`, `cplusplus`, `csharp`, `php`, `typescript`, `go`, `rust`, `kotlin`, `swift`, `dart`, `ruby`, `sql`, `r`, and `lua`. This is 20 courses × 10 lessons = 200 JSON files. The `cpp` URL alias is normalized by `lesson.html` to the `cplusplus` filename prefix.

## Content structure and validation

- Every regular lesson uses the project’s expected `course`, `lessonNumber`, `lessonId`, `title`, `subtitle`, `description`, `level`, `xpReward`, `coinsReward`, `estimatedMinutes`, and `blocks` fields.
- Regular lessons interleave short explanations, four code samples, and five multiple-choice application questions. A practical-editor direction appears immediately before every sample.
- Each Lesson 10 contains a short refresher, three code samples, and exactly 20 new review questions: two from each dashboard lesson topic, including two separate capstone/project questions for Lesson 10.
- Every JSON file was parsed after serialization; block IDs, file names, lesson numbering, page headings, code-sample counts, question counts, answer indexes, and code-editor directions were checked by the generator.

The samples are designed as learning examples and should still be run in the intended language/editor when integrating the content into a production course. Database examples assume the displayed illustrative schema, and some advanced features may require a correctly configured language project or runtime.

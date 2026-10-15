# Code Academy Editor runtime changes

## Language paths

The editor dashboard now links 17 routes: General, HTML, CSS, JavaScript, Python, TypeScript, Java, C, C++, C#, PHP, Ruby, Go, Swift, Lua, R and SQL. Their preview images and the editor logo are stored at the website root, so GitHub Pages can serve the Open Graph image directly without an `editor-assets/` directory.

## Run behavior

- HTML/CSS/JavaScript and React continue to use a sandboxed browser preview.
- Python runs through Pyodide in a Web Worker and sends stdout to the broad output preview.
- TypeScript uses the TypeScript compiler's `transpileModule` API, then runs the emitted JavaScript in the browser preview; this removes the previous `Babel is not defined` path for `.ts` files.
- SQL uses sql.js 1.14.2 with an in-memory SQLite database. This is a teaching/test database and is not a persistent or production database connection.
- The other compiled-language routes discover current compiler names from the Wandbox API and call its compiler endpoint. A first-run confirmation explains that source code is sent to the third-party service. Service availability and exact compiler support can change; missing compiler or network failures are surfaced as errors rather than silent success.

## Runtime CDN pins

- Monaco Editor 0.57.0 (shared editor engine)
- Pyodide 314.0.7 (existing Python Web Worker runtime)
- TypeScript 6.0.3 browser compiler
- sql.js 1.14.2
- Wandbox public compiler API (`https://wandbox.org/api/list.json` and `/api/compile.json`)

## Deployment notes

Upload the contents of this ZIP to the existing GitHub Pages repository root, preserving the existing `authentication.js` and other app files. The new language wrapper pages redirect to `CODEEDITOR.html?lang=...`, where existing Firebase Authentication and account save checks remain in place. External compilation requires internet connectivity and is not a replacement for a private production compiler backend.

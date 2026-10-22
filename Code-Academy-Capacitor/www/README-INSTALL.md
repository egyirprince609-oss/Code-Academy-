# Code Academy — coordinated editor update

This package contains ten editor pages, the shared project page, and the editor dashboard. Language-specific runtime logic is embedded in each HTML editor page, so the update does not add separate C++/Python/runtime-library JavaScript files.

## Pages in this package

- `CODEEDITOR.html` — general editor with HTML/CSS/JavaScript preview and configured hosted compile requests for languages exposed by the live compiler catalog.
- `PythonEditor.html` — Python editor with its Pyodide runtime embedded inline.
- `CppEditor.html` — C++ editor with the Compiler Explorer compiler/library adapters embedded inline.
- `ReactEditor.html` — React/JSX browser preview.
- `CSharpEditor.html` — C# editor using a compiler only when the live Wandbox catalog lists one.
- `TypeScriptEditor.html` — TypeScript transpilation and browser-sandbox output.
- `CEditor.html` — C editor using a compiler from the live Wandbox catalog.
- `GoEditor.html` — Go editor using a compiler from the live Wandbox catalog.
- `LuaEditor.html` — Lua editor using a compiler/runtime from the live Wandbox catalog.
- `REditor.html` — R editor when the live catalog provides an R compiler.
- `project.html` — shared project listing, starter project creation, and editor routing.
- `editor-dashboard.html` — editor dashboard with language-specific logos, filtering, create/open actions, and return navigation.

## Install

1. Extract this ZIP.
2. Upload the included ten editor pages, `project.html`, and `editor-dashboard.html` into the **root** of the existing GitHub repository, replacing the files with matching names.
3. Keep your existing `authentication.js`, Firebase configuration and security rules, `login.html`, `menu.html`, and `logo.png`. The editors import your existing shared authentication module; do not delete it.
4. Commit and push the changes. Open `editor-dashboard.html` and create a workspace for each language, or create a language starter from `project.html`.

All pages use the same Firestore path `users/{uid}/projects/{projectId}` and the shared `files` map (`{path: {lang, content}}`) and `folders` map. Opening a saved project is routed by its `editorType`/`language` metadata and then by file extension as a fallback. Every editor has an Exit button to `menu.html`; the editor dashboard's Exit returns to the previous same-site page when available.

## Runtimes and library limits

- The C++ page uses the Compiler Explorer REST API for its compiler catalog, external-library catalog, compile request, and formatting where available. API details: https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/API.md
- The general editor and C/C#/Go/Lua/R pages query the Wandbox compiler catalog and submit compile/run requests to `https://wandbox.org/api/list.json` and `https://wandbox.org/api/compile.json`.
- Hosted compiler services can be offline, rate limited, or may stop listing a language/compiler. If a language is absent from the live catalog, the editor reports that actual condition rather than pretending the code ran.
- Remote compilation sends the current source and any supported extra source files to the third-party compiler service. Do not enter passwords, tokens, or other secrets in code.
- Python packages are limited to what the embedded Pyodide build provides and what that runtime can load. React uses browser React/ReactDOM plus Babel; it is not a full npm/Vite workspace. TypeScript is transpiled for browser execution and is not a full `tsconfig`/npm build. NuGet, Go module downloads, LuaRocks, and arbitrary R packages are not automatically installed by these hosted compile endpoints.

## Validation performed

- Node.js syntax checks passed for the inline scripts in all 12 HTML pages (17 inline scripts checked).
- No duplicate HTML IDs were found; required editor Exit controls and literal internal HTML links were checked.
- Project routes were tested for all ten editor types, and file-association patterns were tested for JSX, C#, TypeScript, C, Go, Lua, and R extensions.
- Example programs were compiled and run locally with GCC/G++ (C11 and C++20) and Go.
- Runtime request/response handling has mocked tests. A live browser session against your actual Firebase project and live hosted compiler services was not available in the build environment, so those deployments still need to be tested after upload.

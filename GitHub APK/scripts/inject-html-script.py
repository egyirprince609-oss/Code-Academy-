#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 4:
    raise SystemExit("Usage: inject-html-script.py WEB_DIR /script.js marker-name")
root = Path(sys.argv[1]).resolve()
url = sys.argv[2]
marker = sys.argv[3]
if not root.is_dir():
    raise SystemExit(f"Web directory not found: {root}")
tag = f'<script src="{url}" data-{marker}></script>'
changed = 0
for path in root.rglob("*.html"):
    try:
        source = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    if f"data-{marker}" in source:
        continue
    lower = source.lower()
    body_pos = lower.rfind("</body>")
    html_pos = lower.rfind("</html>")
    pos = body_pos if body_pos >= 0 else html_pos
    if pos >= 0:
        source = source[:pos] + tag + "\n" + source[pos:]
    else:
        source = source.rstrip() + "\n" + tag + "\n"
    path.write_text(source, encoding="utf-8")
    changed += 1
print(f"Native bridge injected into {changed} HTML file(s); already-tagged pages unchanged.")

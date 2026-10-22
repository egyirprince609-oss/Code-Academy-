#!/usr/bin/env python3
from pathlib import Path
import re
import sys
if len(sys.argv) != 3:
    raise SystemExit('Usage: remove-html-script.py WEB_DIR marker-name')
root = Path(sys.argv[1]).resolve()
marker = sys.argv[2]
pattern = re.compile(r'\s*<script\b[^>]*data-' + re.escape(marker) + r'[^>]*></script>', re.I)
changed = 0
for path in root.rglob('*.html'):
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    new_text = pattern.sub('', text)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        changed += 1
print(f'{marker}: removed from {changed} HTML file(s).')

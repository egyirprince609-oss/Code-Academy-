from pathlib import Path
import shutil
ROOT = Path(__file__).resolve().parents[2]
DEST = Path(__file__).resolve().parents[1] / 'app' / 'src' / 'main' / 'assets' / 'www'
FILES = [
    'browser.html', 'browser.css', 'browser.js',
    'browser-settings.html', 'browser-settings.css', 'browser-settings.js',
    'browser-manifest.json', 'browser-icon-192.png', 'browser-icon-512.png',
    'browser_image_preview.png', 'authentication.js', 'sw.js'
]
DEST.mkdir(parents=True, exist_ok=True)
for name in FILES:
    source = ROOT / name
    if source.exists(): shutil.copy2(source, DEST / name)
    else: print(f'Optional browser asset missing: {source}')
print(f'Copied browser UI assets into {DEST}')

from pathlib import Path
import shutil
BROWSER_ROOT = Path(__file__).resolve().parents[2]
DEST = Path(__file__).resolve().parents[1] / 'app' / 'src' / 'main' / 'assets' / 'www'
EXCLUDE = {'native-android', 'capacitor', 'node_modules', 'www', '__pycache__'}
if DEST.exists():
    shutil.rmtree(DEST)
DEST.mkdir(parents=True, exist_ok=True)
for item in BROWSER_ROOT.iterdir():
    if item.name in EXCLUDE or item.name.startswith('.'):
        continue
    target = DEST / item.name
    if item.is_dir(): shutil.copytree(item, target)
    elif item.is_file(): shutil.copy2(item, target)
print(f'Copied Code Academy Browser web shell and all local dependencies into {DEST}')

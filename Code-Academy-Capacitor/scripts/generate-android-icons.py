#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageOps, ImageColor
import sys
if len(sys.argv) != 3:
    raise SystemExit('Usage: generate-android-icons.py logo.png android/app/src/main/res')
src=Path(sys.argv[1]); res=Path(sys.argv[2])
if not src.is_file(): raise SystemExit(f'Logo not found: {src}')
logo=Image.open(src).convert('RGBA')
alpha=logo.getchannel('A')
bbox=alpha.getbbox()
if bbox: logo=logo.crop(bbox)
# Draw only the mark in the adaptive foreground. Android supplies the background/mask.
foreground_sizes={'mdpi':108,'hdpi':162,'xhdpi':216,'xxhdpi':324,'xxxhdpi':432}
legacy_sizes={'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
bg=ImageColor.getrgb('#0B1020')
for density, size in foreground_sizes.items():
    d=res/f'mipmap-{density}'; d.mkdir(parents=True,exist_ok=True)
    fg=Image.new('RGBA',(size,size),(0,0,0,0))
    art=logo.copy()
    art.thumbnail((int(size*.68),int(size*.68)),Image.Resampling.LANCZOS)
    fg.alpha_composite(art,((size-art.width)//2,(size-art.height)//2))
    fg.save(d/'ic_launcher_foreground.png',optimize=True)
    Image.new('RGB',(size,size),bg).save(d/'ic_launcher_background.png',optimize=True)
    legacy=Image.new('RGBA',(legacy_sizes[density],legacy_sizes[density]),bg+(255,))
    art2=logo.copy(); max_side=int(legacy_sizes[density]*.82)
    art2.thumbnail((max_side,max_side),Image.Resampling.LANCZOS)
    legacy.alpha_composite(art2,((legacy.width-art2.width)//2,(legacy.height-art2.height)//2))
    legacy.convert('RGB').save(d/'ic_launcher.png',optimize=True)
    legacy.convert('RGB').save(d/'ic_launcher_round.png',optimize=True)
# Adaptive icon resources use density-specific foreground/background images.
adaptive=res/'mipmap-anydpi-v26'; adaptive.mkdir(parents=True,exist_ok=True)
for n in ('ic_launcher','ic_launcher_round'):
    (adaptive/f'{n}.xml').write_text(f'''<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background" />\n    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n''',encoding='utf-8')
print(f'Generated Code Academy launcher icon resources in {res}')

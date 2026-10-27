#!/usr/bin/env python3
"""Add requested runtime permissions and optional Firebase Gradle wiring."""
from pathlib import Path
import os
import re

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "android"
manifest = ANDROID / "app" / "src" / "main" / "AndroidManifest.xml"
app_gradle = ANDROID / "app" / "build.gradle"
root_gradle = ANDROID / "build.gradle"
if not manifest.is_file() or not app_gradle.is_file() or not root_gradle.is_file():
    raise SystemExit("Capacitor Android project is missing expected files; 'npx cap add android' must complete first.")

permissions = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.VIBRATE',
]
text = manifest.read_text(encoding="utf-8")
insertions = []
for permission in permissions:
    if f'name="{permission}"' not in text:
        insertions.append(f'    <uses-permission android:name="{permission}" />')
if insertions:
    app_pos = text.find("<application")
    if app_pos < 0:
        raise SystemExit("AndroidManifest.xml has no <application> node.")
    text = text[:app_pos] + "\n".join(insertions) + "\n\n    " + text[app_pos:]
    manifest.write_text(text, encoding="utf-8")

app_text = app_gradle.read_text(encoding="utf-8")
try:
    build_number = int(os.environ.get("GITHUB_RUN_NUMBER", "1"))
except ValueError:
    build_number = 1
build_number = max(1, min(build_number, 2_100_000_000))
if not re.search(r"(?m)^\s*versionCode\s+\d+\s*$", app_text):
    raise SystemExit("Could not find the versionCode setting in the generated Android app build.gradle.")
app_text = re.sub(r"(?m)^\s*versionCode\s+\d+\s*$", f"        versionCode {build_number}", app_text, count=1)
app_text = re.sub(r"(?m)^\s*versionName\s+[\"'][^\"']*[\"']\s*$", f'        versionName "1.0.{build_number}"', app_text, count=1)
app_gradle.write_text(app_text, encoding="utf-8")
apply_line = 'apply from: "$rootDir/../scripts/release-signing.gradle"'
if "release-signing.gradle" not in app_text:
    app_gradle.write_text(app_text.rstrip() + "\n\n// Code Academy GitHub Actions release signing\n" + apply_line + "\n", encoding="utf-8")

# Firebase remote push works only when the repo secret has supplied google-services.json.
services_json = ANDROID / "app" / "google-services.json"
if services_json.is_file():
    root_text = root_gradle.read_text(encoding="utf-8")
    if "com.google.gms:google-services" not in root_text:
        match = re.search(r"dependencies\s*\{", root_text)
        if not match:
            raise SystemExit("Could not safely find the Android buildscript dependencies block for Firebase.")
        at = match.end()
        root_text = root_text[:at] + "\n        classpath 'com.google.gms:google-services:4.4.4'" + root_text[at:]
        root_gradle.write_text(root_text, encoding="utf-8")
    app_text = app_gradle.read_text(encoding="utf-8")
    if "com.google.gms.google-services" not in app_text:
        app_gradle.write_text(app_text.rstrip() + "\n\napply plugin: 'com.google.gms.google-services'\n", encoding="utf-8")
    print("Firebase config found; Google Services Gradle wiring enabled.")
else:
    print("No google-services.json supplied. APK build can proceed, but remote push needs Firebase configuration later.")
print("Android permissions and release-signing hook configured. Runtime permission prompts still require app/user code and consent.")

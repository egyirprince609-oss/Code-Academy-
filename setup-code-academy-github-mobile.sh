#!/usr/bin/env bash
# Code Academy: prepare a root-sourced Capacitor Android build for GitHub Actions.
# Run this script from the root of the Code Academy Git repository.
set -Eeuo pipefail
IFS=$'\n\t'

say()  { printf '\n\033[1;36m[Code Academy] %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m[WARNING] %s\033[0m\n' "$*" >&2; }
die()  { printf '\n\033[1;31m[ERROR] %s\033[0m\n' "$*" >&2; exit 1; }

on_error() {
  local code=$?
  printf '\n[ERROR] Setup stopped at line %s (exit code %s). Files already created were not automatically deleted.\n' "${BASH_LINENO[0]:-unknown}" "$code" >&2
  exit "$code"
}
trap on_error ERR

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v git >/dev/null 2>&1 || die "git is required. In Termux run: pkg install git"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" || die "Place this script in the root of your cloned Code Academy Git repository, then run it there."
ROOT="$(cd -- "$ROOT" && pwd)"
[[ "$ROOT" == "$SCRIPT_DIR" ]] || die "This script must be stored at the repository root. Root detected: $ROOT; script is in: $SCRIPT_DIR"
[[ -d "$ROOT/.git" || -f "$ROOT/.git" ]] || die "The detected folder is not a Git checkout. Clone your Code Academy repository first."
[[ "$(basename -- "$ROOT")" != "Code-Academy-Capacitor" ]] || die "Do not run this from inside Code-Academy-Capacitor. Run it from the repository root."

# Termux-friendly dependency installation. Only ask to install when tools are missing.
missing=()
for bin in gh python3 openssl keytool npm base64; do command -v "$bin" >/dev/null 2>&1 || missing+=("$bin"); done
if ((${#missing[@]})); then
  if command -v pkg >/dev/null 2>&1; then
    printf 'Missing tools: %s\n' "${missing[*]}"
    read -r -p "Install GitHub CLI, Java, Python, OpenSSL and Node.js with Termux pkg now? [Y/n] " answer
    answer="${answer:-Y}"
    case "$answer" in
      [Yy]|[Yy][Ee][Ss])
        pkg update -y
        pkg install -y git gh openjdk-21 python openssl openssl-tool nodejs-lts coreutils
        ;;
      *) die "Install the missing tools first. Suggested Termux command: pkg install git gh openjdk-21 python openssl openssl-tool nodejs-lts coreutils" ;;
    esac
  else
    die "Missing required tools: ${missing[*]}. Install Git, GitHub CLI (gh), Python 3, OpenSSL, a JDK/keytool, Node.js/npm and base64, then rerun."
  fi
fi
for bin in git gh python3 openssl keytool npm base64; do command -v "$bin" >/dev/null 2>&1 || die "Required command still missing after dependency check: $bin"; done

gh auth status >/dev/null 2>&1 || die "GitHub CLI is not logged in. Run: gh auth login ; then rerun this script."
REMOTE_URL="$(git -C "$ROOT" remote get-url origin 2>/dev/null)" || die "No 'origin' remote found. Add your GitHub remote before running this script."
REPO="$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)" || die "GitHub CLI could not identify this repository. Check 'origin' and your GitHub access."
DEFAULT_BRANCH="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null)" || die "Could not determine the repository's default branch."
CURRENT_BRANCH="$(git -C "$ROOT" branch --show-current)"
[[ -n "$CURRENT_BRANCH" ]] || die "Git is in detached-HEAD mode. Check out a normal branch first."

# Never accidentally bundle unrelated staged changes into the setup commit.
if ! git -C "$ROOT" diff --cached --quiet; then
  die "There are already staged Git changes. Commit or unstage them before rerunning so this script does not commit unrelated work."
fi
while IFS= read -r status_line; do
  [[ -z "$status_line" ]] && continue
  status_path="${status_line:3}"
  case "$status_path" in
    setup-code-academy-github-mobile.sh|"GitHub APK"|"GitHub APK/"*|.github/workflows/code-academy-github-apk.yml|.github/workflows/code-academy-ios-simulator.yml)
      ;;
    *)
      die "Uncommitted repository file detected: $status_path. Commit your website changes first; GitHub Actions builds the committed root files, not private local edits."
      ;;
  esac
done < <(git -C "$ROOT" status --porcelain --untracked-files=all)

say "Repository: $REPO"
say "Local branch: $CURRENT_BRANCH | GitHub default branch: $DEFAULT_BRANCH"
say "Source: repository root only. Code-Academy-Capacitor will not be read or copied."
TRACKED_RELEASE_KEY=0
if git -C "$ROOT" ls-files --error-unmatch 'signing.keystore' >/dev/null 2>&1; then
  TRACKED_RELEASE_KEY=1
  warn "The root file signing.keystore is tracked by Git. This setup will NOT use or copy it. If that key has been pushed to a public repository, treat it as exposed. A different key can prevent upgrades over older APKs signed by the old key."
fi

# Discover existing signing secrets before creating anything. Do not silently replace a release key.
SECRET_NAMES="$(gh secret list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null)" || die "Could not list repository Actions secrets. Check that your GitHub account has permission to manage secrets in $REPO."
required_secrets=(ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD)
found_count=0
for name in "${required_secrets[@]}"; do
  if printf '%s\n' "$SECRET_NAMES" | grep -Fxq "$name"; then ((found_count+=1)); fi
done
SIGNING_MODE="new"
if ((found_count == 4)); then
  SIGNING_MODE="existing"
elif ((found_count > 0)); then
  SIGNING_MODE="partial"
  warn "Some Android signing secrets already exist ($found_count of 4). They will NOT be overwritten. The pipeline will produce a debug APK until all four secrets are consistently configured."
fi
if [[ "$TRACKED_RELEASE_KEY" == "1" ]]; then
  if [[ "$SIGNING_MODE" == "new" ]]; then
    read -r -p "Create a NEW signing key separate from the tracked signing.keystore? This may prevent upgrades of APKs signed with the old key. [y/N] " rotation_answer
    [[ "$rotation_answer" =~ ^[Yy]([Ee][Ss])?$ ]] || die "Stopped to protect existing app-upgrade compatibility. Confirm the signing-key plan, then rerun."
  else
    warn "Existing GitHub signing secrets are being preserved. Verify their certificate fingerprint in the Actions log; do not assume the tracked keystore is the same key."
  fi
  read -r -p "Stop tracking the root signing.keystore on GitHub while keeping the local file in place? [Y/n] " untrack_answer
  untrack_answer="${untrack_answer:-Y}"
  case "$untrack_answer" in
    [Yy]|[Yy][Ee][Ss])
      git -C "$ROOT" rm --cached --ignore-unmatch -- signing.keystore >/dev/null
      warn "The next commit will remove signing.keystore from the current repository version, but older Git history may still contain it."
      ;;
    *)
      warn "signing.keystore will remain tracked. If the repository is public, remove it from the repository history and assess key exposure."
      ;;
  esac
fi

TARGET="$ROOT/GitHub APK"
SCRIPTS="$TARGET/scripts"
mkdir -p "$SCRIPTS" "$ROOT/.github/workflows"

cat > "$TARGET/package.json" <<'JSON'
{
  "name": "code-academy-github-mobile",
  "version": "1.0.0",
  "private": true,
  "description": "Root-sourced Capacitor packaging workspace for Code Academy",
  "type": "module",
  "scripts": {
    "build:native": "vite build --config vite.native.config.mjs"
  },
  "dependencies": {
    "@capacitor/android": "8.5.3",
    "@capacitor/app": "8.1.2",
    "@capacitor/camera": "8.2.6",
    "@capacitor/core": "8.5.3",
    "@capacitor/device": "8.0.3",
    "@capacitor/filesystem": "8.1.4",
    "@capacitor/geolocation": "8.2.4",
    "@capacitor/ios": "8.5.3",
    "@capacitor/local-notifications": "8.3.1",
    "@capacitor/network": "8.0.1",
    "@capacitor/push-notifications": "8.1.3"
  },
  "devDependencies": {
    "@capacitor/cli": "8.5.3",
    "vite": "8.3.5"
  }
}
JSON

cat > "$TARGET/capacitor.config.json" <<'JSON'
{
  "appId": "com.wm.codeacademy",
  "appName": "Code Academy",
  "webDir": "www",
  "bundledWebRuntime": false,
  "android": {
    "backgroundColor": "#0b1020"
  }
}
JSON

cat > "$TARGET/.gitignore" <<'IGNORE'
# Generated website snapshot; recreated from the repository root in every build.
www/
# Native projects are generated on GitHub's builders.
android/
ios/
node_modules/
dist/
build/
# Never commit native signing material or local secrets.
*.jks
*.keystore
*.p12
*.pfx
*.mobileprovision
*.pem
*.key
.env
.env.*
IGNORE

cat > "$TARGET/vite.native.config.mjs" <<'JS'
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  configFile: false,
  build: {
    outDir: 'www',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: resolve(process.cwd(), 'native-src/index.js'),
      name: 'CodeAcademyNativeBundle',
      formats: ['iife'],
      fileName: () => 'capacitor-native.js'
    }
  }
});
JS
mkdir -p "$TARGET/native-src"
cat > "$TARGET/native-src/index.js" <<'JS'
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Device } from '@capacitor/device';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { PushNotifications } from '@capacitor/push-notifications';

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(`codeacademy:${name}`, { detail }));
const native = () => Capacitor.isNativePlatform();
const getDirectory = (name) => Directory[name] ?? Directory.Data;

// A bridge is made available to the website. Existing website code must call these
// functions to use native APIs; packaging alone does not convert all web API calls.
const bridge = {
  isNative: native,
  getPlatform: () => Capacitor.getPlatform(),
  getDeviceInfo: () => Device.getInfo(),
  getNetworkStatus: () => Network.getStatus(),
  getCurrentPosition: (options = {}) => Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
    ...options
  }),
  requestLocationPermissions: () => Geolocation.requestPermissions(),
  watchPosition: (options = {}, callback = () => {}) => Geolocation.watchPosition(
    { enableHighAccuracy: true, ...options },
    (position, error) => callback(position, error)
  ),
  takePhoto: (options = {}) => Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
    ...options
  }),
  scheduleLocalNotification: async ({ title = 'Code Academy', body = '', at, id } = {}) => {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') throw new Error('Notification permission was not granted.');
    const notification = {
      id: Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : Math.floor(Date.now() % 2147483000),
      title: String(title),
      body: String(body)
    };
    if (at) notification.schedule = { at: new Date(at) };
    return LocalNotifications.schedule({ notifications: [notification] });
  },
  readAppFile: ({ path, directory = 'Data' } = {}) => {
    if (!path) throw new Error('readAppFile requires a relative path.');
    return Filesystem.readFile({ path, directory: getDirectory(directory) });
  },
  writeAppFile: ({ path, data, directory = 'Data', recursive = true } = {}) => {
    if (!path) throw new Error('writeAppFile requires a relative path.');
    return Filesystem.writeFile({ path, data: String(data ?? ''), directory: getDirectory(directory), recursive });
  },
  getAppFileUri: ({ path, directory = 'Data' } = {}) => {
    if (!path) throw new Error('getAppFileUri requires a relative path.');
    return Filesystem.getUri({ path, directory: getDirectory(directory) });
  },
  registerPushNotifications: async () => {
    if (!native()) throw new Error('Remote push registration is available only in the native app.');
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') throw new Error('Push notification permission was not granted.');
    await PushNotifications.register();
    return { status: 'registration-requested' };
  },
  addNativeEventListener: (eventName, callback) => {
    const listener = (event) => callback(event.detail);
    window.addEventListener(`codeacademy:${eventName}`, listener);
    return { remove: () => window.removeEventListener(`codeacademy:${eventName}`, listener) };
  },
  exitApp: () => App.exitApp()
};

Object.defineProperty(window, 'CodeAcademyNative', {
  value: Object.freeze(bridge),
  configurable: false,
  writable: false
});

if (native()) {
  PushNotifications.addListener('registration', token => emit('push-token', token)).catch(() => {});
  PushNotifications.addListener('registrationError', error => emit('push-registration-error', error)).catch(() => {});
  PushNotifications.addListener('pushNotificationReceived', notification => emit('push-received', notification)).catch(() => {});
  PushNotifications.addListener('pushNotificationActionPerformed', action => emit('push-action', action)).catch(() => {});
  Network.addListener('networkStatusChange', status => emit('network-change', status)).catch(() => {});
}
JS

cat > "$SCRIPTS/sync-root-website.py" <<'PY'
#!/usr/bin/env python3
"""Copy eligible static/site files from the repository root to GitHub APK/www.
Never copies Code-Academy-Capacitor, GitHub APK itself, Git metadata, secrets,
or native build folders. This runs both locally and on GitHub Actions.
"""
from __future__ import annotations
import hashlib
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "GitHub APK" / "www"
EXCLUDED_DIRS = {
    ".git", ".github", "Code-Academy-Capacitor", "GitHub APK", "node_modules",
    "browser-android", "native-android", "academy-safe-browser-backend",
    "vpn-force-android-upload-20261016-130913", "dist", "build", "coverage",
    ".cache", ".firebase", ".netlify", "__pycache__", ".venv", "venv", "vendor"
}
EXCLUDED_ROOT_FILES = {
    ".gitignore", ".dockerignore", "package.json", "package-lock.json",
    "pnpm-lock.yaml", "yarn.lock", "server.js", "Dockerfile", "Procfile",
    ".npmrc", "signing.keystore", "HEAD", "config", "packed-refs", "FETCH_HEAD",
    "ORIG_HEAD", "description", "COMMIT_EDITMSG", "package-validation.json",
    "setup-code-academy-github-mobile.sh"
}
SECRET_NAMES = {
    "google-services.json", "GoogleService-Info.plist", "serviceAccountKey.json",
    "id_rsa", "id_ed25519"
}
SECRET_SUFFIXES = {".jks", ".keystore", ".p12", ".pfx", ".pem", ".key", ".mobileprovision"}
EXCLUDED_SUFFIXES = {".apk", ".aab", ".zip", ".pack", ".idx", ".rev"}


def is_secret_path(rel: Path) -> bool:
    name = rel.name
    lower = name.lower()
    if name in SECRET_NAMES or Path(name).suffix.lower() in SECRET_SUFFIXES:
        return True
    if lower == ".env" or lower.startswith(".env."):
        return True
    if "service-account" in lower and lower.endswith(".json"):
        return True
    if lower in {"credentials.json", "secrets.json"}:
        return True
    return False


def main() -> None:
    if not (ROOT / ".git").exists():
        raise SystemExit(f"Repository root not detected: {ROOT}")
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True, exist_ok=True)
    copied = 0
    skipped = 0
    digest_lines: list[str] = []
    for current, dirs, files in os.walk(ROOT, followlinks=False):
        current_path = Path(current)
        rel_dir = current_path.relative_to(ROOT)
        # Do not follow symlink directories or enter packaging/build/source-control areas.
        kept_dirs = []
        for dirname in dirs:
            candidate = current_path / dirname
            rel = candidate.relative_to(ROOT)
            if dirname in EXCLUDED_DIRS or candidate.is_symlink() or is_secret_path(rel):
                skipped += 1
            else:
                kept_dirs.append(dirname)
        dirs[:] = kept_dirs
        for filename in files:
            source = current_path / filename
            rel = source.relative_to(ROOT)
            if source.is_symlink() or is_secret_path(rel) or source.suffix.lower() in EXCLUDED_SUFFIXES:
                skipped += 1
                continue
            if len(rel.parts) == 1 and filename in EXCLUDED_ROOT_FILES:
                skipped += 1
                continue
            # Additional defensive exclusions apply to generated native projects wherever found.
            if any(part in EXCLUDED_DIRS for part in rel.parts):
                skipped += 1
                continue
            out = DEST / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, out)
            sha = hashlib.sha256(out.read_bytes()).hexdigest()
            digest_lines.append(f"{sha}  {rel.as_posix()}")
            copied += 1
    if copied == 0:
        raise SystemExit("No site files were copied; refusing to build an empty app.")
    manifest = ROOT / "GitHub APK" / "asset-manifest.sha256"
    manifest.write_text("\n".join(sorted(digest_lines)) + "\n", encoding="utf-8")
    print(f"Root website sync complete: {copied} files copied; {skipped} secret/build/tool entries skipped.")
    print(f"Web assets: {DEST}")
    print(f"SHA-256 manifest: {manifest}")
    if not any(DEST.glob("*.html")) and not (DEST / "index.html").exists():
        print("WARNING: no root-level HTML file was copied. Verify the site entry page and relative paths.")


if __name__ == "__main__":
    main()
PY

cat > "$SCRIPTS/inject-html-script.py" <<'PY'
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
PY

cat > "$SCRIPTS/release-signing.gradle" <<'GRADLE'
// Applied by configure-android.py. The keystore is restored from Actions secrets
// into RUNNER_TEMP; it is never committed to the repository.
def caStorePath = System.getenv('ANDROID_KEYSTORE_PATH')
if (caStorePath != null && !caStorePath.trim().isEmpty()) {
    android {
        signingConfigs {
            release {
                storeFile file(caStorePath)
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.release
            }
        }
    }
}
GRADLE

cat > "$SCRIPTS/configure-android.py" <<'PY'
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
PY

cat > "$SCRIPTS/configure-ios.py" <<'PY'
#!/usr/bin/env python3
# Add permission usage descriptions and Capacitor push delegate callbacks.
from pathlib import Path
import plistlib

ROOT = Path(__file__).resolve().parents[1]
plist = ROOT / "ios" / "App" / "App" / "Info.plist"
delegate = ROOT / "ios" / "App" / "App" / "AppDelegate.swift"
if not plist.is_file():
    raise SystemExit(f"iOS Info.plist not found: {plist}")
with plist.open("rb") as fh:
    data = plistlib.load(fh)
data.update({
    "NSCameraUsageDescription": "Code Academy uses the camera when you choose to capture an image.",
    "NSPhotoLibraryUsageDescription": "Code Academy uses your photo library when you choose an image.",
    "NSPhotoLibraryAddUsageDescription": "Code Academy may save an image when you request it.",
    "NSLocationWhenInUseUsageDescription": "Code Academy uses your location only when you request a location-based feature.",
    "NSMicrophoneUsageDescription": "Code Academy uses the microphone only when you start a feature that needs audio.",
})
with plist.open("wb") as fh:
    plistlib.dump(data, fh, fmt=plistlib.FMT_XML, sort_keys=False)
print("iOS privacy/permission usage descriptions added to Info.plist.")

if delegate.is_file():
    source = delegate.read_text(encoding="utf-8")
    if "import Capacitor" not in source:
        if "import UIKit" in source:
            source = source.replace("import UIKit", "import UIKit\nimport Capacitor", 1)
        else:
            source = "import Capacitor\n" + source
    if "capacitorDidRegisterForRemoteNotifications" not in source:
        pos = source.rfind("}")
        if pos < 0:
            raise SystemExit("Could not find the closing brace of AppDelegate.swift.")
        methods = '''
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
'''
        source = source[:pos] + methods + source[pos:]
        delegate.write_text(source, encoding="utf-8")
        print("Capacitor push-notification delegate callbacks added; iOS push still requires Apple signing/capabilities.")
    else:
        print("Capacitor push delegate callbacks already present.")
else:
    print("AppDelegate.swift not found; simulator build can continue, but push callback integration needs manual verification.")
PY

cat > "$ROOT/.github/workflows/code-academy-github-apk.yml" <<'YAML'
name: Code Academy GitHub APK and AAB

on:
  push:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Set up Java 21
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Android API 36 build tools
        run: sdkmanager 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'

      - name: Install npm dependencies
        working-directory: GitHub APK
        run: |
          if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

      - name: Copy the current repository-root website into GitHub APK/www
        run: python3 'GitHub APK/scripts/sync-root-website.py'

      - name: Build native bridge and inject it into copied HTML pages
        working-directory: GitHub APK
        run: |
          npm run build:native
          python3 scripts/inject-html-script.py www /capacitor-native.js code-academy-native

      - name: Generate Android project and sync Capacitor plugins
        working-directory: GitHub APK
        run: |
          npx cap add android
          npx cap sync android

      - name: Restore optional Firebase Android configuration
        env:
          GOOGLE_SERVICES_JSON_BASE64: ${{ secrets.GOOGLE_SERVICES_JSON_BASE64 }}
        run: |
          set -euo pipefail
          if [ -n "$GOOGLE_SERVICES_JSON_BASE64" ]; then
            printf '%s' "$GOOGLE_SERVICES_JSON_BASE64" | base64 --decode > 'GitHub APK/android/app/google-services.json'
            test -s 'GitHub APK/android/app/google-services.json'
          else
            echo 'GOOGLE_SERVICES_JSON_BASE64 not set; remote push is not configured by this run.'
          fi

      - name: Configure Android permissions, Firebase and release signing
        working-directory: GitHub APK
        run: python3 scripts/configure-android.py

      - name: Check release-signing secrets
        id: signing
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          if [ -n "$ANDROID_KEYSTORE_BASE64" ] && [ -n "$ANDROID_KEYSTORE_PASSWORD" ] && [ -n "$ANDROID_KEY_ALIAS" ] && [ -n "$ANDROID_KEY_PASSWORD" ]; then
            echo 'ready=true' >> "$GITHUB_OUTPUT"
          else
            echo 'ready=false' >> "$GITHUB_OUTPUT"
          fi

      - name: Build debug APK and, when configured, signed APK plus AAB
        id: build
        working-directory: GitHub APK
        env:
          SIGNING_READY: ${{ steps.signing.outputs.ready }}
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          set -euo pipefail
          mkdir -p dist
          chmod +x android/gradlew
          if [ "$SIGNING_READY" = 'true' ]; then
            export ANDROID_KEYSTORE_PATH="$RUNNER_TEMP/code-academy-release.jks"
            printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$ANDROID_KEYSTORE_PATH"
            chmod 600 "$ANDROID_KEYSTORE_PATH"
            echo 'Release signing certificate SHA-256 fingerprint:'
            keytool -list -v -keystore "$ANDROID_KEYSTORE_PATH" -alias "$ANDROID_KEY_ALIAS" -storepass "$ANDROID_KEYSTORE_PASSWORD" | grep -E 'SHA256:' || true
            (cd android && ./gradlew --no-daemon assembleDebug assembleRelease bundleRelease)
            DEBUG_APK="$(find android/app/build/outputs/apk/debug -type f -name '*.apk' -print -quit)"
            RELEASE_APK="$(find android/app/build/outputs/apk/release -type f -name '*.apk' -print -quit)"
            AAB="$(find android/app/build/outputs/bundle/release -type f -name '*.aab' -print -quit)"
            test -n "$DEBUG_APK" && test -n "$RELEASE_APK" && test -n "$AAB"
            cp "$DEBUG_APK" dist/Code-Academy-debug.apk
            cp "$RELEASE_APK" dist/Code-Academy.apk
            cp "$AAB" dist/Code-Academy.aab
            if command -v apksigner >/dev/null 2>&1; then
              echo 'Built APK signer fingerprint:'
              apksigner verify --print-certs dist/Code-Academy.apk || true
            elif [ -x "$ANDROID_HOME/build-tools/36.0.0/apksigner" ]; then
              echo 'Built APK signer fingerprint:'
              "$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs dist/Code-Academy.apk || true
            fi
            echo 'signed=true' >> "$GITHUB_OUTPUT"
          else
            echo 'No complete release-signing secret set found. Building a debug APK for device testing only.'
            (cd android && ./gradlew --no-daemon assembleDebug)
            DEBUG_APK="$(find android/app/build/outputs/apk/debug -type f -name '*.apk' -print -quit)"
            test -n "$DEBUG_APK"
            cp "$DEBUG_APK" dist/Code-Academy-debug.apk
            echo 'signed=false' >> "$GITHUB_OUTPUT"
          fi
          echo 'Produced files:'
          ls -lh dist

      - name: Upload APK/AAB build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: code-academy-android-apk-aab
          path: 'GitHub APK/dist/*'
          if-no-files-found: error
          retention-days: 30

      - name: Publish signed APK and AAB as a GitHub Release
        if: steps.signing.outputs.ready == 'true' && github.ref_name == '__DEFAULT_BRANCH__'
        uses: softprops/action-gh-release@v2
        with:
          tag_name: code-academy-android-${{ github.run_number }}-${{ github.run_attempt }}
          name: Code Academy Android build ${{ github.run_number }}
          target_commitish: ${{ github.sha }}
          body: |
            Automated Code Academy Android build.
            - Code-Academy.apk: signed APK for direct Android installation.
            - Code-Academy.aab: Android App Bundle for compatible publishing workflows.
            - Code-Academy-debug.apk: debug build for testing; do not distribute as a production release.
            Native capabilities are limited to implemented plugins and granted Android permissions. See repository documentation for Firebase and background-work requirements.
          files: |
            GitHub APK/dist/Code-Academy.apk
            GitHub APK/dist/Code-Academy.aab
          draft: false
          prerelease: false
          make_latest: true
YAML

# The default branch is discovered from this actual repository rather than assumed to be main.
python3 - "$ROOT/.github/workflows/code-academy-github-apk.yml" "$DEFAULT_BRANCH" <<'PY'
import sys
from pathlib import Path
workflow = Path(sys.argv[1])
branch = sys.argv[2]
if not branch or any(ch in branch for ch in "\n\r\x00"):
    raise SystemExit("Invalid GitHub default branch name.")
text = workflow.read_text(encoding="utf-8")
text = text.replace("__DEFAULT_BRANCH__", branch.replace("'", "''"))
workflow.write_text(text, encoding="utf-8")
PY

cat > "$ROOT/.github/workflows/code-academy-ios-simulator.yml" <<'YAML'
name: Code Academy iOS Simulator Build (unsigned)

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build-ios-simulator:
    # Simulator build only. A signed IPA for a physical iPhone requires Apple signing credentials.
    runs-on: macos-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install npm dependencies
        working-directory: GitHub APK
        run: |
          if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

      - name: Copy current root website and build native bridge
        working-directory: GitHub APK
        run: |
          python3 scripts/sync-root-website.py
          npm run build:native
          python3 scripts/inject-html-script.py www /capacitor-native.js code-academy-native

      - name: Generate iOS project
        working-directory: GitHub APK
        run: |
          npx cap add ios
          npx cap sync ios
          python3 scripts/configure-ios.py

      - name: Build unsigned simulator app (not an iPhone-installable IPA)
        working-directory: GitHub APK
        run: |
          if [ -d ios/App/App.xcworkspace ]; then
            PROJECT_ARGS=(-workspace ios/App/App.xcworkspace)
          elif [ -d ios/App/App.xcodeproj ]; then
            PROJECT_ARGS=(-project ios/App/App.xcodeproj)
          else
            echo 'Neither App.xcworkspace nor App.xcodeproj was generated.' >&2
            exit 1
          fi
          xcodebuild "${PROJECT_ARGS[@]}" \
            -scheme App \
            -sdk iphonesimulator \
            -configuration Debug \
            -derivedDataPath build/ios-simulator \
            CODE_SIGNING_ALLOWED=NO

      - name: Upload iOS simulator app
        uses: actions/upload-artifact@v4
        with:
          name: code-academy-ios-simulator-app
          path: 'GitHub APK/build/ios-simulator/Build/Products/Debug-iphonesimulator/App.app'
          if-no-files-found: error
          retention-days: 14
YAML

cat > "$TARGET/README.md" <<'EOF'
# Code Academy GitHub mobile build workspace

This folder is generated by setup-code-academy-github-mobile.sh and intentionally does **not** use files from Code-Academy-Capacitor.

- Source website: repository root, copied into `www/` by `scripts/sync-root-website.py`.
- Android: GitHub Actions builds a debug APK on every push. When all four Android signing secrets are configured, it also builds a signed APK and AAB and publishes them as a GitHub Release from the default branch.
- iOS: the separate manual workflow builds an unsigned iOS Simulator app. A physical-device/App Store IPA is not produced by this script because Apple signing certificates, provisioning profiles, and Apple account setup cannot be created from an Android keystore.
- Native bridge: `window.CodeAcademyNative` is injected into copied HTML files. Existing website code must call the bridge to use native APIs.

## Android signing secrets

`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` are stored in GitHub Actions repository secrets. The keystore stays outside this repository in the local user's private configuration directory.

Optional Firebase Cloud Messaging setup uses the repository secret `GOOGLE_SERVICES_JSON_BASE64`. It must contain the Base64-encoded `google-services.json` generated in Firebase for package `com.wm.codeacademy`.

## Important limits

This packaging pipeline does not magically turn every website feature into native behavior. Location, camera, app file storage, local notifications, and push registration are exposed through the bridge but must be requested by the app at the right moment and tested on physical devices. Remote push requires Firebase configuration and a server-side sender. Android background execution remains subject to Android OS rules; indefinite background execution is not guaranteed. Broad access to all device files is not granted automatically.
EOF

# Add .gitignore rules to the generated mobile workspace and create the local asset snapshot.
python3 "$SCRIPTS/sync-root-website.py"

# Generate a lockfile for repeatable CI installs when npm has network access.
if (cd "$TARGET" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund); then
  say "Created GitHub APK/package-lock.json for repeatable GitHub Actions installs."
else
  warn "Could not create package-lock.json on this device. GitHub Actions will fall back to npm install; check network/npm availability."
fi

# Keep Android release signing material outside the repository, and never overwrite an existing key.
SECURE_DIR="$HOME/.config/code-academy-android"
KEYSTORE="$SECURE_DIR/code-academy-release.jks"
CREDENTIALS="$SECURE_DIR/release-credentials.env"
KEY_ALIAS="codeacademy-release"
mkdir -p "$SECURE_DIR"
chmod 700 "$SECURE_DIR"

if [[ "$SIGNING_MODE" == "new" ]]; then
  if [[ -f "$KEYSTORE" && -f "$CREDENTIALS" ]]; then
    # Reuse a key created by a previous run (for example if the user declined secret upload).
    set -a
    # This file is written by this script with restrictive permissions and generated values only.
    . "$CREDENTIALS"
    set +a
    STORE_PASSWORD="${ANDROID_KEYSTORE_PASSWORD:-}"
    KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-}"
    KEY_ALIAS="${ANDROID_KEY_ALIAS:-$KEY_ALIAS}"
    [[ -n "$STORE_PASSWORD" && -n "$KEY_PASSWORD" && -n "$KEY_ALIAS" ]] || die "Local signing credentials are incomplete: $CREDENTIALS"
    keytool -list -keystore "$KEYSTORE" -alias "$KEY_ALIAS" -storepass "$STORE_PASSWORD" >/dev/null || die "The saved keystore/password combination could not be verified. Do not overwrite it; restore a matching backup."
    say "Reusing the existing local release key. It will not be replaced."
  elif [[ -e "$KEYSTORE" || -e "$CREDENTIALS" ]]; then
    die "Only one of the local keystore and credential backup exists. Restore both from backup; the script will not create or overwrite a key."
  else
    STORE_PASSWORD="$(openssl rand -hex 32)"
    KEY_PASSWORD="$STORE_PASSWORD"
    keytool -genkeypair -v \
      -keystore "$KEYSTORE" \
      -storetype JKS \
      -alias "$KEY_ALIAS" \
      -keyalg RSA -keysize 4096 -validity 10000 \
      -dname 'CN=Code Academy, OU=Mobile, O=Code Academy, L=Accra, ST=Greater Accra, C=GH' \
      -storepass "$STORE_PASSWORD" -keypass "$KEY_PASSWORD"
    chmod 600 "$KEYSTORE"
    umask 077
    {
      printf 'ANDROID_KEYSTORE_PASSWORD=%s\n' "$STORE_PASSWORD"
      printf 'ANDROID_KEY_ALIAS=%s\n' "$KEY_ALIAS"
      printf 'ANDROID_KEY_PASSWORD=%s\n' "$KEY_PASSWORD"
    } > "$CREDENTIALS"
    chmod 600 "$CREDENTIALS"
    say "Generated Android release keystore outside the repository: $KEYSTORE"
  fi
  printf '\nAndroid signing-certificate SHA-256 fingerprint (public certificate):\n'
  keytool -list -v -keystore "$KEYSTORE" -alias "$KEY_ALIAS" -storepass "$STORE_PASSWORD" | grep -E 'SHA256:' || true
  printf '\nKeystore file SHA-256 (this is NOT the certificate fingerprint):\n'
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$KEYSTORE"; else shasum -a 256 "$KEYSTORE"; fi
  printf '\nKeep a private backup of both the keystore and the credential file. Do not commit them.\n\n'
  read -r -p "Upload this keystore and passwords to GitHub Actions secrets for $REPO now? [Y/n] " answer
  answer="${answer:-Y}"
  case "$answer" in
    [Yy]|[Yy][Ee][Ss])
      KEYSTORE_BASE64="$(base64 "$KEYSTORE" | tr -d '\r\n')"
      printf '%s' "$KEYSTORE_BASE64" | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO"
      printf '%s' "$STORE_PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO"
      printf '%s' "$KEY_ALIAS" | gh secret set ANDROID_KEY_ALIAS --repo "$REPO"
      printf '%s' "$KEY_PASSWORD" | gh secret set ANDROID_KEY_PASSWORD --repo "$REPO"
      unset KEYSTORE_BASE64 STORE_PASSWORD KEY_PASSWORD
      SIGNING_MODE="new-configured"
      say "Android signing secrets uploaded. Secret values were not printed."
      ;;
    *)
      warn "Keystore was created but not uploaded. The workflow will produce a debug APK until you upload the four secrets. Keep the keystore and credential file safe."
      unset STORE_PASSWORD KEY_PASSWORD
      ;;
  esac
elif [[ "$SIGNING_MODE" == "existing" ]]; then
  say "All four Android signing secrets already exist; preserving them to avoid silently replacing the signing certificate. The workflow will print the certificate fingerprint in its build log."
elif [[ "$SIGNING_MODE" == "partial" ]]; then
  warn "Existing signing secrets are incomplete; preserving them. Configure all four secrets to enable signed release output."
fi

# Optional Firebase setup from a local google-services.json; no file is copied to source control.
if [[ "$SIGNING_MODE" != "partial" ]]; then
  if [[ -f "$ROOT/google-services.json" ]]; then
    read -r -p "Found root google-services.json. Store it as the optional GitHub secret for remote push? [y/N] " firebase_answer
    if [[ "$firebase_answer" =~ ^[Yy]([Ee][Ss])?$ ]]; then
      FIREBASE_B64="$(base64 "$ROOT/google-services.json" | tr -d '\r\n')"
      printf '%s' "$FIREBASE_B64" | gh secret set GOOGLE_SERVICES_JSON_BASE64 --repo "$REPO"
      unset FIREBASE_B64
      say "Firebase Android config stored as a GitHub Actions secret."
    fi
  else
    warn "No root google-services.json found. Remote push notifications will remain unconfigured until you add the Firebase Android config secret."
  fi
fi

# Ensure newly generated local assets/build outputs do not get staged.
cat > "$TARGET/.gitignore" <<'IGNORE'
# Generated website snapshot; recreated from the repository root in every build.
www/
asset-manifest.sha256
# Native projects are generated on GitHub's builders.
android/
ios/
node_modules/
dist/
build/
# Never commit native signing material or local secrets.
*.jks
*.keystore
*.p12
*.pfx
*.mobileprovision
*.pem
*.key
.env
.env.*
IGNORE

# Give Git a reasonable identity if it has none, then commit only the new setup files.
if ! git -C "$ROOT" config user.name >/dev/null; then
  GH_LOGIN="$(gh api user --jq '.login')"
  git -C "$ROOT" config user.name "$GH_LOGIN"
fi
if ! git -C "$ROOT" config user.email >/dev/null; then
  GH_LOGIN="$(gh api user --jq '.login')"
  git -C "$ROOT" config user.email "$GH_LOGIN@users.noreply.github.com"
fi

git -C "$ROOT" add -- 'setup-code-academy-github-mobile.sh' 'GitHub APK' '.github/workflows/code-academy-github-apk.yml' '.github/workflows/code-academy-ios-simulator.yml'
if ! git -C "$ROOT" diff --cached --quiet; then
  git -C "$ROOT" commit -m "Set up Code Academy GitHub APK and AAB builds"
else
  say "No tracked setup-file changes to commit."
fi

say "Pushing setup to origin/$CURRENT_BRANCH ..."
git -C "$ROOT" push origin "$CURRENT_BRANCH"

printf '\n============================================================\n'
printf 'SETUP FILES: %s/GitHub APK\n' "$ROOT"
printf 'ANDROID WORKFLOW: https://github.com/%s/actions/workflows/code-academy-github-apk.yml\n' "$REPO"
printf 'RELEASES PAGE: https://github.com/%s/releases\n' "$REPO"
printf 'ACTIONS PAGE: https://github.com/%s/actions\n' "$REPO"
printf '\nOn the Actions page, open "Code Academy GitHub APK and AAB".\n' 
printf 'Download the artifact named "code-academy-android-apk-aab". If signing is configured and this is the default branch, the signed APK and AAB are also published under Releases.\n'
printf '\nFor iOS simulator output, manually run "Code Academy iOS Simulator Build (unsigned)" in Actions. That artifact is NOT a signed IPA for a physical iPhone.\n'
printf 'Keystore backup directory: %s (do not upload this directory to GitHub).\n' "$SECURE_DIR"
printf '============================================================\n'

if command -v termux-open-url >/dev/null 2>&1; then
  read -r -p "Open the GitHub Actions page now? [Y/n] " open_answer
  open_answer="${open_answer:-Y}"
  case "$open_answer" in [Yy]|[Yy][Ee][Ss]) termux-open-url "https://github.com/$REPO/actions/workflows/code-academy-github-apk.yml" ;; esac
fi

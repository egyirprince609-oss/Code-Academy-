#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
CAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$CAP_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
REPO_SLUG="egyirprince609-oss/Code-Academy-"
APP_ID="com.wm.codeacademy"

say(){ printf '\n[Code Academy Push Setup] %s\n' "$*"; }
warn(){ printf '\n[WARNING] %s\n' "$*" >&2; }

JSON_PATH="${1:-}"
if [[ -z "$JSON_PATH" ]]; then
  for candidate in "$HOME/storage/downloads/google-services.json" "$HOME/storage/shared/Download/google-services.json" "/storage/emulated/0/Download/google-services.json" "$CAP_DIR/google-services.json"; do
    if [[ -f "$candidate" ]]; then JSON_PATH="$candidate"; break; fi
  done
fi
if [[ -z "$JSON_PATH" || ! -f "$JSON_PATH" ]]; then
  echo 'Firebase config is not downloaded yet.' >&2
  echo 'In Firebase Console: Project settings -> Your apps -> Add Android app (or select it) with package ID com.wm.codeacademy, download google-services.json, then rerun:' >&2
  echo 'bash Code-Academy-Capacitor/enable-native-push.sh /path/to/google-services.json' >&2
  exit 2
fi
command -v jq >/dev/null 2>&1 || { echo 'Install jq first: pkg install -y jq' >&2; exit 2; }
jq -e --arg appid "$APP_ID" '[.client[]? | select(.client_info.android_client_info.package_name == $appid)] | length > 0' "$JSON_PATH" >/dev/null || {
  echo "The downloaded google-services.json does not contain Android package ID $APP_ID. Do not continue with a mismatched file." >&2; exit 2;
}

mkdir -p "$CAP_DIR/android/app"
cp "$JSON_PATH" "$CAP_DIR/android/app/google-services.json"
chmod 600 "$CAP_DIR/android/app/google-services.json"
cd "$CAP_DIR"

say 'Installing the Capacitor 8 native push plugin and creating the push bundle...'
npm install @capacitor/push-notifications@^8
npm run build:push
python3 scripts/inject-html-script.py www /capacitor-push.js code-academy-push
npx cap sync android

if command -v gh >/dev/null 2>&1 && gh auth status --hostname github.com >/dev/null 2>&1; then
  if base64 "$JSON_PATH" | tr -d '\n' | gh secret set GOOGLE_SERVICES_JSON_BASE64 --repo "$REPO_SLUG"; then
    say 'Uploaded GOOGLE_SERVICES_JSON_BASE64 as a GitHub Actions secret. The JSON itself will not be committed.'
  else
    warn 'GitHub Actions secret upload failed. Sign into gh and ensure you can manage repository Actions secrets.'
  fi
else
  warn 'GitHub CLI is not authenticated; the Firebase JSON was kept locally and ignored by Git. Upload it later as the repository secret GOOGLE_SERVICES_JSON_BASE64.'
fi

if [[ -n "$REPO_ROOT" ]]; then
  git -C "$REPO_ROOT" add -- Code-Academy-Capacitor
  if ! git -C "$REPO_ROOT" diff --cached --name-only | grep -E '(^|/)google-services\.json$|\.jks$|\.keystore$|signing\.env$' >/dev/null; then
    if ! git -C "$REPO_ROOT" diff --cached --quiet; then
      git -C "$REPO_ROOT" -c user.name="$(git -C "$REPO_ROOT" config user.name 2>/dev/null || echo 'Code Academy Capacitor Setup')" -c user.email="$(git -C "$REPO_ROOT" config user.email 2>/dev/null || echo 'code-academy-capacitor@users.noreply.github.com')" commit -m 'Configure native push notifications for Code Academy'
      if GIT_TERMINAL_PROMPT=0 git -C "$REPO_ROOT" push origin main; then say 'Push configuration committed and pushed to main.'; else warn 'Local setup is saved, but git push failed. Do not force-push; check GitHub authentication and retry.'; fi
    fi
  else
    git -C "$REPO_ROOT" reset -q -- Code-Academy-Capacitor/android/app/google-services.json 2>/dev/null || true
    warn 'Sensitive/config paths were detected in staged changes and were not committed.'
  fi
fi
say 'Native client registration is prepared. Actual delivery also requires the app to send device tokens to an authenticated backend and that backend to send FCM messages.'

#!/data/data/com.termux/files/usr/bin/bash
# Safely publish the Code Academy textbook module from the user's extracted folder.
set -Eeuo pipefail

trap 'rc=$?; echo; echo "STOPPED (exit $rc). No further steps were run. Read the message above before retrying." >&2' ERR

REMOTE_URL="https://github.com/egyirprince609-oss/Code-Academy-.git"
EXPECTED_REMOTE="https://github.com/egyirprince609-oss/Code-Academy-"
SRC="/storage/emulated/0/TebEdit/AUTHENTICATION/Code-Academy-Textbook-Addon-v3 (1)/Code-Academy-Textbook-Module"
PAGES_BASE="https://egyirprince609-oss.github.io/Code-Academy-/"

normalize_url() {
  local u="$1"
  case "$u" in
    git@github.com:*) u="https://github.com/${u#git@github.com:}" ;;
    ssh://git@github.com/*) u="https://github.com/${u#ssh://git@github.com/}" ;;
  esac
  u="${u%.git}"
  u="${u%/}"
  printf '%s' "${u,,}"
}

http_code() {
  local result
  result="$(curl -L --silent --max-time 15 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" || result="000"
  printf '%s' "$result"
}

echo "============================================================"
echo " Code Academy textbook module publisher"
echo "============================================================"
echo "Source: $SRC"
echo

# 1. Verify the extracted module before changing the repository.
if [[ ! -d "$SRC" ]]; then
  echo "ERROR: The extracted module folder was not found at the expected path:" >&2
  echo "$SRC" >&2
  echo "Do not continue until the source path is corrected." >&2
  exit 1
fi
for required in "AI Mentor.html" "textbook-login.html" "textbook-signup.html" "textbook_content"; do
  if [[ ! -e "$SRC/$required" ]]; then
    echo "ERROR: Required module item is missing: $required" >&2
    exit 1
  fi
done

# 2. Install required command-line tools. GitHub CLI is optional but simplifies login.
echo "[1/8] Checking Termux packages..."
pkg update -y
pkg install -y git curl python
if ! command -v gh >/dev/null 2>&1; then
  pkg install -y gh >/dev/null 2>&1 || true
fi

# 3. Verify file count and every JSON document before publishing.
echo "[2/8] Validating the source package..."
python - "$SRC" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
files = [p for p in root.rglob('*') if p.is_file()]
json_files = [p for p in files if p.suffix.lower() == '.json']
required = ['AI Mentor.html', 'textbook-login.html', 'textbook-signup.html']
missing = [name for name in required if not (root / name).is_file()]
errors = []
for p in json_files:
    try:
        json.loads(p.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'{p.relative_to(root)}: {exc}')
print(f'Source files: {len(files)}')
print(f'JSON files:   {len(json_files)}')
if missing:
    print('Missing required files:', ', '.join(missing))
if errors:
    print('Invalid JSON files:')
    for error in errors[:20]: print(' -', error)
    if len(errors) > 20: print(f' - ... and {len(errors)-20} more')
if len(files) != 223 or len(json_files) != 220 or missing or errors:
    print('Validation failed. Nothing has been copied or pushed.', file=sys.stderr)
    sys.exit(1)
print('Source package validation passed.')
PY

# 4. Log in using GitHub CLI if available; otherwise Git may ask for credentials at push time.
echo
echo "[3/8] Preparing GitHub authentication..."
if command -v gh >/dev/null 2>&1; then
  if ! gh auth status >/dev/null 2>&1; then
    echo "GitHub CLI needs authorization. Follow its prompt and approve the login in your browser."
    gh auth login --hostname github.com --git-protocol https --web
  fi
  gh auth setup-git
else
  echo "GitHub CLI is unavailable. If Git asks for a password during push, enter a GitHub Personal Access Token, not your account password."
fi

# 5. Find an existing clone of this exact repository; otherwise clone a clean copy.
echo
echo "[4/8] Locating the Code Academy repository..."
EXPECTED_KEY="$(normalize_url "$EXPECTED_REMOTE")"
REPO=""
for candidate in "$HOME"/*; do
  [[ -d "$candidate" ]] || continue
  if git -C "$candidate" rev-parse --git-dir >/dev/null 2>&1; then
    existing_remote="$(git -C "$candidate" remote get-url origin 2>/dev/null || true)"
    if [[ -n "$existing_remote" ]] && [[ "$(normalize_url "$existing_remote")" == "$EXPECTED_KEY" ]]; then
      REPO="$candidate"
      break
    fi
  fi
done

if [[ -z "$REPO" ]]; then
  REPO="$HOME/Code-Academy-publish"
  if [[ -e "$REPO" ]]; then
    if git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
      echo "ERROR: $REPO exists but is not connected to the expected repository. Refusing to reuse it." >&2
      exit 1
    fi
    REPO="$HOME/Code-Academy-publish-$(date +%Y%m%d-%H%M%S)"
  fi
  echo "No matching local clone found. Cloning to: $REPO"
  git clone "$REMOTE_URL" "$REPO"
else
  echo "Found matching repository at: $REPO"
fi

# Never overwrite or pull over local uncommitted work.
if [[ -n "$(git -C "$REPO" status --porcelain)" ]]; then
  echo "ERROR: The repository has uncommitted changes:" >&2
  git -C "$REPO" status --short >&2
  echo "Nothing was copied. Commit or safely back up those changes, then run this script again." >&2
  exit 1
fi

# Identify GitHub's default branch from the remote.
DEFAULT_BRANCH="$(git -C "$REPO" ls-remote --symref origin HEAD 2>/dev/null | sed -n 's#^ref: refs/heads/\([^[:space:]]*\)[[:space:]]*HEAD$#\1#p' | head -n 1)"
if [[ -z "$DEFAULT_BRANCH" ]]; then
  DEFAULT_BRANCH="$(git -C "$REPO" branch --show-current)"
fi
if [[ -z "$DEFAULT_BRANCH" ]]; then
  echo "ERROR: Could not determine the repository's default branch." >&2
  exit 1
fi

git -C "$REPO" fetch origin
if git -C "$REPO" show-ref --verify --quiet "refs/heads/$DEFAULT_BRANCH"; then
  git -C "$REPO" switch "$DEFAULT_BRANCH"
else
  git -C "$REPO" switch --track -c "$DEFAULT_BRANCH" "origin/$DEFAULT_BRANCH"
fi
git -C "$REPO" pull --ff-only origin "$DEFAULT_BRANCH"
BRANCH="$(git -C "$REPO" branch --show-current)"
echo "Repository: $REPO"
echo "Branch:     $BRANCH"

# Back up only same-named files that would actually change, outside the repository.
BACKUP_DIR="$HOME/Code-Academy-textbook-backup-$(date +%Y%m%d-%H%M%S)"
BACKUP_MADE=0
while IFS= read -r -d '' source_file; do
  rel="${source_file#"$SRC"/}"
  dest="$REPO/$rel"
  if [[ -f "$dest" ]] && ! cmp -s "$source_file" "$dest"; then
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp -a "$dest" "$BACKUP_DIR/$rel"
    BACKUP_MADE=1
  fi
done < <(find "$SRC" -type f -print0)
if [[ "$BACKUP_MADE" -eq 1 ]]; then
  echo "Existing conflicting module files backed up to: $BACKUP_DIR"
fi

# 6. Copy all files including nested folders, preserving their relative paths.
echo
echo "[5/8] Copying the module while preserving its directory structure..."
cp -a "$SRC/." "$REPO/"
python - "$SRC" "$REPO" <<'PY'
import json, pathlib, sys
src, dest = map(pathlib.Path, sys.argv[1:3])
files = [p for p in src.rglob('*') if p.is_file()]
missing = [str(p.relative_to(src)) for p in files if not (dest / p.relative_to(src)).is_file()]
bad_json = []
for p in src.rglob('*.json'):
    target = dest / p.relative_to(src)
    try:
        json.loads(target.read_text(encoding='utf-8'))
    except Exception as exc:
        bad_json.append(f'{p.relative_to(src)}: {exc}')
print(f'Copied module files verified: {len(files) - len(missing)} / {len(files)}')
print(f'JSON files validated in repository: {len(list(src.rglob("*.json"))) - len(bad_json)} / {len(list(src.rglob("*.json")))}')
if missing or bad_json:
    for item in missing[:20]: print('MISSING:', item)
    for item in bad_json[:20]: print('INVALID JSON:', item)
    sys.exit(1)
PY

# Stage only files that belong to the supplied module, not unrelated repository files.
while IFS= read -r -d '' source_file; do
  rel="${source_file#"$SRC"/}"
  git -C "$REPO" add -- "$rel"
done < <(find "$SRC" -type f -print0)

echo
echo "[6/8] Reviewing the staged change..."
git -C "$REPO" diff --cached --check
git -C "$REPO" diff --cached --stat

if ! git -C "$REPO" diff --cached --quiet; then
  if ! git -C "$REPO" config user.name >/dev/null; then
    GH_USER=""
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
      GH_USER="$(gh api user --jq '.login' 2>/dev/null || true)"
    fi
    if [[ -n "$GH_USER" ]]; then
      git -C "$REPO" config user.name "$GH_USER"
    else
      read -r -p "Enter the name to show on this Git commit: " GIT_AUTHOR_NAME
      [[ -n "$GIT_AUTHOR_NAME" ]]
      git -C "$REPO" config user.name "$GIT_AUTHOR_NAME"
    fi
  fi
  if ! git -C "$REPO" config user.email >/dev/null; then
    GH_EMAIL=""
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
      GH_EMAIL="$(gh api user --jq '.id as $id | .login as $login | "\($id)+\($login)@users.noreply.github.com"' 2>/dev/null || true)"
    fi
    if [[ -n "$GH_EMAIL" ]]; then
      git -C "$REPO" config user.email "$GH_EMAIL"
    else
      read -r -p "Enter your GitHub-associated email (or GitHub noreply email): " GIT_AUTHOR_EMAIL
      [[ -n "$GIT_AUTHOR_EMAIL" ]]
      git -C "$REPO" config user.email "$GIT_AUTHOR_EMAIL"
    fi
  fi
  git -C "$REPO" commit -m "Add textbook and AI Mentor module"
else
  echo "All supplied module files are already identical in the repository; no new commit is needed."
fi

# 7. Push the repository branch to GitHub.
echo
echo "[7/8] Pushing to GitHub..."
git -C "$REPO" push -u origin "$BRANCH"
LOCAL_SHA="$(git -C "$REPO" rev-parse HEAD)"
REMOTE_SHA="$(git -C "$REPO" ls-remote origin "refs/heads/$BRANCH" | awk 'NR==1 {print $1}')"
echo "Local commit:  $LOCAL_SHA"
echo "Remote commit: ${REMOTE_SHA:-NOT FOUND}"
if [[ -z "$REMOTE_SHA" || "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
  echo "WARNING: The remote branch SHA did not match the local HEAD after push." >&2
else
  echo "GitHub repository state: CONFIRMED PUSHED"
fi

# 8. Check the actual GitHub Pages URLs. Pages may need time to rebuild.
echo
echo "[8/8] Checking the live GitHub Pages site (may take up to two minutes)..."
URL_HOME="$PAGES_BASE"
URL_MENTOR="${PAGES_BASE}AI%20Mentor.html"
URL_LOGIN="${PAGES_BASE}textbook-login.html"
URL_SIGNUP="${PAGES_BASE}textbook-signup.html"
URL_JSON="${PAGES_BASE}textbook_content/textbook_c_lesson_01.json"
H_HOME=000; H_MENTOR=000; H_LOGIN=000; H_SIGNUP=000; H_JSON=000
for attempt in {1..12}; do
  H_HOME="$(http_code "$URL_HOME")"
  H_MENTOR="$(http_code "$URL_MENTOR")"
  H_LOGIN="$(http_code "$URL_LOGIN")"
  H_SIGNUP="$(http_code "$URL_SIGNUP")"
  H_JSON="$(http_code "$URL_JSON")"
  if [[ "$H_HOME" == 200 && "$H_MENTOR" == 200 && "$H_LOGIN" == 200 && "$H_SIGNUP" == 200 && "$H_JSON" == 200 ]]; then
    break
  fi
  if [[ "$attempt" -lt 12 ]]; then
    echo "Pages is still updating (check $attempt/12); retrying in 10 seconds..."
    sleep 10
  fi
done
printf '\n%-20s %s  %s\n' "Homepage" "$H_HOME" "$URL_HOME"
printf '%-20s %s  %s\n' "AI Mentor" "$H_MENTOR" "$URL_MENTOR"
printf '%-20s %s  %s\n' "Textbook login" "$H_LOGIN" "$URL_LOGIN"
printf '%-20s %s  %s\n' "Textbook signup" "$H_SIGNUP" "$URL_SIGNUP"
printf '%-20s %s  %s\n' "Sample JSON" "$H_JSON" "$URL_JSON"

if [[ "$H_HOME" == 200 && "$H_MENTOR" == 200 && "$H_LOGIN" == 200 && "$H_SIGNUP" == 200 && "$H_JSON" == 200 ]]; then
  echo
echo "SUCCESS: GitHub contains the module and all tested Pages URLs return HTTP 200."
else
  RAW_JSON="https://raw.githubusercontent.com/egyirprince609-oss/Code-Academy-/$BRANCH/textbook_content/textbook_c_lesson_01.json"
  RAW_STATUS="$(http_code "$RAW_JSON")"
  echo
echo "The push check is complete, but not every Pages URL returned HTTP 200 yet."
  echo "Raw GitHub JSON status: $RAW_STATUS ($RAW_JSON)"
  echo "If Raw GitHub is 200 but Pages is 404, check GitHub Settings > Pages for the published branch/folder and allow the site time to rebuild."
  echo "If the push SHA matched above, the files are on GitHub even if Pages has not finished deploying."
fi

echo
echo "Final repository state:"
git -C "$REPO" status --short --branch
echo "Repository folder: $REPO"
echo "Finished."

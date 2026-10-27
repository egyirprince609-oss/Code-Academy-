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

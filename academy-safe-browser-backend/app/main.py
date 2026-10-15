"""Academy Safe Browser API.

Safety policy: a clean heuristic result is never called safe. Only a successful
Web Risk lookup with no match is marked `safe`; otherwise the verdict is
`suspicious`, `dangerous`, or `unverified`.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import html
import ipaddress
import json
import os
import re
import secrets
import socket
import sqlite3
import struct
import time
import uuid
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterator, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

APP_VERSION = "1.0.0"
SEARXNG_URL = os.getenv("SEARXNG_URL", "http://127.0.0.1:8080").rstrip("/")
BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()
WEBRISK_API_KEY = os.getenv("WEBRISK_API_KEY", "").strip()
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", "./data/academy-browser.sqlite3"))
QUARANTINE_DIR = Path(os.getenv("QUARANTINE_DIR", "./quarantine"))
MAX_UPLOAD_BYTES = max(1, int(os.getenv("MAX_UPLOAD_MB", "15"))) * 1024 * 1024
ALLOW_EXECUTABLE_DOWNLOADS = os.getenv("ALLOW_EXECUTABLE_DOWNLOADS", "false").lower() == "true"
CLAMAV_HOST = os.getenv("CLAMAV_HOST", "127.0.0.1")
CLAMAV_PORT = int(os.getenv("CLAMAV_PORT", "3310"))
CLAMAV_TIMEOUT = float(os.getenv("CLAMAV_TIMEOUT_SECONDS", "25"))
SEARCH_TIMEOUT = float(os.getenv("SEARCH_TIMEOUT_SECONDS", "5"))
URL_TIMEOUT = float(os.getenv("URL_CHECK_TIMEOUT_SECONDS", "4"))
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()
TRUST_PROXY_HEADERS = os.getenv("TRUST_PROXY_HEADERS", "false").lower() == "true"
QUARANTINE_RETENTION_HOURS = max(1, int(os.getenv("QUARANTINE_RETENTION_HOURS", "24")))

DEFAULT_ORIGINS = "https://egyirprince609-oss.github.io,http://localhost:5500,http://127.0.0.1:5500"
ALLOWED_ORIGINS = [x.strip().rstrip("/") for x in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if x.strip()]

TRACKING_PARAMS = {"fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "ref_src"}
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "cutt.ly", "is.gd", "rebrand.ly", "shorturl.at", "ow.ly", "buff.ly", "rb.gy", "goo.gl"}
BRAND_DOMAINS = {
    "google": {"google.com", "google.com.gh", "google.co.uk", "google.co.in", "googleapis.com", "youtube.com", "googleusercontent.com"},
    "paypal": {"paypal.com"}, "microsoft": {"microsoft.com", "live.com", "office.com", "microsoftonline.com"},
    "facebook": {"facebook.com", "fb.com", "facebook.net"}, "instagram": {"instagram.com"},
    "apple": {"apple.com", "icloud.com"}, "amazon": {"amazon.com", "amazon.co.uk", "amazonaws.com"},
    "whatsapp": {"whatsapp.com"}, "github": {"github.com", "githubusercontent.com"},
    "binance": {"binance.com"}, "mtn": {"mtn.com.gh", "mtn.com"},
}
SUSPICIOUS_TERMS = ("verify-account", "account-verify", "password-reset", "secure-login", "wallet-connect", "recover-account", "confirm-identity", "free-gift", "otp-verify", "seed-phrase")
EXECUTABLE_EXTENSIONS = {".exe", ".msi", ".bat", ".cmd", ".sh", ".apk", ".dmg", ".jar", ".vbs", ".ps1", ".scr", ".com", ".hta", ".appx", ".deb", ".rpm", ".iso"}
KNOWN_TYPES = {
    ".pdf": (b"%PDF-",), ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",), ".jpeg": (b"\xff\xd8\xff",),
    ".gif": (b"GIF87a", b"GIF89a"), ".zip": (b"PK\x03\x04", b"PK\x05\x06"),
    ".apk": (b"PK\x03\x04",), ".jar": (b"PK\x03\x04",),
    ".docx": (b"PK\x03\x04",), ".xlsx": (b"PK\x03\x04",), ".pptx": (b"PK\x03\x04",),
}

app = FastAPI(
    title="Academy Safe Browser API",
    description="Search aggregation, URL threat checks, file scanning, DNS diagnostics, and link reports.",
    version=APP_VERSION,
    docs_url=None if os.getenv("APP_ENV", "development") == "production" else "/docs",
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Admin-Token"],
    max_age=600,
)

_cache: dict[str, tuple[float, dict]] = {}
_requests: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_cache_lock = asyncio.Lock()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    """Short-lived SQLite connection; commit on success and always close it."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript("""
        CREATE TABLE IF NOT EXISTS blocked_domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL UNIQUE,
            reason TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'dangerous',
            added_by TEXT NOT NULL DEFAULT 'admin',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            domain TEXT NOT NULL,
            url TEXT NOT NULL,
            category TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending_review',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scans (
            id TEXT PRIMARY KEY,
            original_name TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            verdict TEXT NOT NULL,
            engine TEXT NOT NULL,
            reasons_json TEXT NOT NULL,
            quarantine_path TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS security_events (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            domain TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_events_created ON security_events(created_at DESC);
        """)


@app.on_event("startup")
async def startup() -> None:
    init_db()
    cleanup_expired_quarantine()


def cleanup_expired_quarantine() -> None:
    cutoff = time.time() - QUARANTINE_RETENTION_HOURS * 3600
    try:
        with get_db() as c:
            rows = c.execute("SELECT id, quarantine_path, created_at FROM scans WHERE quarantine_path IS NOT NULL").fetchall()
            for row in rows:
                try:
                    stamp = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")).timestamp()
                except (ValueError, TypeError):
                    stamp = 0
                if stamp < cutoff:
                    p = Path(row["quarantine_path"])
                    if p.parent.resolve() == QUARANTINE_DIR.resolve():
                        p.unlink(missing_ok=True)
                    c.execute("UPDATE scans SET quarantine_path=NULL WHERE id=?", (row["id"],))
    except Exception:
        # Cleanup must never make the service unavailable; administrators can inspect storage.
        pass


def get_client_ip(request: Request) -> str:
    if TRUST_PROXY_HEADERS:
        # Only enable when the immediate reverse proxy strips/replaces this header.
        forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        if forwarded:
            return forwarded[:64]
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request, bucket: str, limit: int, window: int = 60) -> None:
    now = time.monotonic()
    key = (get_client_ip(request), bucket)
    queue = _requests[key]
    while queue and now - queue[0] > window:
        queue.popleft()
    if len(queue) >= limit:
        raise HTTPException(429, detail="Too many requests. Wait a moment and try again.")
    queue.append(now)
    # Bound per-process memory if an attacker rotates source addresses.
    if len(_requests) > 5000:
        for old_key in list(_requests.keys())[:1000]:
            old_queue = _requests.get(old_key)
            if not old_queue or now - old_queue[-1] > window:
                _requests.pop(old_key, None)


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    if not ADMIN_TOKEN or ADMIN_TOKEN.startswith("CHANGE_ME"):
        raise HTTPException(503, detail="Admin operations are disabled until ADMIN_TOKEN is configured.")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, ADMIN_TOKEN):
        raise HTTPException(401, detail="Administrator token required.")


def clean_text(value: str | None, limit: int = 700) -> str:
    # Do not render provider HTML; only return plain text to clients.
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]*>", " ", value)
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit]


def normalize_url(raw: str, *, strip_tracking: bool = True) -> tuple[str | None, str | None]:
    raw = (raw or "").strip()
    if not raw or len(raw) > 4096 or any(ord(ch) < 32 for ch in raw):
        return None, "empty_or_invalid_url"
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", raw):
        raw = "https://" + raw
    try:
        p = urlsplit(raw)
        scheme = p.scheme.lower()
        if scheme not in {"http", "https"}:
            return None, "blocked_scheme"
        if p.username is not None or p.password is not None:
            return None, "embedded_credentials"
        if not p.hostname:
            return None, "missing_hostname"
        host = p.hostname.rstrip(".").lower()
        if len(host) > 253 or " " in host:
            return None, "invalid_hostname"
        try:
            host = host.encode("idna").decode("ascii").lower()
        except UnicodeError:
            return None, "invalid_idn"
        port = p.port
        if port is not None and not (1 <= port <= 65535):
            return None, "invalid_port"
        if port and port not in (80, 443):
            # Valid, but later heuristics report an unexpected port.
            pass
        netloc = f"[{host}]" if ":" in host else host
        if port:
            netloc += f":{port}"
        path = p.path or "/"
        query_items = parse_qsl(p.query, keep_blank_values=True)
        if strip_tracking:
            query_items = [(k, v) for k, v in query_items if k.lower() not in TRACKING_PARAMS and not k.lower().startswith("utm_")]
        query = urlencode(query_items, doseq=True)
        normalized = urlunsplit((scheme, netloc, path, query, ""))
        return normalized, None
    except (ValueError, UnicodeError):
        return None, "invalid_url"


def registrable_guess(host: str) -> str:
    """Conservative display helper only; not a public-suffix-list security boundary."""
    try:
        ipaddress.ip_address(host.strip("[]"))
        return host
    except ValueError:
        pass
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    two_part_suffixes = {"co.uk", "com.gh", "co.gh", "com.au", "co.nz", "co.in", "com.br", "com.sg", "co.jp"}
    suffix = ".".join(parts[-2:])
    if suffix in two_part_suffixes and len(parts) >= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def is_private_or_reserved_host(host: str) -> bool:
    low = host.lower().strip("[]").rstrip(".")
    if low in {"localhost", "localhost.localdomain", "metadata.google.internal"} or low.endswith((".localhost", ".local", ".internal", ".test", ".invalid")):
        return True
    try:
        ip = ipaddress.ip_address(low)
        return not ip.is_global
    except ValueError:
        return False


def local_heuristics(url: str) -> dict:
    normalized, error = normalize_url(url, strip_tracking=False)
    if error or not normalized:
        return {"verdict": "dangerous", "reasons": [error or "invalid_url"], "normalized_url": None, "heuristic_flags": [error or "invalid_url"]}
    p = urlsplit(normalized)
    host = (p.hostname or "").lower().rstrip(".")
    reasons: list[str] = []
    flags: list[str] = []
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
        if not ip.is_global:
            reasons.append("The address points to a local, private, or reserved network target.")
            flags.append("non_public_ip_address")
        else:
            reasons.append("The site uses a direct IP address instead of a normal domain name.")
            flags.append("ip_literal_host")
    except ValueError:
        pass
    if host in {"localhost", "localhost.localdomain"} or host.endswith((".localhost", ".local", ".internal", ".test", ".invalid")):
        reasons.append("The address uses a local or reserved hostname and cannot be treated as a public website.")
        flags.append("local_or_reserved_host")
    if "xn--" in host:
        reasons.append("The domain uses encoded international characters that can be used to imitate another domain.")
        flags.append("punycode_domain")
    labels = host.split(".")
    if len(labels) > 5:
        reasons.append("The domain contains an unusually large number of subdomain levels.")
        flags.append("excessive_subdomains")
    if host in SHORTENERS:
        reasons.append("This is a link-shortening service, so the final destination is hidden here.")
        flags.append("url_shortener")
    if p.port and p.port not in (80, 443):
        reasons.append(f"The URL uses an unusual port ({p.port}).")
        flags.append("unusual_port")
    lowered_full = (p.path + "?" + p.query).lower()
    if any(t in lowered_full for t in SUSPICIOUS_TERMS) or any(t in host for t in ("verify-login", "account-secure", "free-prize", "gift-claim")):
        reasons.append("The URL contains a common account-verification, credential, or prize-bait pattern.")
        flags.append("suspicious_url_words")
    actual_reg = registrable_guess(host)
    actual_parts = actual_reg.split(".")
    candidate_labels = labels[:-1]
    brand_hit = None
    for brand, allowed in BRAND_DOMAINS.items():
        if actual_reg in allowed or any(actual_reg.endswith("." + d) for d in allowed):
            continue
        # Brand name in a subdomain, or a near-match in the apparent registered name.
        for label in candidate_labels:
            if label == brand and actual_reg not in allowed:
                brand_hit = brand; break
            if len(label) >= 5 and SequenceMatcher(None, label.replace("-", ""), brand).ratio() >= 0.84 and label.replace("-", "") != brand:
                brand_hit = brand; break
        if brand_hit:
            break
        base_label = actual_parts[0] if actual_parts else ""
        base_norm = base_label.replace("-", "")
        # Common digit substitutions are often used in lookalike brand domains
        # (e.g. paypa1, g00gle). This is a warning signal, not a verdict alone.
        lookalikes = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t"})
        base_visual = base_norm.translate(lookalikes)
        if base_norm and base_norm != brand and (
            (SequenceMatcher(None, base_norm, brand).ratio() >= 0.78 and (base_norm.startswith(brand[:3]) or brand.startswith(base_norm[:3])))
            or (base_visual != brand and SequenceMatcher(None, base_visual, brand).ratio() >= 0.74 and base_visual.startswith(brand[:3]))
            or base_visual.startswith(brand + "login") or base_visual.startswith(brand + "account")
        ):
            brand_hit = brand; break
    if brand_hit:
        reasons.append(f"The domain may be imitating the {brand_hit.title()} brand; verify the exact domain carefully.")
        flags.append("possible_brand_impersonation")
    if not reasons:
        reasons.append("No obvious suspicious URL pattern was detected. This does not prove the destination is safe.")
    verdict = "dangerous" if ("non_public_ip_address" in flags or "local_or_reserved_host" in flags) else ("suspicious" if flags else "unverified")
    return {"verdict": verdict, "reasons": reasons, "normalized_url": normalized, "heuristic_flags": flags}


def blocklist_match(host: str) -> dict | None:
    with get_db() as c:
        rows = c.execute("SELECT domain, reason, severity FROM blocked_domains").fetchall()
    host = host.lower().rstrip(".")
    for row in rows:
        dom = row["domain"].lower().rstrip(".")
        if host == dom or host.endswith("." + dom):
            return {"domain": dom, "reason": row["reason"], "severity": row["severity"]}
    return None


async def web_risk_lookup(url: str) -> dict:
    if not WEBRISK_API_KEY:
        return {"available": False, "matched": False, "reason": "webrisk_not_configured", "threat_types": []}
    params = [
        ("uri", url),
        ("threatTypes", "MALWARE"),
        ("threatTypes", "SOCIAL_ENGINEERING"),
        ("threatTypes", "UNWANTED_SOFTWARE"),
        ("key", WEBRISK_API_KEY),
    ]
    try:
        async with httpx.AsyncClient(timeout=URL_TIMEOUT, follow_redirects=False) as client:
            resp = await client.get("https://webrisk.googleapis.com/v1/uris:search", params=params)
        if resp.status_code != 200:
            return {"available": False, "matched": False, "reason": f"webrisk_http_{resp.status_code}", "threat_types": []}
        data = resp.json()
        threat = data.get("threat") or {}
        types = [str(x) for x in threat.get("threatTypes", [])]
        return {"available": True, "matched": bool(types), "reason": "threat_list_match" if types else "no_known_match", "threat_types": types}
    except (httpx.HTTPError, ValueError):
        return {"available": False, "matched": False, "reason": "webrisk_unavailable", "threat_types": []}


async def check_url(raw: str) -> dict:
    normalized, error = normalize_url(raw, strip_tracking=False)
    if error or not normalized:
        return {"url": raw[:500], "verdict": "dangerous", "reasons": [f"URL rejected: {error or 'invalid URL'}"], "checked_by": ["academy_url_validation"], "live_check": "not_run", "checked_at": utc_now()}
    heuristics = local_heuristics(normalized)
    p = urlsplit(normalized)
    host = p.hostname or ""
    if is_private_or_reserved_host(host):
        return {"url": normalized, "verdict": "dangerous", "reasons": heuristics["reasons"], "checked_by": ["academy_url_validation", "academy_heuristics"], "live_check": "not_run", "checked_at": utc_now(), "recommendation": "block"}
    local_block = blocklist_match(host)
    if local_block:
        reasons = list(heuristics["reasons"] if heuristics["heuristic_flags"] else [])
        reasons.append("Academy blocklist match: " + clean_text(local_block["reason"], 200))
        return {"url": normalized, "verdict": "dangerous", "reasons": reasons, "checked_by": ["academy_blocklist", "academy_heuristics"], "live_check": "matched", "checked_at": utc_now(), "recommendation": "block"}
    live = await web_risk_lookup(normalized)
    checked_by = ["academy_url_validation", "academy_heuristics"]
    if live["available"]:
        checked_by.append("google_webrisk")
    if live["matched"]:
        verdict = "dangerous"
        reasons = ["Google Web Risk reports this URL on a known threat list: " + ", ".join(live["threat_types"]) + "."]
        if heuristics["heuristic_flags"]:
            reasons.extend(heuristics["reasons"])
    elif heuristics["verdict"] == "suspicious":
        verdict, reasons = "suspicious", heuristics["reasons"]
        if not live["available"]:
            reasons.append("Live threat-list verification was unavailable or is not configured.")
    elif live["available"]:
        verdict, reasons = "safe", ["Google Web Risk returned no known threat-list match at check time."]
    else:
        verdict, reasons = "unverified", heuristics["reasons"]
        reasons.append("No live threat-list result is available. Do not treat this as proof of safety.")
    if live["available"] and not live["matched"]:
        live_status = "checked_no_match"
    elif live["matched"]:
        live_status = "threat_match"
    else:
        live_status = "unavailable"
    result = {
        "url": normalized,
        "domain": host,
        "verdict": verdict,
        "reasons": reasons,
        "checked_by": checked_by,
        "heuristic_flags": heuristics["heuristic_flags"],
        "live_check": live_status,
        "checked_at": utc_now(),
        "recommendation": "block" if verdict == "dangerous" else "review" if verdict in ("suspicious", "unverified") else "allow_with_caution",
    }
    if verdict == "dangerous":
        add_security_event("url_threat", "danger", host, "Potentially dangerous link blocked or warned before opening.")
    elif verdict == "suspicious":
        add_security_event("url_warning", "warning", host, "Suspicious URL pattern detected; user review recommended.")
    return result


def add_security_event(event_type: str, severity: str, domain: str, summary: str) -> None:
    try:
        with get_db() as c:
            c.execute("INSERT INTO security_events(id,event_type,severity,domain,summary,created_at) VALUES(?,?,?,?,?,?)",
                      (str(uuid.uuid4()), event_type, severity, domain[:253], summary[:300], utc_now()))
    except Exception:
        pass


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    mode: Literal["web", "private", "academic", "news", "images", "videos", "files"] = "web"
    page: int = Field(default=1, ge=1, le=50)
    safe_search: bool = True
    language: str = Field(default="en", min_length=2, max_length=12)

    @field_validator("query")
    @classmethod
    def query_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(c) < 32 and c not in "\t" for c in value):
            raise ValueError("Search query is empty or contains invalid control characters.")
        return value


class UrlCheckRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


class ReportRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)
    category: Literal["phishing", "malware", "scam", "impersonation", "unsafe_content", "other"]
    details: str = Field(default="", max_length=1000)


class ReportReviewRequest(BaseModel):
    status: Literal["reviewed", "dismissed"] = "reviewed"
    add_domain_to_blocklist: bool = False
    admin_note: str = Field(default="", max_length=500)


class BlockRequest(BaseModel):
    domain: str = Field(min_length=3, max_length=253)
    reason: str = Field(min_length=3, max_length=500)
    severity: Literal["dangerous", "suspicious"] = "dangerous"

    @field_validator("domain")
    @classmethod
    def normalize_domain(cls, value: str) -> str:
        value = value.strip().lower().rstrip(".")
        if "://" in value or "/" in value or "@" in value or " " in value:
            raise ValueError("Supply a domain only, without scheme, path, or credentials.")
        try:
            value = value.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise ValueError("Invalid domain") from exc
        if "." not in value or value.startswith(".") or value.endswith("."):
            raise ValueError("A public fully-qualified domain is required.")
        return value


def clamd_ping() -> bool:
    try:
        with socket.create_connection((CLAMAV_HOST, CLAMAV_PORT), timeout=1.0) as sock:
            sock.settimeout(1.0)
            sock.sendall(b"zPING\0")
            return b"PONG" in sock.recv(64)
    except OSError:
        return False


@app.get("/api/health")
async def health() -> dict:
    # The API remains healthy when an optional dependency is still warming up; each
    # dependency gets an independent readiness flag so the UI can be honest.
    searxng_reachable = False
    try:
        async with httpx.AsyncClient(timeout=1.2, follow_redirects=False) as client:
            response = await client.get(f"{SEARXNG_URL}/")
        searxng_reachable = response.status_code < 500
    except httpx.HTTPError:
        pass
    clamav_reachable = await asyncio.to_thread(clamd_ping)
    return {"ok": True, "service": "academy-safe-browser", "version": APP_VERSION, "time": utc_now(), "features": {
        "searxng_configured": bool(SEARXNG_URL), "searxng_reachable": searxng_reachable,
        "brave_search": bool(BRAVE_SEARCH_API_KEY), "google_webrisk": bool(WEBRISK_API_KEY),
        "clamav_configured": bool(CLAMAV_HOST), "clamav_reachable": clamav_reachable,
        "admin_review": bool(ADMIN_TOKEN and not ADMIN_TOKEN.startswith("CHANGE_ME")),
    }}


@app.get("/api/config")
async def public_config() -> dict:
    return {"service": "Academy Safe Browser", "version": APP_VERSION, "search": {
        "searxng": True, "brave_fallback": bool(BRAVE_SEARCH_API_KEY), "modes": ["web", "private", "academic", "news", "images", "videos", "files"]
    }, "safety": {"google_webrisk": bool(WEBRISK_API_KEY), "academy_heuristics": True, "known_threat_lookup": bool(WEBRISK_API_KEY)},
        "downloads": {"clamav_configured": bool(CLAMAV_HOST), "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024), "executable_downloads_allowed": ALLOW_EXECUTABLE_DOWNLOADS},
        "dns": {"browser_system_dns_control": False, "message": "Web pages cannot change the visitor device's system DNS."}}


MODE_CATEGORIES = {"web": "general", "private": "general", "academic": "science", "news": "news", "images": "images", "videos": "videos", "files": "files"}


def html_to_text(value: str | None) -> str:
    return clean_text(value, 800)


def normalize_result(item: dict, engine: str, category: str) -> dict | None:
    raw_url = item.get("url") or item.get("link") or ""
    url, err = normalize_url(str(raw_url), strip_tracking=True)
    if err or not url:
        return None
    title = html_to_text(item.get("title") or "Untitled result")
    snippet = html_to_text(item.get("content") or item.get("description") or item.get("snippet") or "")
    if not title:
        title = urlsplit(url).hostname or "Search result"
    return {"title": title, "url": url, "snippet": snippet, "engine": engine,
            "category": category, "published": clean_text(str(item.get("publishedDate") or item.get("published") or ""), 40) or None,
            "safety": {"verdict": "unverified", "reasons": ["Checking destination…"], "live_check": "pending"}}


async def query_searxng(body: SearchRequest) -> tuple[list[dict], str | None]:
    params = {"q": body.query, "format": "json", "pageno": body.page,
              "categories": MODE_CATEGORIES[body.mode], "safesearch": 2 if body.safe_search else 0,
              "language": body.language}
    try:
        async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT, follow_redirects=False, headers={"User-Agent": "AcademySafeBrowser/1.0 (+safety search proxy)"}) as client:
            response = await client.get(f"{SEARXNG_URL}/search", params=params)
        response.raise_for_status()
        data = response.json()
        results = [r for r in (normalize_result(x, "SearXNG", MODE_CATEGORIES[body.mode]) for x in data.get("results", [])) if r]
        return results, None
    except (httpx.HTTPError, ValueError, TypeError):
        return [], "searxng_unavailable"


async def query_brave(body: SearchRequest) -> tuple[list[dict], str | None]:
    if not BRAVE_SEARCH_API_KEY or body.mode == "private":
        # This is an intentional configuration choice, not a provider error.
        return [], None
    category = body.mode
    # Brave supports web search in this adapter; category filters are added to query.
    query = body.query
    if category in {"academic", "news", "images", "videos", "files"}:
        query += {"academic": " academic papers", "news": " news", "images": " images", "videos": " videos", "files": " filetype:pdf OR filetype:doc"}[category]
    try:
        headers = {"X-Subscription-Token": BRAVE_SEARCH_API_KEY, "Accept": "application/json", "Accept-Encoding": "gzip"}
        params = {"q": query, "count": 10, "offset": min(body.page - 1, 9), "country": "gh", "search_lang": body.language[:2], "safesearch": "strict" if body.safe_search else "moderate"}
        async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT, follow_redirects=False) as client:
            response = await client.get("https://api.search.brave.com/res/v1/web/search", params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        raw_results = data.get("web", {}).get("results", [])
        results = [r for r in (normalize_result(x, "Brave Search API", MODE_CATEGORIES[body.mode]) for x in raw_results) if r]
        return results, None
    except (httpx.HTTPError, ValueError, TypeError):
        return [], "brave_search_unavailable"


def result_identity(url: str) -> tuple[str, str, str]:
    p = urlsplit(url)
    return ((p.hostname or "").lower(), p.path.rstrip("/").lower(), p.query.lower())


async def safety_enrich(results: list[dict], max_checks: int = 12) -> list[dict]:
    # Only bounded top results are live checked to keep latency and API costs controlled.
    async def enrich(item: dict) -> dict:
        try:
            check = await check_url(item["url"])
            item["safety"] = {"verdict": check["verdict"], "reasons": check["reasons"], "checked_by": check.get("checked_by", []), "live_check": check.get("live_check", "unavailable"), "checked_at": check.get("checked_at")}
        except Exception:
            item["safety"] = {"verdict": "unverified", "reasons": ["Could not complete a safety check. Open with caution."], "checked_by": ["academy_heuristics"], "live_check": "unavailable"}
        return item
    indices = list(range(min(len(results), max_checks)))
    if indices:
        await asyncio.gather(*(enrich(results[i]) for i in indices))
    return results


@app.post("/api/search")
async def search(body: SearchRequest, request: Request) -> dict:
    limit = int(os.getenv("RATE_SEARCH_PER_MINUTE", "30"))
    enforce_rate_limit(request, "search", limit)
    cache_key = hashlib.sha256(json.dumps(body.model_dump(), sort_keys=True).encode()).hexdigest()
    now = time.monotonic()
    if body.mode != "private":
        async with _cache_lock:
            cached = _cache.get(cache_key)
            if cached and now - cached[0] < 300:
                # Return fresh checked_at values only in nested safety data? Keep cached results brief.
                data = json.loads(json.dumps(cached[1]))
                data["cached"] = True
                return data
    searx_task = query_searxng(body)
    brave_task = query_brave(body)
    (searx_results, searx_error), (brave_results, brave_error) = await asyncio.gather(searx_task, brave_task)
    merged: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for item in searx_results + brave_results:
        key = result_identity(item["url"])
        if key in seen:
            continue
        seen.add(key); merged.append(item)
        if len(merged) >= 20:
            break
    await safety_enrich(merged, max_checks=12)
    errors = [e for e in (searx_error, brave_error) if e]
    used = sorted({r["engine"] for r in merged})
    response = {"query": body.query, "mode": body.mode, "page": body.page, "results": merged,
                "checked": bool(merged) and all(x["safety"].get("live_check") in ("checked_no_match", "threat_match") for x in merged[:min(12, len(merged))]),
                "safety_checks_completed": bool(merged),
                "live_verified": bool(merged) and all(x["safety"].get("live_check") in ("checked_no_match", "threat_match") for x in merged[:min(12, len(merged))]),
                "cached": False, "engines": used, "warnings": errors,
                "fallback": not bool(merged), "message": "" if merged else "Search providers did not return results. Check backend configuration or open an external search provider.",
                "checked_at": utc_now()}
    if body.mode != "private" and merged:
        async with _cache_lock:
            if len(_cache) > 200:
                # Discard expired/oldest cache entries to cap memory use.
                for k, v in sorted(_cache.items(), key=lambda kv: kv[1][0])[:80]:
                    _cache.pop(k, None)
            _cache[cache_key] = (time.monotonic(), json.loads(json.dumps(response)))
    return response


@app.post("/api/url-check")
async def url_check(body: UrlCheckRequest, request: Request) -> dict:
    enforce_rate_limit(request, "url-check", int(os.getenv("RATE_URL_CHECK_PER_MINUTE", "60")))
    return await check_url(body.url)


@app.post("/api/reports")
async def submit_report(body: ReportRequest, request: Request) -> dict:
    enforce_rate_limit(request, "report", 8)
    normalized, error = normalize_url(body.url, strip_tracking=True)
    if error or not normalized:
        raise HTTPException(422, detail="Report requires an HTTP or HTTPS URL.")
    p = urlsplit(normalized)
    # Keep only host + path for the moderation queue; drop query and fragment tokens.
    safe_report_url = urlunsplit((p.scheme, p.netloc, p.path, "", ""))
    report_id = str(uuid.uuid4())
    with get_db() as c:
        c.execute("INSERT INTO reports(id,domain,url,category,details,status,created_at) VALUES(?,?,?,?,?,?,?)",
                  (report_id, p.hostname or "", safe_report_url, body.category, clean_text(body.details, 1000), "pending_review", utc_now()))
    add_security_event("user_report", "review", p.hostname or "", "A user submitted a link report for administrator review.")
    return {"submitted": True, "report_id": report_id, "status": "pending_review", "message": "Report received for review. User reports do not automatically block a website."}


def clamd_scan(data: bytes) -> tuple[str, str | None]:
    """Scan bytes with clamd INSTREAM protocol; return ('clean'|'infected'|'unavailable', detail)."""
    try:
        with socket.create_connection((CLAMAV_HOST, CLAMAV_PORT), timeout=CLAMAV_TIMEOUT) as sock:
            sock.settimeout(CLAMAV_TIMEOUT)
            sock.sendall(b"zINSTREAM\0")
            chunk_size = 64 * 1024
            for offset in range(0, len(data), chunk_size):
                chunk = data[offset:offset + chunk_size]
                sock.sendall(struct.pack("!I", len(chunk)))
                sock.sendall(chunk)
            sock.sendall(struct.pack("!I", 0))
            pieces = []
            while True:
                part = sock.recv(4096)
                if not part:
                    break
                pieces.append(part)
                if b"\x00" in part or b"\n" in part:
                    break
            reply = b"".join(pieces).decode("utf-8", "replace").strip("\x00\r\n ")
            if " FOUND" in reply or reply.endswith("FOUND"):
                return "infected", reply[:300]
            if " OK" in reply or reply.endswith("OK"):
                return "clean", reply[:300]
            return "unavailable", reply[:300] or "clamd returned no result"
    except (OSError, socket.timeout):
        return "unavailable", "ClamAV scanner is unreachable or still starting."


def inspect_file(name: str, data: bytes) -> list[str]:
    reasons = []
    ext = Path(name).suffix.lower()
    if ext in EXECUTABLE_EXTENSIONS:
        reasons.append(f"{ext or 'This file'} is an executable or installer-type file, blocked by default.")
    if ext in KNOWN_TYPES and not any(data.startswith(sig) for sig in KNOWN_TYPES[ext]):
        reasons.append("The file signature does not match its filename extension.")
    if ext in {".html", ".htm", ".svg", ".js", ".mjs", ".hta"}:
        reasons.append("Active content can run scripts or load remote resources when opened.")
    if data.startswith(b"MZ") and ext not in {".exe", ".dll", ".scr", ".com", ".msi"}:
        reasons.append("The file has a Windows executable signature that does not match its extension.")
    if data.startswith(b"\x7fELF") and ext not in {".so", ".elf", ".bin", ".out"}:
        reasons.append("The file has a Linux executable signature that does not match its extension.")
    return reasons


@app.post("/api/downloads/scan")
async def scan_upload(request: Request, file: UploadFile = File(...)) -> dict:
    enforce_rate_limit(request, "file-scan", 5)
    original_name = Path(file.filename or "uploaded-file").name.replace("\x00", "")[:200]
    if not original_name or original_name in {".", ".."}:
        original_name = "uploaded-file"
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if not data:
        raise HTTPException(400, detail="The selected file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024*1024)} MB scan limit.")
    sha = hashlib.sha256(data).hexdigest()
    ext_reasons = inspect_file(original_name, data)
    scan_status, scan_detail = await asyncio.to_thread(clamd_scan, data)
    reasons = list(ext_reasons)
    is_executable = Path(original_name).suffix.lower() in EXECUTABLE_EXTENSIONS
    if scan_status == "infected":
        verdict = "infected"
        reasons.insert(0, "ClamAV detected a known malware signature.")
    elif is_executable and not ALLOW_EXECUTABLE_DOWNLOADS:
        verdict = "blocked"
        if scan_status == "unavailable":
            reasons.append("ClamAV is unavailable, so no malware verdict was obtained either.")
    elif scan_status == "unavailable":
        verdict = "unscanned"
        reasons.append("The live malware scanner is unavailable; the file is not cleared for use.")
    elif ext_reasons:
        verdict = "warning"
    else:
        verdict = "clean_scanned"
        reasons.append("ClamAV found no known malware signature. This is not a guarantee that the file is harmless.")
    risky = verdict in {"infected", "unscanned", "blocked", "warning"}
    scan_id = str(uuid.uuid4())
    q_path = None
    if risky:
        # Keep only flagged or unscanned content in a non-public quarantine volume.
        q_path = str(QUARANTINE_DIR / f"{scan_id}.quarantine")
        try:
            QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
            Path(q_path).write_bytes(data)
        except OSError:
            q_path = None
            reasons.append("Quarantine storage failed; the file copy was not retained. Keep the original closed and retry later.")
    with get_db() as c:
        c.execute("INSERT INTO scans(id,original_name,sha256,size_bytes,verdict,engine,reasons_json,quarantine_path,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                  (scan_id, original_name, sha, len(data), verdict, "ClamAV" if scan_status != "unavailable" else "ClamAV unavailable", json.dumps(reasons), q_path, utc_now()))
    severity = "danger" if verdict in {"infected", "blocked"} else "warning" if risky else "info"
    if risky:
        add_security_event("download_scan", severity, "", f"File scan result: {verdict}. Original filename was kept out of public event summaries.")
    # A clean copy is deliberately not retained or made downloadable by this API.
    return {"scan_id": scan_id, "filename": original_name, "size_bytes": len(data), "sha256": sha,
            "verdict": verdict, "scanner": "ClamAV" if scan_status != "unavailable" else "ClamAV unavailable",
            "scanner_detail": scan_detail, "quarantined": bool(q_path), "reasons": reasons,
            "checked_at": utc_now(), "note": "This scans the uploaded copy only. It cannot intercept or automatically scan files before they arrive on your phone."}


@app.get("/api/downloads/history")
async def scan_history(request: Request) -> dict:
    # No file contents or original file paths are returned. This anonymous history is deployment-wide,
    # so it intentionally returns counts only, not another visitor's filenames or hashes.
    with get_db() as c:
        total = c.execute("SELECT COUNT(*) FROM scans").fetchone()[0]
        quarantined = c.execute("SELECT COUNT(*) FROM scans WHERE quarantine_path IS NOT NULL").fetchone()[0]
        recent = c.execute("SELECT verdict, COUNT(*) AS n FROM scans GROUP BY verdict").fetchall()
    return {"total_scans": total, "currently_quarantined": quarantined, "counts_by_verdict": {r["verdict"]: r["n"] for r in recent}}


@app.get("/api/dns/providers")
async def dns_providers() -> dict:
    return {"system_dns": {"name": "System DNS", "status": "device-managed", "applies_to": "The visitor's device and browser", "web_page_can_change": False},
            "providers": [
                {"id": "cloudflare", "name": "Cloudflare DNS over HTTPS", "endpoint": "https://cloudflare-dns.com/dns-query", "type": "secure"},
                {"id": "google", "name": "Google Public DNS over HTTPS", "endpoint": "https://dns.google/resolve", "type": "secure"},
                {"id": "cloudflare-family", "name": "Cloudflare Family (malware/adult filtering where supported)", "endpoint": "https://family.cloudflare-dns.com/dns-query", "type": "family"}],
            "limitation": "Choosing a provider here only runs a diagnostic or records a preference. It does not change device-level DNS for external sites. Actual system DNS requires Android/iOS settings or a native browser/VPN profile."}


class DnsTestRequest(BaseModel):
    provider: Literal["cloudflare", "google", "cloudflare-family", "custom"] = "cloudflare"
    custom_endpoint: str | None = Field(default=None, max_length=512)


@app.post("/api/dns/test")
async def dns_test(body: DnsTestRequest, request: Request) -> dict:
    enforce_rate_limit(request, "dns-test", 10)
    if body.provider == "custom":
        raw = (body.custom_endpoint or "").strip()
        try:
            parsed = urlsplit(raw)
            hostname = (parsed.hostname or "").encode("idna").decode("ascii").lower()
            port = parsed.port
        except (ValueError, UnicodeError):
            raise HTTPException(422, detail="Enter a valid custom HTTPS DNS-over-HTTPS endpoint.")
        if parsed.scheme.lower() != "https" or not hostname or parsed.username or parsed.password or port not in (None, 443):
            raise HTTPException(422, detail="Custom DNS must be an HTTPS endpoint on the default TLS port, without embedded credentials.")
        if is_private_or_reserved_host(hostname):
            raise HTTPException(422, detail="Local/private DNS endpoints are not accepted by this public service.")
        # Do not call arbitrary custom endpoints from the server: that creates an SSRF vector.
        return {"provider": "custom", "reachable": None, "format_valid": True, "tested_at": utc_now(),
                "message": "The HTTPS endpoint format passed validation. Academy did not contact it, so reachability and resolver behavior remain unverified.",
                "device_dns_changed": False}
    endpoints = {
        "cloudflare": ("https://cloudflare-dns.com/dns-query", {"name": "example.com", "type": "A"}, {"accept": "application/dns-json"}),
        "google": ("https://dns.google/resolve", {"name": "example.com", "type": "A"}, {"accept": "application/dns-json"}),
        "cloudflare-family": ("https://family.cloudflare-dns.com/dns-query", {"name": "example.com", "type": "A"}, {"accept": "application/dns-json"}),
    }
    endpoint, params, headers = endpoints[body.provider]
    try:
        async with httpx.AsyncClient(timeout=3.5, follow_redirects=False) as client:
            r = await client.get(endpoint, params=params, headers=headers)
        data = r.json() if r.status_code == 200 else {}
        ok = r.status_code == 200 and bool(data.get("Answer"))
        return {"provider": body.provider, "reachable": ok, "tested_at": utc_now(), "message": "Provider responded to a DNS-over-HTTPS test." if ok else "No valid DNS answer was returned.", "device_dns_changed": False}
    except (httpx.HTTPError, ValueError):
        return {"provider": body.provider, "reachable": False, "tested_at": utc_now(), "message": "The provider did not respond to the test from this server.", "device_dns_changed": False}


@app.get("/api/security/summary")
async def security_summary() -> dict:
    with get_db() as c:
        blocks = c.execute("SELECT COUNT(*) FROM blocked_domains").fetchone()[0]
        pending = c.execute("SELECT COUNT(*) FROM reports WHERE status='pending_review'").fetchone()[0]
        scans = c.execute("SELECT COUNT(*) FROM scans").fetchone()[0]
    return {"academy_blocklist_domains": blocks, "reports_pending_review": pending, "files_scanned_on_backend": scans,
            "live_webrisk_enabled": bool(WEBRISK_API_KEY), "clamav_enabled": bool(CLAMAV_HOST), "updated_at": utc_now()}


@app.get("/api/admin/reports", dependencies=[Depends(require_admin)])
async def admin_reports(status: str = "pending_review", limit: int = 100) -> dict:
    limit = max(1, min(limit, 250))
    with get_db() as c:
        rows = c.execute("SELECT id,domain,url,category,details,status,created_at FROM reports WHERE status=? ORDER BY created_at DESC LIMIT ?", (status[:40], limit)).fetchall()
    return {"reports": [dict(row) for row in rows]}




@app.post("/api/admin/reports/{report_id}/review", dependencies=[Depends(require_admin)])
async def admin_review_report(report_id: str, body: ReportReviewRequest) -> dict:
    with get_db() as c:
        row = c.execute("SELECT id,domain,category FROM reports WHERE id=?", (report_id,)).fetchone()
        if not row:
            raise HTTPException(404, detail="Report not found.")
        c.execute("UPDATE reports SET status=? WHERE id=?", (body.status, report_id))
        if body.add_domain_to_blocklist:
            domain = (row["domain"] or "").lower().rstrip(".")
            if not domain or "." not in domain:
                raise HTTPException(422, detail="The report does not contain a valid domain for blocklisting.")
            reason = clean_text(body.admin_note, 500) or f"Administrator confirmed reported {row['category']} risk."
            c.execute("INSERT INTO blocked_domains(domain,reason,severity,added_by,created_at) VALUES(?,?,?,?,?) ON CONFLICT(domain) DO UPDATE SET reason=excluded.reason,severity=excluded.severity,added_by=excluded.added_by,created_at=excluded.created_at",
                      (domain, reason, "dangerous", "admin-review", utc_now()))
    return {"reviewed": True, "report_id": report_id, "status": body.status, "domain_blocked": body.add_domain_to_blocklist}

@app.post("/api/admin/blocklist", dependencies=[Depends(require_admin)])
async def admin_add_block(body: BlockRequest) -> dict:
    domain = body.domain
    try:
        with get_db() as c:
            c.execute("INSERT INTO blocked_domains(domain,reason,severity,added_by,created_at) VALUES(?,?,?,?,?) ON CONFLICT(domain) DO UPDATE SET reason=excluded.reason,severity=excluded.severity,added_by=excluded.added_by,created_at=excluded.created_at",
                      (domain, clean_text(body.reason, 500), body.severity, "admin", utc_now()))
    except sqlite3.Error:
        raise HTTPException(500, detail="Could not update the Academy blocklist.")
    return {"saved": True, "domain": domain, "severity": body.severity}


@app.delete("/api/admin/blocklist/{domain}", dependencies=[Depends(require_admin)])
async def admin_remove_block(domain: str) -> dict:
    with get_db() as c:
        cur = c.execute("DELETE FROM blocked_domains WHERE domain=?", (domain.lower().rstrip("."),))
    if not cur.rowcount:
        raise HTTPException(404, detail="Domain not found in the Academy blocklist.")
    return {"removed": True, "domain": domain}


@app.get("/api/admin/quarantine", dependencies=[Depends(require_admin)])
async def admin_quarantine(limit: int = 100) -> dict:
    limit = max(1, min(limit, 250))
    with get_db() as c:
        rows = c.execute("SELECT id,original_name,sha256,size_bytes,verdict,engine,reasons_json,quarantine_path,created_at FROM scans WHERE quarantine_path IS NOT NULL ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return {"items": [{"scan_id": r["id"], "filename": r["original_name"], "sha256": r["sha256"], "size_bytes": r["size_bytes"], "verdict": r["verdict"], "scanner": r["engine"], "reasons": json.loads(r["reasons_json"]), "created_at": r["created_at"]} for r in rows]}


@app.delete("/api/admin/quarantine/{scan_id}", dependencies=[Depends(require_admin)])
async def admin_delete_quarantine(scan_id: str) -> dict:
    with get_db() as c:
        row = c.execute("SELECT quarantine_path FROM scans WHERE id=?", (scan_id,)).fetchone()
        if not row:
            raise HTTPException(404, detail="Scan record not found.")
        path = row["quarantine_path"]
        if path:
            p = Path(path)
            if p.parent.resolve() != QUARANTINE_DIR.resolve():
                raise HTTPException(400, detail="Unsafe quarantine path refused.")
            p.unlink(missing_ok=True)
        c.execute("UPDATE scans SET quarantine_path=NULL WHERE id=?", (scan_id,))
    return {"deleted": True, "scan_id": scan_id}


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    # Do not leak filesystem paths, API keys, or full exception messages to clients.
    return JSONResponse(status_code=500, content={"detail": "Academy could not complete this request. Check server logs with secrets redacted."})

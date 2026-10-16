"""Code Academy premium payment API.

This API never trusts a browser payment callback. Automatic MTN payments are
confirmed by querying MTN's server API. Manual wallet transfers remain pending
until an allowlisted administrator confirms them in the recipient wallet.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from typing import Any

import firebase_admin
from firebase_admin import auth as firebase_auth
import requests
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.exceptions import HTTPException

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("code-academy-premium")

APP = Flask(__name__)
APP.config["MAX_CONTENT_LENGTH"] = 24 * 1024
APP.config["JSON_SORT_KEYS"] = False

FRONTEND_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "https://egyirprince609-oss.github.io,http://localhost:5500,http://127.0.0.1:5500",
    ).split(",")
    if origin.strip()
]
CORS(
    APP,
    resources={r"/api/*": {"origins": FRONTEND_ORIGINS}},
    allow_headers=["Authorization", "Content-Type"],
    methods=["GET", "POST", "OPTIONS"],
    supports_credentials=False,
    max_age=600,
)

limiter = Limiter(
    get_remote_address,
    app=APP,
    default_limits=[os.getenv("API_RATE_LIMIT", "120 per hour")],
    storage_uri=os.getenv("RATE_LIMIT_STORAGE_URL", "memory://"),
)

PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "codeacademybywm")
ADMIN_UIDS = {item.strip() for item in os.getenv("ADMIN_UIDS", "").split(",") if item.strip()}
PAYMENT_MODE = os.getenv("PAYMENT_MODE", "manual_momo").strip().lower()
RECIPIENT_PHONE_RAW = os.getenv("MOMO_RECIPIENT_PHONE", "233593675745")
RECIPIENT_NAME = os.getenv("MOMO_RECIPIENT_NAME", "Constance Mensah")
RECIPIENT_PHONE = re.sub(r"\D", "", RECIPIENT_PHONE_RAW)
if RECIPIENT_PHONE.startswith("0") and len(RECIPIENT_PHONE) == 10:
    RECIPIENT_PHONE = "233" + RECIPIENT_PHONE[1:]
elif RECIPIENT_PHONE.startswith("+233"):
    RECIPIENT_PHONE = RECIPIENT_PHONE[1:]

PLANS: dict[str, dict[str, Any]] = {
    "monthly": {
        "title": "1 Month Premium", "days": 30, "usd": 2.00, "ghs": 20.00,
        "tagline": "Try the premium learning experience",
    },
    "yearly": {
        "title": "1 Year Premium", "days": 365, "usd": 18.00, "ghs": 180.00,
        "tagline": "A full year of focused learning",
    },
    "three_years": {
        "title": "3 Years Premium", "days": 1095, "usd": 45.00, "ghs": 450.00,
        "tagline": "Long-term access at a lower yearly cost",
    },
    "four_years": {
        "title": "4 Years Premium", "days": 1460, "usd": 55.00, "ghs": 550.00,
        "tagline": "The longest access plan",
    },
}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


@APP.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    body = {"error": {"code": error.code, "message": error.message}}
    if error.details:
        body["error"]["details"] = error.details
    return jsonify(body), error.status


@APP.errorhandler(429)
def handle_rate_limit(_error):
    return jsonify({"error": {"code": "RATE_LIMITED", "message": "Too many requests. Please wait and try again."}}), 429


@APP.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    return jsonify({"error": {"code": error.name.upper().replace(" ", "_"), "message": error.description}}), error.code or 500


@APP.errorhandler(Exception)
def handle_unexpected(error: Exception):
    logger.exception("Unhandled premium API error")
    return jsonify({"error": {"code": "INTERNAL_SERVER_ERROR", "message": "The server could not complete this request. Check the backend logs for the technical error."}}), 500


def _ensure_firebase() -> bool:
    if firebase_admin._apps:
        return True
    service_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    service_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    try:
        if service_json:
            from firebase_admin import credentials
            credential = credentials.Certificate(json.loads(service_json))
            firebase_admin.initialize_app(credential, {"projectId": PROJECT_ID})
            return True
        if service_path:
            from firebase_admin import credentials
            credential = credentials.Certificate(service_path)
            firebase_admin.initialize_app(credential, {"projectId": PROJECT_ID})
            return True
        # On managed Google Cloud hosting, Application Default Credentials may exist.
        firebase_admin.initialize_app(options={"projectId": PROJECT_ID})
        return True
    except Exception as exc:
        logger.error("Firebase Admin is not configured: %s", str(exc))
        return False


def _db():
    if not _ensure_firebase():
        raise ApiError(503, "FIREBASE_ADMIN_NOT_CONFIGURED", "The secure backend is missing Firebase Admin credentials. Configure the service account on the backend host; never put it in browser JavaScript or the ZIP's public files.")
    from firebase_admin import firestore
    return firestore.client()


def _current_user() -> dict:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError(401, "AUTH_REQUIRED", "Sign in to Code Academy before starting a premium payment.")
    token = header[7:].strip()
    if not token:
        raise ApiError(401, "AUTH_REQUIRED", "Your sign-in token is missing. Sign in again.")
    if not _ensure_firebase():
        raise ApiError(503, "FIREBASE_ADMIN_NOT_CONFIGURED", "The secure backend is missing Firebase Admin credentials.")
    try:
        decoded = firebase_auth.verify_id_token(token, check_revoked=True)
        g.user_claims = decoded
        return decoded
    except Exception as exc:
        logger.info("Firebase token rejected: %s", type(exc).__name__)
        raise ApiError(401, "INVALID_SESSION", "Your Code Academy session is expired or invalid. Sign in again.") from exc


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        g.current_user = _current_user()
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        uid = str(g.current_user.get("uid", ""))
        if not ADMIN_UIDS:
            raise ApiError(503, "ADMIN_UIDS_NOT_CONFIGURED", "The backend administrator allowlist is empty. Add the authorized owner's Firebase UID to ADMIN_UIDS on the backend host.")
        if uid not in ADMIN_UIDS:
            raise ApiError(403, "ADMIN_ONLY", "This account is not authorized to review premium payments.")
        return fn(*args, **kwargs)
    return wrapper


def _normalize_ghana_phone(value: Any) -> str:
    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("0") and len(digits) == 10:
        digits = "233" + digits[1:]
    elif raw.startswith("+") and digits.startswith("233"):
        pass
    if not re.fullmatch(r"233\d{9}", digits):
        raise ApiError(400, "INVALID_GHANA_PHONE", "Enter a valid Ghana mobile number, for example 0241234567 or +233241234567.")
    return digits


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("-1.00")


def _plan(plan_id: str) -> dict[str, Any]:
    plan = PLANS.get(plan_id)
    if not plan:
        raise ApiError(400, "INVALID_PLAN", "Select one of the available premium plans.")
    return plan


def _mtn_enabled() -> bool:
    return (
        PAYMENT_MODE in {"mtn_momo", "auto", "automatic"}
        and bool(os.getenv("MTN_COLLECTION_API_USER", "").strip())
        and bool(os.getenv("MTN_COLLECTION_API_KEY", "").strip())
        and bool(os.getenv("MTN_COLLECTION_SUBSCRIPTION_KEY", "").strip())
    )


def _mtn_config() -> dict[str, str]:
    target = os.getenv("MTN_TARGET_ENVIRONMENT", "mtnghana").strip()
    default_base = "https://sandbox.momodeveloper.mtn.com" if target == "sandbox" else "https://proxy.momoapi.mtn.com"
    base = os.getenv("MTN_API_BASE_URL", default_base).strip().rstrip("/")
    return {
        "base": base,
        "target": target,
        "user": os.getenv("MTN_COLLECTION_API_USER", "").strip(),
        "api_key": os.getenv("MTN_COLLECTION_API_KEY", "").strip(),
        "subscription_key": os.getenv("MTN_COLLECTION_SUBSCRIPTION_KEY", "").strip(),
    }


def _mtn_error(response: requests.Response) -> ApiError:
    code = f"MTN_HTTP_{response.status_code}"
    message = f"MTN MoMo returned HTTP {response.status_code}."
    provider_code = ""
    try:
        body = response.json()
        if isinstance(body, dict):
            provider_code = str(body.get("code") or body.get("statusCode") or "")
            provider_message = str(body.get("message") or body.get("error_description") or body.get("error") or "")
            if provider_code:
                code = provider_code[:100]
            if provider_message:
                message = provider_message[:500]
    except ValueError:
        text = (response.text or "").strip()
        if text:
            message = text[:500]
    return ApiError(502, code, message, {"httpStatus": response.status_code})


_MTN_TOKEN_VALUE = ""
_MTN_TOKEN_EXPIRY = 0.0


def _mtn_access_token() -> str:
    global _MTN_TOKEN_VALUE, _MTN_TOKEN_EXPIRY
    if _MTN_TOKEN_VALUE and time.monotonic() < _MTN_TOKEN_EXPIRY - 30:
        return _MTN_TOKEN_VALUE
    cfg = _mtn_config()
    if not cfg["user"] or not cfg["api_key"] or not cfg["subscription_key"]:
        raise ApiError(503, "MTN_MERCHANT_NOT_CONFIGURED", "Automatic MTN MoMo checkout is not configured. Use the displayed manual transfer option or complete merchant API onboarding first.")
    try:
        response = requests.post(
            cfg["base"] + "/collection/token/",
            auth=(cfg["user"], cfg["api_key"]),
            headers={
                "Ocp-Apim-Subscription-Key": cfg["subscription_key"],
                "X-Target-Environment": cfg["target"],
            },
            timeout=(5, 20),
        )
    except requests.RequestException as exc:
        raise ApiError(502, "MTN_NETWORK_ERROR", f"Could not reach the MTN MoMo API: {str(exc)[:300]}") from exc
    if not response.ok:
        raise _mtn_error(response)
    try:
        token = response.json().get("access_token")
    except (ValueError, AttributeError):
        token = None
    if not token:
        raise ApiError(502, "MTN_TOKEN_MISSING", "MTN's token response did not contain an access_token.")
    _MTN_TOKEN_VALUE = str(token)
    try:
        lifetime = max(60, int(response.json().get("expires_in", 1800)))
    except (ValueError, TypeError, AttributeError):
        lifetime = 1800
    _MTN_TOKEN_EXPIRY = time.monotonic() + lifetime
    return _MTN_TOKEN_VALUE


def _mtn_headers(token: str, reference_id: str | None = None) -> dict[str, str]:
    cfg = _mtn_config()
    headers = {
        "Authorization": f"Bearer {token}",
        "Ocp-Apim-Subscription-Key": cfg["subscription_key"],
        "X-Target-Environment": cfg["target"],
        "Content-Type": "application/json",
    }
    if reference_id:
        headers["X-Reference-Id"] = reference_id
    return headers


def _mtn_start_payment(order_id: str, payer_phone: str, amount_ghs: Decimal, plan_title: str) -> str:
    cfg = _mtn_config()
    token = _mtn_access_token()
    reference_id = str(uuid.uuid4())
    payload = {
        "amount": f"{amount_ghs:.2f}",
        "currency": "GHS",
        "externalId": order_id,
        "payer": {"partyIdType": "MSISDN", "partyId": payer_phone},
        "payerMessage": "Code Academy Premium",
        "payeeNote": ("Premium " + plan_title)[:100],
    }
    try:
        response = requests.post(
            cfg["base"] + "/collection/v1_0/requesttopay",
            headers=_mtn_headers(token, reference_id),
            json=payload,
            timeout=(5, 25),
        )
    except requests.RequestException as exc:
        raise ApiError(502, "MTN_NETWORK_ERROR", f"Could not submit the payment request to MTN MoMo: {str(exc)[:300]}") from exc
    if response.status_code != 202:
        raise _mtn_error(response)
    return reference_id


def _mtn_payment_status(reference_id: str) -> dict[str, Any]:
    cfg = _mtn_config()
    token = _mtn_access_token()
    try:
        response = requests.get(
            cfg["base"] + "/collection/v1_0/requesttopay/" + reference_id,
            headers=_mtn_headers(token),
            timeout=(5, 20),
        )
    except requests.RequestException as exc:
        raise ApiError(502, "MTN_NETWORK_ERROR", f"Could not check the MTN transaction status: {str(exc)[:300]}") from exc
    if not response.ok:
        raise _mtn_error(response)
    try:
        body = response.json()
    except ValueError as exc:
        raise ApiError(502, "MTN_INVALID_RESPONSE", "MTN returned a response that was not valid JSON.") from exc
    if not isinstance(body, dict):
        raise ApiError(502, "MTN_INVALID_RESPONSE", "MTN returned an unexpected payment-status response.")
    return body


def _safe_order(order_id: str, data: dict[str, Any]) -> dict[str, Any]:
    plan = PLANS.get(data.get("planId", ""), {})
    return {
        "id": order_id,
        "planId": data.get("planId"),
        "planTitle": plan.get("title", data.get("planTitle", "Premium")),
        "amountGhs": float(data.get("amountGhs", 0)),
        "amountUsd": float(data.get("amountUsd", 0)),
        "currency": data.get("currency", "GHS"),
        "method": data.get("method"),
        "status": data.get("status"),
        "manualTransactionId": data.get("manualTransactionId", ""),
        "providerStatus": data.get("providerStatus", ""),
        "errorCode": data.get("errorCode", ""),
        "errorMessage": data.get("errorMessage", ""),
        "createdAt": _iso_date(data.get("createdAt")),
        "paidAt": _iso_date(data.get("paidAt")),
        "expiresAt": _iso_date(data.get("expiresAt")),
    }


def _iso_date(value: Any) -> str | None:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value) if value else None


def _send_owner_whatsapp(event: str, order_id: str, order: dict[str, Any]) -> None:
    """Optional approved WhatsApp Business template notification.

    Configure a Meta-approved template with 8 body placeholders ({{1}}..{{8}}).
    If the notification provider is unavailable, the payment record remains valid.
    """
    access_token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    graph_version = os.getenv("WHATSAPP_GRAPH_VERSION", "").strip()
    owner = re.sub(r"\D", "", os.getenv("OWNER_WHATSAPP", "").strip())
    template_name = os.getenv("WHATSAPP_TEMPLATE_NAME", "").strip()
    language = os.getenv("WHATSAPP_LANGUAGE_CODE", "en").strip()
    if not all([access_token, phone_number_id, graph_version, owner, template_name]):
        logger.info("WhatsApp notification not sent; WhatsApp Business Cloud settings are incomplete.")
        return
    uid = str(order.get("uid", ""))
    plan = PLANS.get(order.get("planId", ""), {})
    transaction_ref = str(order.get("manualTransactionId") or order.get("mtnReference") or "Not provided")
    values = [
        event[:80],
        str(order.get("displayName") or "Code Academy user")[:100],
        str(order.get("email") or "Not provided")[:150],
        uid[:16] or "Not provided",
        str(plan.get("title", "Premium"))[:100],
        f"GHS {float(order.get('amountGhs', 0)):.2f}",
        order_id[:60],
        transaction_ref[:100],
    ]
    payload = {
        "messaging_product": "whatsapp",
        "to": owner,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": value} for value in values]},],
        },
    }
    try:
        response = requests.post(
            f"https://graph.facebook.com/{graph_version}/{phone_number_id}/messages",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=payload,
            timeout=(5, 15),
        )
        if not response.ok:
            logger.warning("WhatsApp template notification failed (HTTP %s): %s", response.status_code, (response.text or "")[:400])
    except requests.RequestException as exc:
        logger.warning("WhatsApp notification request failed: %s", str(exc)[:300])


def _activate_subscription(order_id: str, order_ref, order_data: dict[str, Any], transaction_ref: str, method: str, reviewed_by: str | None = None) -> bool:
    """Atomically mark the order paid and extend the user's subscription once."""
    from firebase_admin import firestore

    db = _db()
    user_ref = db.collection("users").document(str(order_data["uid"]))
    duration = int(_plan(order_data["planId"])["days"])
    now = datetime.now(timezone.utc)
    tx = db.transaction()

    @firestore.transactional
    def commit(transaction):
        current_order_snap = order_ref.get(transaction=transaction)
        current_order = current_order_snap.to_dict() or {}
        if current_order.get("status") == "paid":
            return False
        allowed_states = {"pending", "review_required", "awaiting_transfer", "verifying"}
        if current_order.get("status") not in allowed_states:
            raise ApiError(409, "ORDER_NOT_PAYABLE", "This order cannot be marked paid in its current state.")
        user_snap = user_ref.get(transaction=transaction)
        user_data = user_snap.to_dict() or {}
        current_subscription = user_data.get("subscription") or {}
        existing_expiry = current_subscription.get("expiresAt") or user_data.get("premiumUntil")
        if hasattr(existing_expiry, "to_datetime"):
            existing_expiry = existing_expiry.to_datetime()
        if isinstance(existing_expiry, datetime) and existing_expiry.tzinfo is None:
            existing_expiry = existing_expiry.replace(tzinfo=timezone.utc)
        start_from = existing_expiry if isinstance(existing_expiry, datetime) and existing_expiry > now else now
        expires = start_from + timedelta(days=duration)
        transaction.set(
            user_ref,
            {
                "premium": True,
                "premiumUntil": expires,
                "subscription": {
                    "status": "active",
                    "planId": current_order["planId"],
                    "planName": _plan(current_order["planId"])["title"],
                    "startedAt": now,
                    "expiresAt": expires,
                    "updatedAt": now,
                    "paymentOrderId": order_id,
                    "paymentMethod": method,
                    "paymentCurrency": "GHS",
                    "paymentAmountGhs": float(current_order["amountGhs"]),
                    "transactionReference": transaction_ref,
                },
                "updatedAt": now,
            },
            merge=True,
        )
        order_update = {
            "status": "paid",
            "paidAt": now,
            "expiresAt": expires,
            "transactionReference": transaction_ref,
            "paymentVerifiedBy": "mtn-api" if method == "mtn_momo" else "admin-manual-review",
            "updatedAt": now,
        }
        if reviewed_by:
            order_update["reviewedBy"] = reviewed_by
            order_update["reviewedAt"] = now
        transaction.update(order_ref, order_update)
        return True

    changed = commit(tx)
    if changed:
        try:
            fresh = order_ref.get().to_dict() or {}
            _send_owner_whatsapp("PAYMENT CONFIRMED - PREMIUM ACTIVATED", order_id, fresh)
        except Exception:
            logger.exception("Could not send premium confirmation notification")
    return bool(changed)


def _sync_mtn_order(order_id: str, order_ref, data: dict[str, Any]) -> dict[str, Any]:
    if data.get("status") != "pending" or not data.get("mtnReference"):
        return data
    body = _mtn_payment_status(str(data["mtnReference"]))
    provider_status = str(body.get("status", "PENDING")).upper()
    if provider_status == "SUCCESSFUL":
        actual_amount = _money(body.get("amount"))
        actual_currency = str(body.get("currency", "")).upper()
        expected_amount = _money(data.get("amountGhs"))
        if actual_amount != expected_amount or actual_currency != "GHS":
            order_ref.update({
                "status": "review_required",
                "providerStatus": provider_status,
                "errorCode": "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH",
                "errorMessage": "MTN reported success, but its returned amount/currency did not match the order. Manual review is required; premium was not activated.",
                "updatedAt": datetime.now(timezone.utc),
            })
            updated = order_ref.get().to_dict() or {}
            _send_owner_whatsapp("MTN PAYMENT NEEDS MANUAL REVIEW", order_id, updated)
            return updated
        transaction_ref = str(body.get("financialTransactionId") or data["mtnReference"])
        _activate_subscription(order_id, order_ref, data, transaction_ref, "mtn_momo")
        return order_ref.get().to_dict() or data
    if provider_status == "FAILED" or provider_status == "REJECTED" or provider_status == "TIMEOUT":
        reason = body.get("reason") or body.get("message") or f"MTN payment status: {provider_status}"
        order_ref.update({
            "status": "failed",
            "providerStatus": provider_status,
            "errorCode": str(body.get("code") or provider_status)[:100],
            "errorMessage": str(reason)[:500],
            "updatedAt": datetime.now(timezone.utc),
        })
        updated = order_ref.get().to_dict() or data
        _send_owner_whatsapp("MTN PAYMENT FAILED", order_id, updated)
        return updated
    order_ref.update({"providerStatus": provider_status, "updatedAt": datetime.now(timezone.utc)})
    return order_ref.get().to_dict() or data


@APP.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "Code Academy Premium API"})


@APP.get("/api/config")
def public_config():
    plans = {
        plan_id: {
            "id": plan_id, "title": plan["title"], "days": plan["days"],
            "usd": plan["usd"], "ghs": plan["ghs"], "tagline": plan["tagline"],
        }
        for plan_id, plan in PLANS.items()
    }
    return jsonify({
        "brand": "Code Academy",
        "currency": "GHS",
        "displayExchangeRateGhsPerUsd": 10,
        "plans": plans,
        "manualMomoEnabled": True,
        "manualRecipientPhone": RECIPIENT_PHONE,
        "manualRecipientName": RECIPIENT_NAME,
        "automaticMtnMomoEnabled": _mtn_enabled(),
        "cardPaymentsEnabled": False,
        "bankTransferEnabled": False,
        "otherWalletsEnabled": False,
        "rateDisclaimer": "GH₵ prices are fixed estimates using GH₵10 per USD, not a live exchange rate. The amount shown at checkout is the amount due in Ghana cedis.",
    })


@APP.get("/api/me")
@login_required
def current_account_status():
    db = _db()
    uid = str(g.current_user["uid"])
    snap = db.collection("users").document(uid).get()
    user_data = snap.to_dict() or {}
    subscription = user_data.get("subscription") or {}
    expiry = subscription.get("expiresAt") or user_data.get("premiumUntil")
    if hasattr(expiry, "to_datetime"):
        expiry = expiry.to_datetime()
    active = bool(user_data.get("premium")) and isinstance(expiry, datetime) and expiry > datetime.now(timezone.utc)
    return jsonify({
        "uid": uid,
        "displayName": str(user_data.get("displayName") or user_data.get("username") or g.current_user.get("name") or g.current_user.get("email") or "Code Academy user"),
        "email": str(g.current_user.get("email") or user_data.get("email") or ""),
        "premium": active,
        "subscriptionStatus": "active" if active else "free",
        "planName": subscription.get("planName", ""),
        "expiresAt": _iso_date(expiry),
    })


@APP.post("/api/orders")
@limiter.limit("12 per hour")
@login_required
def create_order():
    payload = request.get_json(silent=True) or {}
    plan_id = str(payload.get("planId", ""))
    method = str(payload.get("method", ""))
    plan = _plan(plan_id)
    if method not in {"manual_momo", "mtn_momo"}:
        raise ApiError(400, "PAYMENT_METHOD_NOT_AVAILABLE", "That payment method is not enabled. Card and bank checkout require an approved merchant gateway integration.")
    if method == "mtn_momo" and not _mtn_enabled():
        raise ApiError(503, "MTN_MERCHANT_NOT_CONFIGURED", "Automatic MTN MoMo checkout is not enabled. Use manual MoMo transfer, or configure an approved MTN Collections merchant account on the backend.")
    payer_phone = _normalize_ghana_phone(payload.get("payerPhone"))
    claims = g.current_user
    uid = str(claims["uid"])
    order_id = "CA-" + uuid.uuid4().hex[:14].upper()
    db = _db()
    profile_snap = db.collection("users").document(uid).get()
    profile = profile_snap.to_dict() or {}
    if method == "mtn_momo":
        # Avoid accidentally asking a payer to approve several requests for one account.
        for existing_snap in db.collection("premiumOrders").where("uid", "==", uid).limit(100).stream():
            existing = existing_snap.to_dict() or {}
            if existing.get("method") == "mtn_momo" and existing.get("status") in {"initiating", "pending"}:
                raise ApiError(
                    409,
                    "MTN_PAYMENT_ALREADY_PENDING",
                    "This account already has an MTN payment request awaiting a final status. Check that request before starting another.",
                    {"orderId": existing_snap.id},
                )
    order_ref = db.collection("premiumOrders").document(order_id)
    order = {
        "orderId": order_id,
        "uid": uid,
        "email": str(claims.get("email") or profile.get("email") or "")[:254],
        "displayName": str(profile.get("displayName") or profile.get("username") or claims.get("name") or claims.get("email") or "Code Academy user")[:100],
        "planId": plan_id,
        "planTitle": plan["title"],
        "planDays": plan["days"],
        "amountUsd": float(plan["usd"]),
        "amountGhs": float(plan["ghs"]),
        "currency": "GHS",
        "method": method,
        "payerPhone": payer_phone,
        "status": "initiating" if method == "mtn_momo" else "awaiting_transfer",
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }
    order_ref.set(order)
    if method == "mtn_momo":
        try:
            ref_id = _mtn_start_payment(order_id, payer_phone, _money(plan["ghs"]), plan["title"])
        except ApiError as exc:
            order_ref.update({"status": "failed", "errorCode": exc.code, "errorMessage": exc.message, "updatedAt": datetime.now(timezone.utc)})
            raise
        order_ref.update({"status": "pending", "mtnReference": ref_id, "providerStatus": "PENDING", "updatedAt": datetime.now(timezone.utc)})
    created = order_ref.get().to_dict() or order
    return jsonify({
        "order": _safe_order(order_id, created),
        "message": "Payment request sent to MTN. Approve it only in your own MoMo app or official MTN prompt. This page will verify the provider status.",
    } if method == "mtn_momo" else {
        "order": _safe_order(order_id, created),
        "paymentInstructions": {
            "recipientPhone": RECIPIENT_PHONE,
            "recipientName": RECIPIENT_NAME,
            "amountGhs": float(plan["ghs"]),
            "reference": order_id,
            "message": "Make the transfer in your mobile money app/official channel. The recipient name shown by the wallet is controlled by the provider/account registration, not by this webpage. Premium remains pending until the actual transaction is checked.",
        },
    }), 201


@APP.post("/api/orders/<order_id>/proof")
@limiter.limit("10 per hour")
@login_required
def submit_manual_proof(order_id: str):
    payload = request.get_json(silent=True) or {}
    transaction_id = str(payload.get("transactionId", "")).strip()
    if not re.fullmatch(r"[A-Za-z0-9._/-]{4,100}", transaction_id):
        raise ApiError(400, "INVALID_TRANSACTION_REFERENCE", "Enter the transaction ID/reference from the wallet's genuine transaction receipt or SMS. Do not enter a PIN or OTP.")
    db = _db()
    ref = db.collection("premiumOrders").document(order_id)
    snap = ref.get()
    if not snap.exists:
        raise ApiError(404, "ORDER_NOT_FOUND", "That payment order was not found.")
    order = snap.to_dict() or {}
    if order.get("uid") != str(g.current_user["uid"]):
        raise ApiError(403, "ORDER_ACCESS_DENIED", "This order belongs to a different Code Academy account.")
    if order.get("method") != "manual_momo":
        raise ApiError(400, "NOT_A_MANUAL_MOMO_ORDER", "This order does not accept a manual transaction reference.")
    if order.get("status") != "awaiting_transfer":
        raise ApiError(409, "ORDER_NOT_AWAITING_PROOF", "This order is no longer awaiting a manual transaction reference.")
    payer_phone = _normalize_ghana_phone(payload.get("payerPhone") or order.get("payerPhone"))
    ref.update({
        "status": "review_required",
        "manualTransactionId": transaction_id,
        "payerPhone": payer_phone,
        "proofSubmittedAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    })
    updated = ref.get().to_dict() or order
    _send_owner_whatsapp("MANUAL PAYMENT REVIEW NEEDED", order_id, updated)
    return jsonify({
        "order": _safe_order(order_id, updated),
        "message": "Your reference was submitted for verification. Premium is not active yet; the recipient must confirm the payment in the wallet account.",
    }), 200


@APP.get("/api/orders/<order_id>")
@limiter.limit("90 per hour")
@login_required
def get_order(order_id: str):
    db = _db()
    ref = db.collection("premiumOrders").document(order_id)
    snap = ref.get()
    if not snap.exists:
        raise ApiError(404, "ORDER_NOT_FOUND", "That payment order was not found.")
    data = snap.to_dict() or {}
    if data.get("uid") != str(g.current_user["uid"]):
        raise ApiError(403, "ORDER_ACCESS_DENIED", "This order belongs to a different Code Academy account.")
    if data.get("method") == "mtn_momo" and data.get("status") == "pending":
        data = _sync_mtn_order(order_id, ref, data)
    safe = _safe_order(order_id, data)
    if data.get("status") == "failed":
        safe["errorCode"] = data.get("errorCode", "PAYMENT_FAILED")
        safe["errorMessage"] = data.get("errorMessage", "The payment was not completed.")
    if data.get("status") == "review_required" and data.get("errorMessage"):
        safe["errorCode"] = data.get("errorCode", "REVIEW_REQUIRED")
        safe["errorMessage"] = data.get("errorMessage")
    return jsonify({"order": safe})


@APP.get("/api/admin/orders")
@admin_required
def admin_list_orders():
    db = _db()
    docs = db.collection("premiumOrders").where("status", "==", "review_required").limit(100).stream()
    results = []
    for doc in docs:
        item = doc.to_dict() or {}
        plan = PLANS.get(item.get("planId", ""), {})
        results.append({
            "id": doc.id,
            "uid": item.get("uid", ""),
            "displayName": item.get("displayName", ""),
            "email": item.get("email", ""),
            "planId": item.get("planId", ""),
            "planTitle": plan.get("title", item.get("planTitle", "Premium")),
            "amountGhs": float(item.get("amountGhs", 0)),
            "payerPhone": item.get("payerPhone", ""),
            "manualTransactionId": item.get("manualTransactionId", ""),
            "createdAt": _iso_date(item.get("createdAt")),
            "proofSubmittedAt": _iso_date(item.get("proofSubmittedAt")),
        })
    results.sort(key=lambda item: item.get("proofSubmittedAt") or "", reverse=True)
    return jsonify({"orders": results})


@APP.post("/api/admin/orders/<order_id>/approve")
@admin_required
def admin_approve_order(order_id: str):
    db = _db()
    ref = db.collection("premiumOrders").document(order_id)
    snap = ref.get()
    if not snap.exists:
        raise ApiError(404, "ORDER_NOT_FOUND", "That payment order was not found.")
    order = snap.to_dict() or {}
    if order.get("method") != "manual_momo" or order.get("status") != "review_required":
        raise ApiError(409, "ORDER_NOT_READY_FOR_REVIEW", "Only a manual MoMo order awaiting review can be approved here.")
    tx_ref = str(order.get("manualTransactionId") or "").strip()
    if not tx_ref:
        raise ApiError(409, "TRANSACTION_REFERENCE_MISSING", "The order has no transaction reference to verify.")
    # This is an administrator confirmation, not an automatic wallet lookup.
    _activate_subscription(order_id, ref, order, tx_ref, "manual_momo", str(g.current_user.get("uid", "")))
    updated = ref.get().to_dict() or order
    return jsonify({"order": _safe_order(order_id, updated), "message": "Payment marked paid and premium access activated."})


@APP.post("/api/admin/orders/<order_id>/reject")
@admin_required
def admin_reject_order(order_id: str):
    db = _db()
    ref = db.collection("premiumOrders").document(order_id)
    snap = ref.get()
    if not snap.exists:
        raise ApiError(404, "ORDER_NOT_FOUND", "That payment order was not found.")
    order = snap.to_dict() or {}
    if order.get("status") != "review_required" or order.get("method") != "manual_momo":
        raise ApiError(409, "ORDER_NOT_READY_FOR_REVIEW", "Only a manual MoMo order awaiting review can be rejected here.")
    ref.update({
        "status": "rejected",
        "reviewedBy": str(g.current_user.get("uid", "")),
        "reviewedAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
        "errorCode": "MANUAL_PAYMENT_NOT_VERIFIED",
        "errorMessage": "The transaction could not be verified by the recipient.",
    })
    updated = ref.get().to_dict() or order
    _send_owner_whatsapp("MANUAL PAYMENT REJECTED", order_id, updated)
    return jsonify({"order": _safe_order(order_id, updated), "message": "The manual payment submission was rejected. No premium access was granted."})


if __name__ == "__main__":
    # Local development only. Use a production WSGI server and HTTPS for live payments.
    APP.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")), debug=False)

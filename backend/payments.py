"""
DodoPayments integration — checkout sessions and webhook handling.

Webhook signatures follow the Svix standard (used by DodoPayments):
  signed_content = "{webhook-id}.{webhook-timestamp}.{raw_body}"
  signature      = base64( HMAC-SHA256(base64decode(secret_after_whsec_), signed_content) )
  header         = "webhook-signature: v1,<signature> [v1,<signature2> ...]"
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/payments", tags=["payments"])

DODO_API_KEY        = os.getenv("DODO_API_KEY", "")
DODO_WEBHOOK_SECRET = os.getenv("DODO_WEBHOOK_SECRET", "")
DODO_BASE_URL       = "https://live.dodopayments.com"

PLAN_PRODUCT_IDS: dict[str, str] = {
    "pro": os.getenv("DODO_PRODUCT_ID_PRO", ""),
}


class CheckoutRequest(BaseModel):
    plan:         str
    firebase_uid: str
    user_email:   str
    success_url:  str
    cancel_url:   str


@router.post("/checkout")
async def create_checkout(req: CheckoutRequest):
    if not DODO_API_KEY:
        raise HTTPException(503, "Payment provider not configured — set DODO_API_KEY in .env")

    product_id = PLAN_PRODUCT_IDS.get(req.plan, "")
    if not product_id:
        raise HTTPException(400, f"Unknown plan '{req.plan}' or DODO_PRODUCT_ID_{req.plan.upper()} not set")

    payload = {
        "billing": {
            "city": "",
            "country": "US",
            "state": "",
            "street": "",
            "zipcode": "",
        },
        "customer": {
            "email":    req.user_email,
            "name":     req.user_email.split("@")[0],
            "create_new_customer": False,
        },
        "product_id":   product_id,
        "quantity":     1,
        "payment_link": True,
        "metadata": {
            "firebase_uid": req.firebase_uid,
            "plan":         req.plan,
        },
        "return_url": req.success_url,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{DODO_BASE_URL}/subscriptions",
            headers={
                "Authorization": f"Bearer {DODO_API_KEY}",
                "Content-Type":  "application/json",
            },
            json=payload,
        )

    if resp.status_code not in (200, 201):
        detail = resp.text[:300]
        raise HTTPException(502, f"DodoPayments error ({resp.status_code}): {detail}")

    data = resp.json()
    checkout_url = (
        data.get("payment_link")
        or data.get("checkout_url")
        or data.get("url")
    )
    if not checkout_url:
        raise HTTPException(502, "DodoPayments returned no checkout URL")

    return {"checkout_url": checkout_url}


def _verify_svix_signature(body: bytes, headers: dict[str, str], secret: str) -> bool:
    """
    Verify a Svix-signed webhook (DodoPayments delivery format).
    Returns True if any signature in the header matches.
    """
    msg_id    = headers.get("webhook-id", "")
    timestamp = headers.get("webhook-timestamp", "")
    sig_hdr   = headers.get("webhook-signature", "")

    if not msg_id or not timestamp or not sig_hdr:
        return False

    # Reject timestamps more than 5 minutes old to prevent replay attacks
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except ValueError:
        return False

    # Decode the secret — Svix secrets are "whsec_<base64>" or raw base64
    raw_secret = secret[6:] if secret.startswith("whsec_") else secret
    try:
        secret_bytes = base64.b64decode(raw_secret)
    except Exception:
        secret_bytes = secret.encode()

    signed = f"{msg_id}.{timestamp}.".encode() + body
    expected_b64 = base64.b64encode(
        hmac.new(secret_bytes, signed, hashlib.sha256).digest()
    ).decode()

    # Header may contain multiple space-separated "v1,<sig>" entries
    for entry in sig_hdr.split(" "):
        parts = entry.split(",", 1)
        if len(parts) == 2 and parts[0] == "v1":
            if hmac.compare_digest(parts[1], expected_b64):
                return True
    return False


@router.post("/webhook")
async def payment_webhook(request: Request):
    body = await request.body()

    if not DODO_WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook secret not configured — set DODO_WEBHOOK_SECRET in .env")

    headers = {k.lower(): v for k, v in request.headers.items()}
    if not _verify_svix_signature(body, headers, DODO_WEBHOOK_SECRET):
        raise HTTPException(401, "Invalid webhook signature")

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")

    event_type   = event.get("type", "")
    data         = event.get("data", {})
    metadata     = data.get("metadata", {})
    firebase_uid = metadata.get("firebase_uid")
    plan         = metadata.get("plan", "pro")

    if event_type in ("subscription.active", "payment.succeeded") and firebase_uid:
        _handle_subscription_activated(firebase_uid, plan)
    elif event_type in ("subscription.cancelled", "subscription.expired") and firebase_uid:
        _handle_subscription_cancelled(firebase_uid)

    return {"received": True}


def _handle_subscription_activated(firebase_uid: str, plan: str) -> None:
    """Upgrade user's plan in Firestore via Firebase Admin SDK."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as admin_firestore

        if not firebase_admin._apps:
            cred_path = os.getenv("FIREBASE_ADMIN_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            else:
                return  # Admin SDK not configured — skip server-side update

        db  = admin_firestore.client()
        ref = db.collection("users").document(firebase_uid)
        ref.set({"plan": plan, "jobsThisMonth": 0}, merge=True)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Firebase Admin update failed: %s", exc)


def _handle_subscription_cancelled(firebase_uid: str) -> None:
    """Downgrade user back to free plan."""
    try:
        import firebase_admin
        from firebase_admin import firestore as admin_firestore
        if not firebase_admin._apps:
            return
        db  = admin_firestore.client()
        ref = db.collection("users").document(firebase_uid)
        ref.set({"plan": "free"}, merge=True)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Firebase Admin downgrade failed: %s", exc)

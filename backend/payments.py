"""
DodoPayments integration — checkout sessions and webhook handling.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/payments", tags=["payments"])

DODO_API_KEY       = os.getenv("DODO_API_KEY", "")
DODO_WEBHOOK_SECRET = os.getenv("DODO_WEBHOOK_SECRET", "")
DODO_BASE_URL      = "https://live.dodopayments.com"

# Map plan IDs to DodoPayments product/price IDs (configure in dashboard)
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


@router.post("/webhook")
async def payment_webhook(request: Request):
    body = await request.body()

    # DODO_WEBHOOK_SECRET is mandatory — reject all webhooks if not configured.
    # Allowing unverified webhooks would let anyone forge subscription upgrades.
    if not DODO_WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook secret not configured — set DODO_WEBHOOK_SECRET in .env")

    signature = request.headers.get("webhook-signature") or request.headers.get("x-dodo-signature", "")
    expected  = hmac.new(
        DODO_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(401, "Invalid webhook signature")

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")

    event_type = event.get("type", "")
    data       = event.get("data", {})
    metadata   = data.get("metadata", {})
    firebase_uid = metadata.get("firebase_uid")
    plan         = metadata.get("plan", "pro")

    if event_type in ("subscription.active", "payment.succeeded") and firebase_uid:
        # Update Firebase via Admin SDK if configured, otherwise log the event.
        # The frontend polls Firestore for plan changes after redirect.
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

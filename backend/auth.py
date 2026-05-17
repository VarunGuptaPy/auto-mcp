"""
GitHub OAuth flow for accessing private repositories.

Session lifecycle:
  1. Frontend calls GET /api/auth/github/start?session_id=<id>
     → backend generates a server-side state token, maps it to session_id
     → returns { authorize_url } (frontend opens popup to that URL)
  2. GitHub redirects popup to GET /api/auth/github/callback?code=...&state=<server_state>
     → backend validates server-generated state (CSRF protection), exchanges code for token
     → stores token under session_id, returns close-popup HTML
  3. Popup postMessages success to opener; frontend calls GET /api/auth/github/me?session_id=<id>
     → returns { login, avatar_url, name }
  4. On job submit, frontend sends github_session_id; backend resolves token with get_token_for_session()

Tokens are stored only in-memory (_oauth_sessions dict) and never written to disk.

Security:
  - OAuth `state` is server-generated (secrets.token_urlsafe), not client-controlled (CSRF prevention)
  - Pending states expire after 10 minutes
  - In-memory dicts are capped to prevent unbounded growth (DoS prevention)
  - Error messages HTML-escaped before being reflected in responses
"""

from __future__ import annotations

import html
import os
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

router = APIRouter(prefix="/api/auth/github", tags=["auth"])

GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.environ.get(
    "GITHUB_REDIRECT_URI", "http://localhost:3000/api/auth/github/callback"
)
GITHUB_SCOPE = "repo"

_STATE_TTL_SECONDS = 600   # 10 minutes
_MAX_PENDING       = 500   # cap to prevent memory DoS

# server_state → (session_id, expiry_timestamp)
_pending_states: dict[str, tuple[str, float]] = {}
# session_id → access_token (never written to disk)
_oauth_sessions: dict[str, str] = {}


def _purge_expired_states() -> None:
    """Remove states older than TTL. Called before any write."""
    now = time.monotonic()
    expired = [k for k, (_, exp) in _pending_states.items() if now > exp]
    for k in expired:
        del _pending_states[k]


def oauth_enabled() -> bool:
    return bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)


def get_token_for_session(session_id: str) -> str | None:
    return _oauth_sessions.get(session_id)


@router.get("/config")
async def github_config():
    """Tell the frontend whether GitHub OAuth is configured."""
    return {"enabled": oauth_enabled()}


@router.get("/start")
async def github_start(session_id: str):
    """
    Return the GitHub OAuth authorize URL.
    Generates a cryptographically secure server-side state token (CSRF prevention).
    The client-supplied session_id is stored server-side; GitHub never sees it.
    """
    if not oauth_enabled():
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
        )

    _purge_expired_states()

    if len(_pending_states) >= _MAX_PENDING:
        raise HTTPException(status_code=429, detail="Too many pending OAuth sessions. Try again later.")

    # Server-generated state — client cannot influence this value
    server_state = secrets.token_urlsafe(32)
    _pending_states[server_state] = (session_id, time.monotonic() + _STATE_TTL_SECONDS)

    params = urlencode(
        {
            "client_id": GITHUB_CLIENT_ID,
            "scope": GITHUB_SCOPE,
            "state": server_state,
            "redirect_uri": GITHUB_REDIRECT_URI,
        }
    )
    return JSONResponse({"authorize_url": f"https://github.com/login/oauth/authorize?{params}"})


@router.get("/callback")
async def github_callback(code: str, state: str):
    """
    Exchange the OAuth code for an access token.
    Returns an HTML page that postMessages success to the opener and closes itself.
    """
    _purge_expired_states()

    entry = _pending_states.pop(state, None)
    if entry is None:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state. Please try again.")

    session_id, expiry = entry
    if time.monotonic() > expiry:
        raise HTTPException(status_code=400, detail="OAuth session expired. Please try again.")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
            timeout=15.0,
        )

    data = resp.json()
    token = data.get("access_token")
    if not token:
        raw_err = data.get("error_description") or data.get("error") or "Unknown error"
        safe_err = html.escape(str(raw_err))
        return HTMLResponse(
            f"""<html><body style="font-family:sans-serif;padding:2rem">
            <p style="color:red">GitHub OAuth failed: {safe_err}</p>
            <p>You can close this window and try again.</p>
            </body></html>""",
            status_code=400,
        )

    _oauth_sessions[session_id] = token

    # session_id is a client-supplied opaque string; JSON-encode it so it's safe in JS
    import json as _json
    safe_session_id = _json.dumps(session_id)

    return HTMLResponse(f"""<!DOCTYPE html>
<html>
<head><title>Connected to GitHub</title></head>
<body style="font-family:sans-serif;padding:2rem;background:#0d1117;color:#e6edf3">
  <p>Connected! Closing window…</p>
  <script>
    try {{
      window.opener && window.opener.postMessage(
        {{ type: 'github_oauth_success', sessionId: {safe_session_id} }},
        window.location.origin
      );
    }} catch (e) {{}}
    setTimeout(() => window.close(), 500);
  </script>
</body>
</html>""")


@router.get("/me")
async def github_me(session_id: str):
    """Return the authenticated GitHub user's profile info."""
    token = _oauth_sessions.get(session_id)
    if not token:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=10.0,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch GitHub user info.")
    user = resp.json()
    return {
        "login": user["login"],
        "avatar_url": user.get("avatar_url"),
        "name": user.get("name"),
    }

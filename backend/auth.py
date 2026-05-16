"""
GitHub OAuth flow for accessing private repositories.

Session lifecycle:
  1. Frontend calls GET /api/auth/github/start?session_id=<id>
     → returns { authorize_url } (frontend opens popup to that URL)
  2. GitHub redirects popup to GET /api/auth/github/callback?code=...&state=<session_id>
     → backend exchanges code for token, stores in memory, returns close-popup HTML
  3. Popup postMessages success to opener; frontend calls GET /api/auth/github/me?session_id=<id>
     → returns { login, avatar_url, name }
  4. On job submit, frontend sends github_session_id; backend resolves token with get_token_for_session()

Tokens are stored only in-memory (_oauth_sessions dict) and never written to disk.
"""

from __future__ import annotations

import os
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

# In-memory stores — never persisted to disk
_pending_sessions: set[str] = set()  # session_ids awaiting OAuth callback
_oauth_sessions: dict[str, str] = {}  # session_id → access_token


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
    The frontend opens a popup to this URL; session_id is threaded through
    as the OAuth `state` parameter so we can correlate the callback.
    """
    if not oauth_enabled():
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
        )
    _pending_sessions.add(session_id)
    params = urlencode(
        {
            "client_id": GITHUB_CLIENT_ID,
            "scope": GITHUB_SCOPE,
            "state": session_id,
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
    if state not in _pending_sessions:
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Please try again.")
    _pending_sessions.discard(state)

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
        err = data.get("error_description") or data.get("error") or "Unknown error"
        return HTMLResponse(
            f"""<html><body style="font-family:sans-serif;padding:2rem">
            <p style="color:red">GitHub OAuth failed: {err}</p>
            <p>You can close this window and try again.</p>
            </body></html>""",
            status_code=400,
        )

    _oauth_sessions[state] = token

    return HTMLResponse(f"""<!DOCTYPE html>
<html>
<head><title>Connected to GitHub</title></head>
<body style="font-family:sans-serif;padding:2rem;background:#0d1117;color:#e6edf3">
  <p>Connected! Closing window…</p>
  <script>
    try {{
      window.opener && window.opener.postMessage(
        {{ type: 'github_oauth_success', sessionId: {state!r} }},
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

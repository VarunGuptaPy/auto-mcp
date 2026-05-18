"""
FastAPI application — all HTTP routes.

Security hardening:
  - CORS restricted to FRONTEND_ORIGIN env var (not wildcard)
  - Security headers on every response (CSP, HSTS, nosniff, frame-deny)
  - Job IDs validated as UUIDs before touching the filesystem
  - File uploads: extension whitelist, UUID filename, 10 MB cap
  - Rate-limited endpoints across the board, not just job creation
  - Content-Disposition filename sanitized to alphanumeric + underscore only
  - URL validated for length and SSRF before reaching the engine
"""

import io
import json
import re
import uuid

from dotenv import load_dotenv
load_dotenv()

import os
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.auth import get_token_for_session, router as auth_router
from backend.cleanup import cleanup_loop
from backend.events import make_sse_response, sse_generator
from backend.jobs import RUNS_DIR, JobManager, Status
from backend.payments import router as payments_router
from backend.runner import run_job
from backend.security import validate_url

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

MAX_URL_LENGTH        = 2048
MAX_UPLOAD_BYTES      = 10 * 1024 * 1024          # 10 MB
MAX_SCREENSHOT_STEP   = 10_000
ALLOWED_UPLOAD_EXTS   = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".txt", ".csv", ".json"}
_UUID_RE              = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_SAFE_FILENAME_RE     = re.compile(r"[^a-z0-9_\-]")

# --------------------------------------------------------------------------- #
# Rate limiter
# --------------------------------------------------------------------------- #

limiter = Limiter(key_func=get_remote_address, default_limits=[])

# --------------------------------------------------------------------------- #
# Security headers middleware
# --------------------------------------------------------------------------- #

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"]    = "nosniff"
        response.headers["X-Frame-Options"]           = "DENY"
        response.headers["X-XSS-Protection"]          = "1; mode=block"
        response.headers["Referrer-Policy"]           = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"]        = "geolocation=(), microphone=(), camera=()"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        # CSP: API only serves JSON/binary — no HTML pages need scripts
        response.headers["Content-Security-Policy"]   = "default-src 'none'; frame-ancestors 'none'"
        return response

# --------------------------------------------------------------------------- #
# FastAPI app + lifespan
# --------------------------------------------------------------------------- #

manager = JobManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    manager.set_runner(run_job)
    import asyncio
    asyncio.create_task(manager.start_worker())
    asyncio.create_task(cleanup_loop())
    yield


app = FastAPI(title="auto-mcp", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(auth_router)
app.include_router(payments_router)

# CORS — never wildcard in production
_FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
_ALLOWED_ORIGINS = [o.strip() for o in _FRONTEND_ORIGIN.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    allow_credentials=False,
)

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _require_valid_job_id(job_id: str) -> None:
    """Reject non-UUID job_ids before they touch the filesystem."""
    if not _UUID_RE.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format.")

def _safe_product_name(raw: str) -> str:
    """Sanitize to alphanumeric + underscore, max 40 chars."""
    return _SAFE_FILENAME_RE.sub("_", raw.lower())[:40] or "mcp_server"

# --------------------------------------------------------------------------- #
# Request / response models
# --------------------------------------------------------------------------- #

class CreateJobRequest(BaseModel):
    url: str
    max_steps: Optional[int] = 50
    github_repo: Optional[str] = None          # backwards-compat: single repo
    github_repos: Optional[list[str]] = None   # preferred: multiple repos
    github_token: Optional[str] = None
    github_session_id: Optional[str] = None


class ProvideCredsRequest(BaseModel):
    fields: dict


class ChatAnswerRequest(BaseModel):
    question_id: str
    answer: Any


class UserMessageRequest(BaseModel):
    text: str


class PatchRequest(BaseModel):
    description: str


class CreateJobResponse(BaseModel):
    job_id: str


# --------------------------------------------------------------------------- #
# API routes
# --------------------------------------------------------------------------- #

@app.post("/api/jobs", response_model=CreateJobResponse)
@limiter.limit("1/5minutes")
async def create_job(request: Request, body: CreateJobRequest):
    """Submit a URL for exploration. Rate-limited, SSRF-validated."""
    # 1 — URL length guard (before the more expensive DNS check)
    if len(body.url) > MAX_URL_LENGTH:
        raise HTTPException(status_code=400, detail=f"URL must be under {MAX_URL_LENGTH} characters.")

    try:
        validate_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    max_steps = None if not body.max_steps else max(1, min(body.max_steps, 500))

    # Resolve GitHub token: prefer OAuth session over raw PAT
    github_token: str | None = body.github_token or None
    if body.github_session_id:
        oauth_token = get_token_for_session(body.github_session_id)
        if oauth_token:
            github_token = oauth_token

    # Merge single + list fields into one canonical list
    all_repos: list[str] | None = body.github_repos or (
        [body.github_repo] if body.github_repo else None
    )
    job_id = manager.create(
        url=body.url,
        max_steps=max_steps,
        github_repos=all_repos,
        github_token=github_token,
    )
    return CreateJobResponse(job_id=job_id)


@app.post("/api/jobs/{job_id}/credentials")
@limiter.limit("20/minute")
async def provide_credentials(request: Request, job_id: str, body: ProvideCredsRequest):
    """Backwards-compat: submit login credentials."""
    _require_valid_job_id(job_id)
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    ok = manager.provide_auth(job_id, body.fields)
    if not ok:
        raise HTTPException(status_code=409, detail="No auth request pending for this job.")
    return {"ok": True}


@app.post("/api/jobs/{job_id}/upload")
@limiter.limit("10/minute")
async def upload_file_for_job(request: Request, job_id: str, file: UploadFile = File(...)):
    """Accept a user-supplied file and save it under the job directory."""
    _require_valid_job_id(job_id)
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Extension whitelist
    original = Path(file.filename or "upload")
    ext = original.suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' is not allowed. Permitted: {', '.join(sorted(ALLOWED_UPLOAD_EXTS))}",
        )

    # Read with size cap
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024*1024)} MB limit.")

    # Use UUID-based filename — never trust user-supplied name
    safe_name = f"{uuid.uuid4().hex}{ext}"
    upload_dir = RUNS_DIR / job_id / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / safe_name
    dest.write_bytes(data)

    # Return a relative path, not the full filesystem path
    return {"path": f"uploads/{safe_name}"}


@app.post("/api/jobs/{job_id}/message")
@limiter.limit("30/minute")
async def send_user_message(request: Request, job_id: str, body: UserMessageRequest):
    """Send a free-form instruction to the agent mid-run."""
    _require_valid_job_id(job_id)
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Cap message length to prevent abuse
    if len(body.text) > 4096:
        raise HTTPException(status_code=400, detail="Message too long (max 4096 chars).")

    manager.add_user_message(job_id, body.text)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/chat")
@limiter.limit("30/minute")
async def chat_answer(request: Request, job_id: str, body: ChatAnswerRequest):
    """Submit an answer to an agent question."""
    _require_valid_job_id(job_id)
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    ok = manager.provide_answer(job_id, body.question_id, body.answer)
    if not ok:
        raise HTTPException(status_code=409, detail="No question pending with that ID.")
    return {"ok": True}


@app.get("/api/jobs/{job_id}")
@limiter.limit("60/minute")
async def get_job(request: Request, job_id: str):
    """Return current job status and progress counters."""
    _require_valid_job_id(job_id)
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JSONResponse(job)


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str, request: Request):
    """SSE stream of live job progress."""
    _require_valid_job_id(job_id)
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    generator = sse_generator(job_id, manager, request)
    return make_sse_response(generator)


@app.get("/api/jobs/{job_id}/screenshot/{step}")
@limiter.limit("120/minute")
async def get_screenshot(request: Request, job_id: str, step: int):
    """Serve a screenshot PNG for a given step number."""
    _require_valid_job_id(job_id)
    if not (0 <= step <= MAX_SCREENSHOT_STEP):
        raise HTTPException(status_code=400, detail="Step number out of range.")
    path = RUNS_DIR / job_id / "trace" / "screenshots" / f"step_{step:03d}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Screenshot not found.")
    return FileResponse(path, media_type="image/png")


@app.get("/api/jobs/{job_id}/spec")
@limiter.limit("30/minute")
async def get_spec(request: Request, job_id: str):
    """Return the feature_spec.json produced by the analyzer."""
    _require_valid_job_id(job_id)
    spec_path = RUNS_DIR / job_id / "feature_spec.json"
    if not spec_path.exists():
        raise HTTPException(status_code=404, detail="Spec not ready yet.")
    return JSONResponse(json.loads(spec_path.read_text()))


@app.get("/api/jobs/{job_id}/download")
@limiter.limit("10/minute")
async def download_mcp(request: Request, job_id: str):
    """Return a .zip of the generated MCP server directory."""
    _require_valid_job_id(job_id)
    server_dir = RUNS_DIR / job_id / "mcp_server"
    if not server_dir.exists():
        raise HTTPException(status_code=404, detail="MCP server not generated yet.")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fpath in sorted(server_dir.rglob("*")):
            if fpath.is_file():
                # Prevent zip-slip: ensure path stays inside server_dir
                rel = fpath.relative_to(server_dir)
                if ".." in rel.parts:
                    continue
                zf.write(fpath, rel)
    buf.seek(0)

    product = "mcp_server"
    spec_path = RUNS_DIR / job_id / "feature_spec.json"
    if spec_path.exists():
        try:
            raw_name = json.loads(spec_path.read_text()).get("product_name", "mcp_server")
            product = _safe_product_name(raw_name)
        except Exception:
            pass

    safe_filename = f"{product}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=\"{safe_filename}\""},
    )


# --------------------------------------------------------------------------- #
# MCP patch — add a missing tool after generation is done
# --------------------------------------------------------------------------- #

@app.post("/api/jobs/{job_id}/patch")
@limiter.limit("10/minute")
async def patch_mcp(request: Request, job_id: str, body: PatchRequest):
    """Generate and add one new tool to an already-generated MCP server."""
    _require_valid_job_id(job_id)

    if not body.description.strip():
        raise HTTPException(status_code=400, detail="Description cannot be empty.")
    if len(body.description) > 2000:
        raise HTTPException(status_code=400, detail="Description too long (max 2000 chars).")

    spec_path = RUNS_DIR / job_id / "feature_spec.json"
    if not spec_path.exists():
        raise HTTPException(status_code=404, detail="No feature spec found for this job.")

    spec = json.loads(spec_path.read_text())

    import asyncio as _asyncio
    loop = _asyncio.get_running_loop()

    try:
        from generator.patch import patch_spec
        from generator.generate import generate

        updated_spec, new_feature = await loop.run_in_executor(
            None, lambda: patch_spec(spec, body.description.strip())
        )

        spec_path.write_text(json.dumps(updated_spec, indent=2))

        server_dir = RUNS_DIR / job_id / "mcp_server"
        user_env: dict | None = None
        env_file = RUNS_DIR / job_id / "user_env.json"
        if env_file.exists():
            try:
                user_env = json.loads(env_file.read_text())
            except Exception:
                pass

        await loop.run_in_executor(None, generate, updated_spec, server_dir, user_env)

        return {"feature": new_feature, "total_features": len(updated_spec["features"])}

    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Patch failed: {exc}")


# --------------------------------------------------------------------------- #
# Health check
# --------------------------------------------------------------------------- #

@app.get("/api/health")
async def health():
    return {"status": "ok", "active_jobs": manager.active_count(), "queued": manager.queue_size()}

"""
FastAPI application — all HTTP routes.

Startup:
  - Creates the RUNS_DIR if absent.
  - Starts the job-queue worker as a background task.
  - Starts the cleanup background task.

The API never echoes credentials, never leaks the Anthropic key, and all
user-submitted URLs are passed through security.validate_url() before
anything reaches the engine.
"""

import io
import json

# Load .env automatically so `uvicorn backend.main:app` works without
# manually exporting env vars. Docker Compose passes them directly, so
# this is a no-op in production.
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
# Rate limiter
# --------------------------------------------------------------------------- #

limiter = Limiter(key_func=get_remote_address, default_limits=[])


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
app.include_router(auth_router)
app.include_router(payments_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Request / response models
# --------------------------------------------------------------------------- #

class CreateJobRequest(BaseModel):
    url: str
    max_steps: Optional[int] = 50
    github_repo: Optional[str] = None         # e.g. "owner/repo" or full URL
    github_token: Optional[str] = None        # PAT — used in-memory only, never persisted
    github_session_id: Optional[str] = None   # OAuth session — token resolved server-side


class ProvideCredsRequest(BaseModel):
    fields: dict


class ChatAnswerRequest(BaseModel):
    question_id: str
    answer: Any  # str for text/choice, dict for credentials

class UserMessageRequest(BaseModel):
    text: str


class CreateJobResponse(BaseModel):
    job_id: str


# --------------------------------------------------------------------------- #
# API routes
# --------------------------------------------------------------------------- #

@app.post("/api/jobs", response_model=CreateJobResponse)
@limiter.limit("1/5minutes")
async def create_job(request: Request, body: CreateJobRequest):
    """
    Submit a URL for exploration.

    Rate-limited to 1 request per IP per 5 minutes to protect browser resources.
    Validates the URL for SSRF before touching the engine.
    """
    try:
        validate_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    max_steps = None if not body.max_steps else max(1, body.max_steps)

    # Resolve GitHub token: prefer OAuth session over raw PAT
    github_token: str | None = body.github_token or None
    if body.github_session_id:
        oauth_token = get_token_for_session(body.github_session_id)
        if oauth_token:
            github_token = oauth_token

    job_id = manager.create(
        url=body.url,
        max_steps=max_steps,
        github_repo=body.github_repo or None,
        github_token=github_token,
    )
    return CreateJobResponse(job_id=job_id)


@app.post("/api/jobs/{job_id}/credentials")
async def provide_credentials(job_id: str, body: ProvideCredsRequest):
    """Backwards-compat: submit login credentials. Prefer /chat."""
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    ok = manager.provide_auth(job_id, body.fields)
    if not ok:
        raise HTTPException(status_code=409, detail="No auth request pending for this job.")
    return {"ok": True}


@app.post("/api/jobs/{job_id}/upload")
async def upload_file_for_job(job_id: str, file: UploadFile = File(...)):
    """Accept a user-supplied file (image, PDF, etc.) and save it under the job directory."""
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    upload_dir = RUNS_DIR / job_id / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "upload").name
    dest = upload_dir / safe_name
    dest.write_bytes(await file.read())
    return {"path": str(dest.resolve())}


@app.post("/api/jobs/{job_id}/message")
async def send_user_message(job_id: str, body: UserMessageRequest):
    """Send a free-form instruction to the agent mid-run."""
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    manager.add_user_message(job_id, body.text)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/chat")
async def chat_answer(job_id: str, body: ChatAnswerRequest):
    """Submit an answer to an agent question (auth, text, or choice)."""
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    ok = manager.provide_answer(job_id, body.question_id, body.answer)
    if not ok:
        raise HTTPException(status_code=409, detail="No question pending with that ID.")
    return {"ok": True}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    """Return current job status and progress counters."""
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JSONResponse(job)


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str, request: Request):
    """
    Server-Sent Events stream of live job progress.
    Reconnecting clients receive a replay of past events automatically.
    """
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    generator = sse_generator(job_id, manager, request)
    return make_sse_response(generator)


@app.get("/api/jobs/{job_id}/screenshot/{step}")
async def get_screenshot(job_id: str, step: int):
    """Serve a screenshot PNG for a given step number."""
    path = RUNS_DIR / job_id / "trace" / "screenshots" / f"step_{step:03d}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Screenshot not found.")
    return FileResponse(path, media_type="image/png")


@app.get("/api/jobs/{job_id}/spec")
async def get_spec(job_id: str):
    """Return the feature_spec.json produced by the analyzer."""
    spec_path = RUNS_DIR / job_id / "feature_spec.json"
    if not spec_path.exists():
        raise HTTPException(status_code=404, detail="Spec not ready yet.")
    return JSONResponse(json.loads(spec_path.read_text()))


@app.get("/api/jobs/{job_id}/download")
async def download_mcp(job_id: str):
    """Return a .zip of the generated MCP server directory."""
    server_dir = RUNS_DIR / job_id / "mcp_server"
    if not server_dir.exists():
        raise HTTPException(status_code=404, detail="MCP server not generated yet.")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fpath in sorted(server_dir.rglob("*")):
            if fpath.is_file():
                zf.write(fpath, fpath.relative_to(server_dir))
    buf.seek(0)

    job = manager.get(job_id)
    product = "mcp_server"
    if job:
        spec_path = RUNS_DIR / job_id / "feature_spec.json"
        if spec_path.exists():
            try:
                spec = json.loads(spec_path.read_text())
                raw_name = spec.get("product_name", "mcp_server")
                product = raw_name.lower().replace(" ", "_")[:40]
            except Exception:
                pass

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{product}.zip"'},
    )


# --------------------------------------------------------------------------- #
# Health check
# --------------------------------------------------------------------------- #

@app.get("/api/health")
async def health():
    return {"status": "ok", "active_jobs": manager.active_count(), "queued": manager.queue_size()}


# --------------------------------------------------------------------------- #
# Frontend is served by Next.js (separate service).
# The API is the only thing FastAPI serves; no SPA catch-all needed.
# --------------------------------------------------------------------------- #

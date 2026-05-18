"""
JobManager — in-process async job queue backed by disk state.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Coroutine

RUNS_DIR = Path(os.environ.get("RUNS_DIR", "runs"))
MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "2"))
JOB_TIMEOUT_SECONDS = None  # no hard cap — runs until agent emits "done" or fails

_log = logging.getLogger("auto-mcp")


class Status:
    QUEUED = "queued"
    CODE_ANALYSIS = "code_analysis"   # new stage when a GitHub repo is provided
    EXPLORING = "exploring"
    ANALYZING = "analyzing"
    GENERATING = "generating"
    DONE = "done"
    FAILED = "failed"

    TERMINAL = {DONE, FAILED}


@dataclass
class JobState:
    id: str
    url: str
    max_steps: int | None = None
    status: str = Status.QUEUED
    current_step: int = 0
    total_steps: int | None = None
    current_action: str | None = None
    features_found: int = 0
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    queue_position: int = 0
    github_repos: list[str] | None = None   # one or more repo URLs (safe to persist)
    has_code_analysis: bool = False         # True once code stage completes

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_public_dict(self) -> dict[str, Any]:
        return self.to_dict()


class JobManager:
    def __init__(
        self,
        max_concurrent: int = MAX_CONCURRENT_JOBS,
        runs_dir: Path | None = None,
    ):
        self._runs_dir = runs_dir or RUNS_DIR
        self._jobs: dict[str, JobState] = {}
        self._creds: dict[str, dict[str, str]] = {}
        # GitHub tokens — kept only in memory, NEVER persisted to disk
        self._github_tokens: dict[str, str] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._subs: dict[str, list[asyncio.Queue]] = {}
        self._replay: dict[str, list[dict]] = {}
        # Unified question/answer system
        self._question_events: dict[str, asyncio.Event] = {}
        self._question_answers: dict[str, Any] = {}
        # Free-form user instructions (not tied to a question)
        self._user_messages: dict[str, list[str]] = {}
        self._runner: Callable[..., Coroutine] | None = None
        self._max_concurrent = max_concurrent

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def set_runner(self, fn: Callable[..., Coroutine]) -> None:
        self._runner = fn

    async def start_worker(self) -> None:
        while True:
            job_id = await self._queue.get()
            asyncio.create_task(self._dispatch(job_id))

    async def _dispatch(self, job_id: str) -> None:
        async with self._semaphore:
            job = self._jobs.get(job_id)
            if job is None or self._runner is None:
                return
            creds = self._creds.pop(job_id, None)
            # Pop the token and discard after passing to runner — never re-stored
            github_token = self._github_tokens.pop(job_id, None)
            try:
                await self._runner(job_id, job.url, job.max_steps, creds, self,
                                   github_token=github_token)
            except asyncio.TimeoutError:
                self.update(job_id, status=Status.FAILED, error="Job timed out.")
                self.emit(job_id, {"type": "error", "message": "Job timed out."})
            except Exception as exc:
                _log.error("Job %s failed: %s", job_id, exc)

    # ------------------------------------------------------------------
    # Unified question / answer (pause agent, wait for user input)
    # ------------------------------------------------------------------

    def request_question(self, job_id: str, question_id: str) -> asyncio.Event:
        event = asyncio.Event()
        self._question_events[question_id] = event
        return event

    def provide_answer(self, job_id: str, question_id: str, answer: Any) -> bool:
        event = self._question_events.pop(question_id, None)
        if event is None:
            return False
        self._question_answers[question_id] = answer
        self.emit(job_id, {"type": "chat_answer_received", "question_id": question_id})
        event.set()
        return True

    def pop_answer(self, question_id: str) -> Any:
        return self._question_answers.pop(question_id, None)

    # ------------------------------------------------------------------
    # Free-form user instructions
    # ------------------------------------------------------------------

    def add_user_message(self, job_id: str, text: str) -> None:
        self._user_messages.setdefault(job_id, []).append(text)
        self.emit(job_id, {"type": "user_message", "text": text})

    def pop_user_messages(self, job_id: str) -> list[str]:
        msgs = self._user_messages.pop(job_id, [])
        return msgs

    # Backwards-compat wrappers (used by old /credentials endpoint + tests)
    def request_auth(self, job_id: str) -> asyncio.Event:
        return self.request_question(job_id, f"auth-{job_id}")

    def provide_auth(self, job_id: str, creds: dict) -> bool:
        question_id = f"auth-{job_id}"
        ok = self.provide_answer(job_id, question_id, creds)
        if ok:
            self.emit(job_id, {"type": "auth_accepted"})
        return ok

    def pop_pending_creds(self, job_id: str) -> dict | None:
        return self.pop_answer(f"auth-{job_id}")

    # ------------------------------------------------------------------
    # Job CRUD
    # ------------------------------------------------------------------

    def create(
        self,
        url: str,
        max_steps: int | None = None,
        email: str | None = None,
        password: str | None = None,
        github_repo: str | None = None,       # backwards-compat single repo
        github_repos: list[str] | None = None,  # preferred: multiple repos
        github_token: str | None = None,  # kept in memory only, NEVER persisted
    ) -> str:
        job_id = str(uuid.uuid4())
        # Merge single + list into one canonical list
        repos: list[str] | None = github_repos or ([github_repo] if github_repo else None)
        state = JobState(
            id=job_id,
            url=url,
            max_steps=max_steps,
            total_steps=max_steps,
            github_repos=repos,
        )
        state.queue_position = self._queue.qsize()
        self._jobs[job_id] = state

        if email and password:
            self._creds[job_id] = {"email": email, "password": password}

        if github_token:
            self._github_tokens[job_id] = github_token   # in-memory only

        job_dir = self._runs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        self._persist(job_id)
        self._queue.put_nowait(job_id)
        return job_id

    def get(self, job_id: str) -> dict | None:
        state = self._jobs.get(job_id)
        if state:
            return state.to_public_dict()
        meta = self._runs_dir / job_id / "meta.json"
        if meta.exists():
            return json.loads(meta.read_text())
        return None

    def update(self, job_id: str, **kwargs: Any) -> None:
        state = self._jobs.get(job_id)
        if state is None:
            return
        for k, v in kwargs.items():
            setattr(state, k, v)
        self._persist(job_id)

    def _persist(self, job_id: str) -> None:
        state = self._jobs.get(job_id)
        if state is None:
            return
        path = self._runs_dir / job_id / "meta.json"
        path.write_text(json.dumps(state.to_public_dict(), indent=2))

    # ------------------------------------------------------------------
    # SSE pub/sub
    # ------------------------------------------------------------------

    def emit(self, job_id: str, event: dict) -> None:
        self._replay.setdefault(job_id, []).append(event)
        for q in self._subs.get(job_id, []):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def subscribe(self, job_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._subs.setdefault(job_id, []).append(q)
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue) -> None:
        subs = self._subs.get(job_id, [])
        try:
            subs.remove(q)
        except ValueError:
            pass

    def replay_log(self, job_id: str) -> list[dict]:
        return list(self._replay.get(job_id, []))

    def queue_size(self) -> int:
        return self._queue.qsize()

    def active_count(self) -> int:
        return self._max_concurrent - self._semaphore._value  # type: ignore[attr-defined]

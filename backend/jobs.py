"""
JobManager — in-process async job queue backed by disk state.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
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
    WAITING_FOR_AGENT = "waiting_for_agent"  # local agent mode: waiting for agent to connect
    EXPLORING = "exploring"
    SITE_MAPPING = "site_mapping"     # building website feature map from trace
    CLASSIFYING = "classifying"       # classifying each feature's implementation type
    QUESTIONING = "questioning"       # asking user questions for feature reconstruction
    RECONSTRUCTING = "reconstructing" # generating code implementations from answers
    ANALYZING = "analyzing"
    GENERATING = "generating"
    DONE = "done"
    FAILED = "failed"
    STOPPED = "stopped"              # cancelled by user

    TERMINAL = {DONE, FAILED, STOPPED}


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
    local_agent: bool = False               # True when browser runs on user's machine
    agent_token: str | None = None          # never persisted publicly

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_public_dict(self) -> dict[str, Any]:
        d = self.to_dict()
        d.pop("agent_token", None)  # never expose the token over the wire
        return d


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
        self._active_count: int = 0
        # Ordered list of job IDs waiting for a slot (front = next to run)
        self._pending_order: list[str] = []
        # Local agent support — all in-memory only
        self._agent_tokens: dict[str, str] = {}           # job_id → token
        self._agent_snapshots: dict[str, asyncio.Queue] = {}   # job_id → snapshot queue
        self._agent_pending_actions: dict[str, asyncio.Queue] = {}  # job_id → action queue
        self._agent_answers: dict[str, Any] = {}          # question_id → answer
        self._agent_answer_events: dict[str, asyncio.Event] = {}   # question_id → event
        self._agent_trace_events: dict[str, asyncio.Event] = {}
        # Cancellation — one event + task reference per active job
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._job_tasks: dict[str, asyncio.Task] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def set_runner(self, fn: Callable[..., Coroutine]) -> None:
        self._runner = fn

    async def start_worker(self) -> None:
        """
        Pull jobs FIFO from the queue. Acquire the semaphore *before* launching
        so we never create more concurrent tasks than MAX_CONCURRENT_JOBS, and
        so queue positions remain accurate while jobs wait.
        """
        while True:
            job_id = await self._queue.get()
            # Block here until a slot is free — keeps the loop from pulling
            # the next job until there's actually room to run it.
            await self._semaphore.acquire()
            # Slot acquired: remove from pending list, broadcast updated positions.
            try:
                self._pending_order.remove(job_id)
            except ValueError:
                pass
            self._active_count += 1
            self._broadcast_queue_positions()
            asyncio.create_task(self._run_job(job_id))

    async def _run_job(self, job_id: str) -> None:
        """Run one job and release the semaphore when done."""
        # Track this task so cancel() can interrupt it
        self._job_tasks[job_id] = asyncio.current_task()
        self._cancel_events[job_id] = asyncio.Event()
        try:
            job = self._jobs.get(job_id)
            if job is None or self._runner is None:
                return
            creds = self._creds.pop(job_id, None)
            # Pop the token and discard after passing to runner — never re-stored
            github_token = self._github_tokens.pop(job_id, None)
            try:
                await self._runner(job_id, job.url, job.max_steps, creds, self,
                                   github_token=github_token)
            except asyncio.CancelledError:
                self.update(job_id, status=Status.STOPPED, error="Stopped by user.", current_action=None)
                self.emit(job_id, {"type": "stopped"})
            except asyncio.TimeoutError:
                self.update(job_id, status=Status.FAILED, error="Job timed out.")
                self.emit(job_id, {"type": "error", "message": "Job timed out."})
            except Exception as exc:
                _log.error("Job %s failed: %s", job_id, exc)
        finally:
            self._job_tasks.pop(job_id, None)
            self._cancel_events.pop(job_id, None)
            self._active_count -= 1
            self._semaphore.release()

    # ------------------------------------------------------------------
    # Cancellation
    # ------------------------------------------------------------------

    def cancel(self, job_id: str) -> bool:
        """
        Request cancellation of a running job.
        Returns True if the job was active and cancellation was requested,
        False if the job is not running (already terminal or queued-only).
        """
        state = self._jobs.get(job_id)
        if state is None or state.status in Status.TERMINAL:
            return False

        # If still queued (task not started yet), mark stopped immediately
        if state.status == Status.QUEUED:
            self.update(job_id, status=Status.STOPPED, error="Stopped by user.", current_action=None)
            self.emit(job_id, {"type": "stopped"})
            try:
                self._pending_order.remove(job_id)
            except ValueError:
                pass
            return True

        # Signal the cancel event (runner checks this at safe points)
        event = self._cancel_events.get(job_id)
        if event:
            event.set()

        # Cancel the asyncio task — raises CancelledError inside the runner
        task = self._job_tasks.get(job_id)
        if task and not task.done():
            task.cancel()

        return True

    def is_cancelled(self, job_id: str) -> bool:
        """Check whether cancellation has been requested for this job."""
        event = self._cancel_events.get(job_id)
        return event is not None and event.is_set()

    def _broadcast_queue_positions(self) -> None:
        """Emit a queue_position SSE event to every waiting job with its new position."""
        total = len(self._pending_order)
        for i, jid in enumerate(self._pending_order):
            self.update(jid, queue_position=i)
            self.emit(jid, {
                "type": "queue_position",
                "position": i,
                "queue_length": total,
            })

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
        local_agent: bool = False,
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
            local_agent=local_agent,
        )
        state.queue_position = len(self._pending_order)
        self._jobs[job_id] = state

        if email and password:
            self._creds[job_id] = {"email": email, "password": password}

        if github_token:
            self._github_tokens[job_id] = github_token   # in-memory only

        if local_agent:
            token = secrets.token_urlsafe(32)
            self._agent_tokens[job_id] = token
            state.agent_token = token  # stored on state but excluded from to_public_dict()
            # Pre-create the queues so the relay can await them immediately
            self._agent_snapshots[job_id] = asyncio.Queue()
            self._agent_pending_actions[job_id] = asyncio.Queue()
            self._agent_trace_events[job_id] = asyncio.Event()

        job_dir = self._runs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        self._pending_order.append(job_id)
        self._persist(job_id)
        # Emit initial position so the frontend knows where it stands immediately.
        self.emit(job_id, {
            "type": "queue_position",
            "position": state.queue_position,
            "queue_length": len(self._pending_order),
        })
        self._queue.put_nowait(job_id)
        return job_id

    # ------------------------------------------------------------------
    # Local agent — token validation
    # ------------------------------------------------------------------

    def validate_agent_token(self, job_id: str, token: str) -> bool:
        stored = self._agent_tokens.get(job_id)
        return stored is not None and secrets.compare_digest(stored, token)

    # ------------------------------------------------------------------
    # Local agent — snapshot relay (step endpoint ↔ runner relay loop)
    # ------------------------------------------------------------------

    def post_snapshot(self, job_id: str, snapshot: dict) -> None:
        """HTTP step handler calls this to hand a snapshot to the relay loop."""
        q = self._agent_snapshots.get(job_id)
        if q is not None:
            q.put_nowait(snapshot)

    async def get_snapshot(self, job_id: str, timeout: float = 300.0) -> dict | None:
        """Relay loop calls this to wait for the next snapshot from the local agent."""
        q = self._agent_snapshots.get(job_id)
        if q is None:
            return None
        try:
            return await asyncio.wait_for(q.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    def post_agent_action(self, job_id: str, action: dict) -> None:
        """Relay loop calls this to return an action to the HTTP step handler."""
        q = self._agent_pending_actions.get(job_id)
        if q is not None:
            q.put_nowait(action)

    async def get_agent_action(self, job_id: str, timeout: float = 120.0) -> dict | None:
        """HTTP step handler calls this to wait for the relay loop's decision."""
        q = self._agent_pending_actions.get(job_id)
        if q is None:
            return None
        try:
            return await asyncio.wait_for(q.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    # ------------------------------------------------------------------
    # Local agent — question/answer (frontend answers, local agent polls)
    # ------------------------------------------------------------------

    def post_agent_answer(self, job_id: str, question_id: str, answer: Any) -> None:
        """Called when the frontend submits an answer to a question raised by the relay."""
        self._agent_answers[question_id] = answer
        event = self._agent_answer_events.get(question_id)
        if event is not None:
            event.set()

    async def get_agent_answer(
        self, job_id: str, question_id: str, timeout: float = 86400.0
    ) -> Any:
        """Relay loop (or HTTP poll endpoint) waits for the frontend's answer."""
        event = asyncio.Event()
        self._agent_answer_events[question_id] = event
        # If answer already arrived (race), return immediately
        if question_id in self._agent_answers:
            self._agent_answer_events.pop(question_id, None)
            return self._agent_answers.pop(question_id)
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            self._agent_answer_events.pop(question_id, None)
            return None
        self._agent_answer_events.pop(question_id, None)
        return self._agent_answers.pop(question_id, None)

    def peek_agent_answer(self, question_id: str) -> tuple[bool, Any]:
        """Non-blocking check used by the polling HTTP endpoint."""
        if question_id in self._agent_answers:
            return True, self._agent_answers[question_id]
        return False, None

    # ------------------------------------------------------------------
    # Local agent — trace upload signal
    # ------------------------------------------------------------------

    def signal_trace_uploaded(self, job_id: str) -> None:
        event = self._agent_trace_events.get(job_id)
        if event is not None:
            event.set()

    async def wait_for_trace(self, job_id: str, timeout: float = 86400.0) -> bool:
        event = self._agent_trace_events.get(job_id)
        if event is None:
            return False
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

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
        return len(self._pending_order)

    def active_count(self) -> int:
        return self._active_count

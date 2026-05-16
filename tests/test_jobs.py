"""Tests for JobManager state transitions and concurrency cap."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.jobs import JobManager, Status


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_manager(max_concurrent=2, tmp_path=None):
    """Create a JobManager with runs stored under tmp_path."""
    return JobManager(max_concurrent=max_concurrent, runs_dir=tmp_path or Path("/tmp/auto_mcp_test"))


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------

class TestJobCreation:
    def test_creates_queued_job(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        job = mgr.get(job_id)
        assert job is not None
        assert job["status"] == Status.QUEUED
        assert job["url"] == "https://example.com"
        assert job["id"] == job_id

    def test_default_steps(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        job = mgr.get(job_id)
        assert job["total_steps"] == 30

    def test_custom_steps(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com", max_steps=50)
        job = mgr.get(job_id)
        assert job["total_steps"] == 50

    def test_credentials_not_in_state(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com", email="u@x.com", password="secret")
        job = mgr.get(job_id)
        # Must not leak credentials into the public state dict
        assert "email" not in job
        assert "password" not in job
        assert "secret" not in str(job)

    def test_meta_json_written(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        meta = tmp_path / job_id / "meta.json"
        assert meta.exists()

    def test_meta_json_no_credentials(self, tmp_path):
        import json
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com", email="u@x.com", password="hunter2")
        meta_text = (tmp_path / job_id / "meta.json").read_text()
        assert "hunter2" not in meta_text
        assert "u@x.com" not in meta_text


class TestJobUpdate:
    def test_update_status(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        mgr.update(job_id, status=Status.EXPLORING)
        assert mgr.get(job_id)["status"] == Status.EXPLORING

    def test_full_transition(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        for status in [Status.EXPLORING, Status.ANALYZING, Status.GENERATING, Status.DONE]:
            mgr.update(job_id, status=status)
            assert mgr.get(job_id)["status"] == status

    def test_failed_transition(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        mgr.update(job_id, status=Status.FAILED, error="oops")
        job = mgr.get(job_id)
        assert job["status"] == Status.FAILED
        assert job["error"] == "oops"

    def test_unknown_job_update_is_noop(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        mgr.update("nonexistent-id", status=Status.DONE)  # must not raise

    def test_get_unknown_job_returns_none(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        assert mgr.get("does-not-exist") is None


# ---------------------------------------------------------------------------
# SSE pub/sub
# ---------------------------------------------------------------------------

class TestSSE:
    def test_subscribe_and_emit(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        q = mgr.subscribe(job_id)
        mgr.emit(job_id, {"type": "test", "value": 42})
        event = q.get_nowait()
        assert event == {"type": "test", "value": 42}

    def test_replay_log_accumulates(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        mgr.emit(job_id, {"type": "a"})
        mgr.emit(job_id, {"type": "b"})
        assert len(mgr.replay_log(job_id)) == 2

    def test_unsubscribe_stops_delivery(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        q = mgr.subscribe(job_id)
        mgr.unsubscribe(job_id, q)
        mgr.emit(job_id, {"type": "after-unsub"})
        assert q.empty()

    def test_multiple_subscribers(self, tmp_path):
        mgr = make_manager(tmp_path=tmp_path)
        job_id = mgr.create("https://example.com")
        q1 = mgr.subscribe(job_id)
        q2 = mgr.subscribe(job_id)
        mgr.emit(job_id, {"type": "broadcast"})
        assert not q1.empty()
        assert not q2.empty()


# ---------------------------------------------------------------------------
# Concurrency cap
# ---------------------------------------------------------------------------

class TestConcurrencyCap:
    @pytest.mark.asyncio
    async def test_max_concurrent_respected(self, tmp_path):
        """Only MAX_CONCURRENT_JOBS runners execute at once."""
        MAX = 2
        active = []
        finished = []
        gate = asyncio.Event()

        async def slow_runner(job_id, url, max_steps, creds, mgr):
            active.append(job_id)
            assert len(active) <= MAX, f"Too many concurrent jobs: {len(active)}"
            await gate.wait()
            active.remove(job_id)
            finished.append(job_id)

        mgr = make_manager(max_concurrent=MAX, tmp_path=tmp_path)
        mgr.set_runner(slow_runner)
        worker = asyncio.create_task(mgr.start_worker())

        ids = [mgr.create(f"https://example{i}.com") for i in range(4)]
        await asyncio.sleep(0.1)

        # At most MAX jobs should be running
        assert len(active) <= MAX

        gate.set()
        await asyncio.sleep(0.2)

        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_credentials_popped_before_run(self, tmp_path):
        """Credentials are consumed (popped) from memory before being passed to the runner."""
        received_creds = []

        async def capture_runner(job_id, url, max_steps, creds, mgr):
            received_creds.append(creds)

        mgr = make_manager(tmp_path=tmp_path)
        mgr.set_runner(capture_runner)
        worker = asyncio.create_task(mgr.start_worker())

        job_id = mgr.create("https://example.com", email="test@x.com", password="pw")
        await asyncio.sleep(0.2)

        # Creds passed through to runner
        assert received_creds[0] == {"email": "test@x.com", "password": "pw"}
        # Creds no longer in manager memory
        assert job_id not in mgr._creds

        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_job_timeout_marks_failed(self, tmp_path):
        """A job that exceeds JOB_TIMEOUT_SECONDS is marked failed."""
        import backend.jobs as jobs_mod
        orig_timeout = jobs_mod.JOB_TIMEOUT_SECONDS

        try:
            jobs_mod.JOB_TIMEOUT_SECONDS = 0  # immediate timeout

            async def never_finishes(job_id, url, max_steps, creds, mgr):
                await asyncio.sleep(999)

            mgr = make_manager(tmp_path=tmp_path)
            mgr.set_runner(never_finishes)
            worker = asyncio.create_task(mgr.start_worker())

            job_id = mgr.create("https://example.com")
            await asyncio.sleep(0.3)

            job = mgr.get(job_id)
            assert job["status"] == Status.FAILED
            assert "timed out" in (job["error"] or "").lower()
        finally:
            jobs_mod.JOB_TIMEOUT_SECONDS = orig_timeout
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass

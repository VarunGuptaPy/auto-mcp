"""
Tests for runner.py — engine functions are mocked so no playwright/anthropic needed.

Strategy: patch at the import-path used inside run_job (the lazy imports),
not at the source module level. Since run_job does `from explorer.agent import explore`
etc. at call time, we patch sys.modules before calling run_job.
"""
from __future__ import annotations

import asyncio
import json
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

FAKE_TRACE = {
    "target_url": "https://example.com",
    "started_at": 1700000000.0,
    "ended_at": 1700000030.0,
    "actions": [
        {
            "timestamp": 1700000005.0,
            "step": 0,
            "action": "navigate",
            "selector": None,
            "value": "https://example.com",
            "reasoning": "Starting exploration",
            "screenshot_path": "trace/screenshots/step_000.png",
        },
        {
            "timestamp": 1700000010.0,
            "step": 1,
            "action": "click",
            "selector": "aid-3",
            "value": None,
            "reasoning": "Clicking the login button",
            "screenshot_path": "trace/screenshots/step_001.png",
        },
    ],
    "network": [
        {
            "timestamp": 1700000008.0,
            "method": "GET",
            "url": "https://api.example.com/v1/users",
            "status": 200,
            "request_headers": {},
            "request_body": None,
            "response_body_preview": '{"users":[]}',
            "resource_type": "fetch",
        },
        {
            "timestamp": 1700000012.0,
            "method": "POST",
            "url": "https://api.example.com/v1/auth/login",
            "status": 200,
            "request_headers": {},
            "request_body": '{"email":"test@x.com"}',
            "response_body_preview": '{"token":"abc"}',
            "resource_type": "fetch",
        },
    ],
}

FAKE_SPEC = {
    "product_name": "Example",
    "base_url": "https://api.example.com",
    "auth": {"type": "bearer", "notes": "Set MCP_AUTH_TOKEN"},
    "features": [
        {
            "id": "list_users",
            "name": "List users",
            "description": "Fetch all users.",
            "endpoint": {
                "method": "GET",
                "url_template": "https://api.example.com/v1/users",
                "query_params": [],
                "body_schema": None,
            },
            "returns": "List of user objects.",
        }
    ],
}


def _make_fake_modules():
    """Inject lightweight fakes for playwright and anthropic so imports don't fail."""
    if "playwright" not in sys.modules:
        pw = types.ModuleType("playwright")
        pw_async = types.ModuleType("playwright.async_api")
        pw_async.async_playwright = MagicMock()
        pw_async.Page = MagicMock()
        pw_async.Request = MagicMock()
        pw_async.Response = MagicMock()
        sys.modules["playwright"] = pw
        sys.modules["playwright.async_api"] = pw_async

    if "anthropic" not in sys.modules:
        anth = types.ModuleType("anthropic")
        anth.Anthropic = MagicMock()
        sys.modules["anthropic"] = anth


def _make_job_dir(tmp_path: Path, job_id: str) -> Path:
    """Set up trace/screenshots + trace.json for a fake job."""
    job_dir = tmp_path / job_id
    trace_dir = job_dir / "trace"
    shots_dir = trace_dir / "screenshots"
    shots_dir.mkdir(parents=True)
    (shots_dir / "step_000.png").write_bytes(b"\x89PNG")
    (shots_dir / "step_001.png").write_bytes(b"\x89PNG")
    (trace_dir / "trace.json").write_text(json.dumps(FAKE_TRACE))
    return job_dir


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestRunJob:

    @pytest.mark.asyncio
    async def test_full_pipeline_emits_stage_changes(self, tmp_path):
        """run_job emits stage_change events for exploring / analyzing / generating / done."""
        _make_fake_modules()

        from backend.jobs import JobManager, Status

        mgr = JobManager(max_concurrent=2, runs_dir=tmp_path)
        job_id = mgr.create("https://example.com")
        q = mgr.subscribe(job_id)
        _make_job_dir(tmp_path, job_id)

        async def fake_explore(**kwargs):
            return object()

        def fake_analyze(tp, op):
            if op:
                Path(op).write_text(json.dumps(FAKE_SPEC))
            return FAKE_SPEC

        def fake_generate(spec, out_dir):
            Path(out_dir).mkdir(parents=True, exist_ok=True)

        with (
            patch("explorer.agent.explore", new=fake_explore),
            patch("analyzer.analyze.analyze", new=fake_analyze),
            patch("generator.generate.generate", new=fake_generate),
        ):
            import backend.runner as runner_mod
            with (
                patch.object(runner_mod, "run_job", wraps=runner_mod.run_job),
            ):
                # Patch lazy imports inside run_job
                orig_explore = None
                async def _patched_run(job_id, url, max_steps, creds, manager):
                    # Directly inject mocks into the namespace used by run_job
                    import importlib
                    import analyzer.analyze as aa
                    import generator.generate as gg

                    _orig_analyze = aa.analyze
                    _orig_generate = gg.generate
                    aa.analyze = fake_analyze
                    gg.generate = fake_generate

                    # explorer.agent.explore needs to be injectable
                    import explorer.agent as ea
                    _orig_explore = ea.explore
                    ea.explore = fake_explore

                    try:
                        await runner_mod.run_job(job_id, url, max_steps, creds, manager)
                    finally:
                        aa.analyze = _orig_analyze
                        gg.generate = _orig_generate
                        ea.explore = _orig_explore

                await _patched_run(job_id, "https://example.com", 30, None, mgr)

        events = []
        while not q.empty():
            events.append(q.get_nowait())

        stage_changes = [e for e in events if e.get("type") == "stage_change"]
        stages = {e["stage"] for e in stage_changes}

        assert Status.EXPLORING in stages
        assert Status.ANALYZING in stages
        assert Status.GENERATING in stages
        assert Status.DONE in stages

    @pytest.mark.asyncio
    async def test_reasoning_events_emitted(self, tmp_path):
        """Reasoning events fire for each action in the trace."""
        _make_fake_modules()

        from backend.jobs import JobManager
        import backend.runner as runner_mod
        import explorer.agent as ea
        import analyzer.analyze as aa
        import generator.generate as gg

        mgr = JobManager(max_concurrent=2, runs_dir=tmp_path)
        job_id = mgr.create("https://example.com")
        q = mgr.subscribe(job_id)
        _make_job_dir(tmp_path, job_id)

        async def fake_explore(**kwargs):
            return object()

        def fake_analyze(tp, op):
            if op:
                Path(op).write_text(json.dumps(FAKE_SPEC))
            return FAKE_SPEC

        def fake_generate(spec, out_dir):
            Path(out_dir).mkdir(parents=True, exist_ok=True)

        orig_explore = ea.explore
        orig_analyze = aa.analyze
        orig_generate = gg.generate
        ea.explore = fake_explore
        aa.analyze = fake_analyze
        gg.generate = fake_generate
        try:
            await runner_mod.run_job(job_id, "https://example.com", 30, None, mgr)
        finally:
            ea.explore = orig_explore
            aa.analyze = orig_analyze
            gg.generate = orig_generate

        events = []
        while not q.empty():
            events.append(q.get_nowait())

        reasoning_events = [e for e in events if e.get("type") == "reasoning"]
        assert len(reasoning_events) == 2
        reasonings = [e["reasoning"] for e in reasoning_events]
        assert "Starting exploration" in reasonings
        assert "Clicking the login button" in reasonings

    @pytest.mark.asyncio
    async def test_network_update_event_emitted(self, tmp_path):
        """A network_update event is emitted with both GET and POST endpoints."""
        _make_fake_modules()

        from backend.jobs import JobManager
        import backend.runner as runner_mod
        import explorer.agent as ea
        import analyzer.analyze as aa
        import generator.generate as gg

        mgr = JobManager(max_concurrent=2, runs_dir=tmp_path)
        job_id = mgr.create("https://example.com")
        q = mgr.subscribe(job_id)
        _make_job_dir(tmp_path, job_id)

        async def fake_explore(**kwargs): return object()
        def fake_analyze(tp, op):
            if op: Path(op).write_text(json.dumps(FAKE_SPEC))
            return FAKE_SPEC
        def fake_generate(spec, out_dir):
            Path(out_dir).mkdir(parents=True, exist_ok=True)

        orig_explore = ea.explore
        orig_analyze = aa.analyze
        orig_generate = gg.generate
        ea.explore = fake_explore
        aa.analyze = fake_analyze
        gg.generate = fake_generate
        try:
            await runner_mod.run_job(job_id, "https://example.com", 30, None, mgr)
        finally:
            ea.explore = orig_explore
            aa.analyze = orig_analyze
            gg.generate = orig_generate

        events = []
        while not q.empty():
            events.append(q.get_nowait())

        net_events = [e for e in events if e.get("type") == "network_update"]
        assert len(net_events) == 1
        methods = {ep["method"] for ep in net_events[0]["endpoints"]}
        assert "GET" in methods
        assert "POST" in methods

    @pytest.mark.asyncio
    async def test_failed_job_emits_error_event(self, tmp_path):
        """If explore() raises, the job transitions to failed with an error event."""
        _make_fake_modules()

        from backend.jobs import JobManager, Status
        import backend.runner as runner_mod
        import explorer.agent as ea

        mgr = JobManager(max_concurrent=2, runs_dir=tmp_path)
        job_id = mgr.create("https://example.com")
        q = mgr.subscribe(job_id)

        job_dir = tmp_path / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        async def boom(**kwargs):
            raise RuntimeError("browser crashed")

        orig_explore = ea.explore
        ea.explore = boom
        try:
            with pytest.raises(RuntimeError):
                await runner_mod.run_job(job_id, "https://example.com", 30, None, mgr)
        finally:
            ea.explore = orig_explore

        job = mgr.get(job_id)
        assert job["status"] == Status.FAILED
        assert "browser crashed" in (job["error"] or "")

        events = []
        while not q.empty():
            events.append(q.get_nowait())
        error_events = [e for e in events if e.get("type") == "error"]
        assert len(error_events) == 1
        assert "browser crashed" in error_events[0]["message"]

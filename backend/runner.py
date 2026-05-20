"""
Pipeline runner — wraps explore → analyze → generate with live progress.

Local agent mode: when job_state.local_agent is True the runner skips the
Playwright explore() call and instead acts as an AI relay — it waits for
snapshots POSTed by the local agent, calls DeepSeek to decide the next
action, and returns the action to the local agent over HTTP.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.jobs import RUNS_DIR, Status


async def run_job(
    job_id: str,
    url: str,
    max_steps: int,
    creds: dict | None,
    manager,
    github_token: str | None = None,
) -> None:
    from analyzer.analyze import analyze
    from explorer.agent import explore
    from generator.generate import generate

    job_dir = manager._runs_dir / job_id
    trace_dir = job_dir / "trace"
    shots_dir = trace_dir / "screenshots"

    # Retrieve the github_repos list from persistent job state
    job_state = manager._jobs.get(job_id)
    github_repos: list[str] = (job_state.github_repos or []) if job_state else []

    # ------------------------------------------------------------------
    # Shared question helper — emits chat_question SSE, waits for answer
    # ------------------------------------------------------------------
    async def _ask(question_id: str, text: str, question_type: str,
                   fields: list | None = None, choices: list | None = None):
        manager.emit(job_id, {
            "type": "chat_question",
            "question_id": question_id,
            "text": text,
            "question_type": question_type,
            "fields": fields or [],
            "choices": choices or [],
        })
        manager.update(job_id, current_action=f"Waiting: {text[:60]}…")
        event = manager.request_question(job_id, question_id)
        try:
            await asyncio.wait_for(event.wait(), timeout=86400)  # 24 h — effectively unlimited
        except asyncio.TimeoutError:
            manager.emit(job_id, {"type": "chat_timeout", "question_id": question_id})
            return None
        manager.update(job_id, current_action="Answer received — continuing…")
        return manager.pop_answer(question_id)

    async def on_auth_required(fields: list[dict]):
        qid = f"auth-{uuid.uuid4().hex[:8]}"
        return await _ask(
            qid,
            "Login required. Please enter your credentials:",
            "credentials",
            fields=fields,
        )

    async def on_question(question_id: str, text: str, question_type: str, choices: list):
        answer = await _ask(question_id, text, question_type, choices=choices)
        # File upload: frontend returns a relative path like "uploads/uuid.jpg".
        # Playwright's set_input_files needs an absolute path — resolve it now.
        if question_type == "file_upload" and answer and not Path(answer).is_absolute():
            candidate = job_dir / answer
            if candidate.exists():
                return str(candidate)
        return answer

    def get_user_messages() -> list[str]:
        return manager.pop_user_messages(job_id)

    # Holds code analysis results; populated in Stage 0 if any repos provided.
    code_routes: list = []
    code_env_vars: list = []
    vector_store = None
    code_lookup = None  # callable: query → list[str] — passed to explorer

    try:
        # ------------------------------------------------------------------ #
        # Stage 0 — Code analysis (runs for each repo in the list)
        # ------------------------------------------------------------------ #
        if github_repos:
            manager.update(job_id, status=Status.CODE_ANALYSIS,
                           current_action=f"Fetching {len(github_repos)} repository(-ies)…")
            manager.emit(job_id, {"type": "stage_change", "stage": Status.CODE_ANALYSIS})

            try:
                from code_analyzer.github_fetcher import fetch_repo
                from code_analyzer.route_extractor import extract_routes
                from code_analyzer.env_detector import detect_env_vars
                from code_analyzer.vector_store import CodeVectorStore

                loop = asyncio.get_running_loop()

                # Fetch each repo and merge files — later repos win on path conflicts
                all_files_by_path: dict[str, object] = {}
                for repo_url in github_repos:
                    manager.update(job_id, current_action=f"Downloading {repo_url}…")
                    try:
                        files = await loop.run_in_executor(
                            None, lambda u=repo_url: fetch_repo(u, github_token)
                        )
                        for f in files:
                            all_files_by_path[f.path] = f
                        manager.emit(job_id, {
                            "type": "repo_fetched",
                            "repo": repo_url,
                            "files": len(files),
                        })
                    except Exception as exc:
                        manager.emit(job_id, {
                            "type": "code_analysis_warning",
                            "message": f"Could not fetch {repo_url}: {exc}",
                        })

                # Discard token immediately after all fetches
                github_token = None  # noqa: F841

                repo_files = list(all_files_by_path.values())
                manager.update(job_id, current_action=f"Indexing {len(repo_files)} files…")

                # Build vector store in job dir (stays on user's machine).
                vs_dir = job_dir / "vector_store"
                def _build_vector_store():
                    vs = CodeVectorStore(vs_dir)
                    vs.add_files(repo_files)
                    return vs
                vector_store = await loop.run_in_executor(None, _build_vector_store)

                # Provide a sync lookup function the explorer will call per step
                _vs = vector_store
                def code_lookup(query: str) -> list[str]:
                    return _vs.query(query, n_results=3)

                # Static route + env-var extraction (CPU-only, no LLM)
                code_routes = await loop.run_in_executor(None, extract_routes, repo_files)
                code_env_vars = await loop.run_in_executor(None, detect_env_vars, repo_files)

                manager.update(
                    job_id,
                    has_code_analysis=True,
                    current_action=f"Found {len(code_routes)} routes, {len(code_env_vars)} env vars",
                )
                manager.emit(job_id, {
                    "type": "code_analysis_done",
                    "repos": github_repos,
                    "routes_found": len(code_routes),
                    "env_vars_found": len(code_env_vars),
                    "vector_backend": vector_store.backend,
                })

                # Ask user to provide values for required env vars
                required_vars = [v for v in code_env_vars if v.required and v.is_secret]
                if required_vars:
                    fields = [
                        {"name": v.name, "label": v.name,
                         "description": v.description or f"Required by {v.file_path}"}
                        for v in required_vars
                    ]
                    qid = f"env-vars-{uuid.uuid4().hex[:8]}"
                    env_answer = await _ask(
                        qid,
                        "I found environment variables in the code that are required by the app. "
                        "Please provide their values (they will only be used to configure the generated MCP server, "
                        "not stored anywhere):",
                        "env_vars",
                        fields=fields,
                    )
                    if env_answer and isinstance(env_answer, dict):
                        env_file = job_dir / "user_env.json"
                        env_file.write_text(json.dumps(env_answer, indent=2))

            except Exception as exc:
                # Code analysis failure is non-fatal — continue with browser-only mode
                manager.emit(job_id, {
                    "type": "code_analysis_warning",
                    "message": f"Code analysis failed, continuing with browser-only mode: {exc}",
                })
                github_token = None
                code_lookup = None

        # ------------------------------------------------------------------ #
        # Stage 1 — Explore  (or local agent relay)
        # ------------------------------------------------------------------ #
        job_state = manager._jobs.get(job_id)
        if job_state and job_state.local_agent:
            # Local agent mode: skip Playwright, run AI relay loop instead
            await _run_local_agent_relay(
                job_id, url, max_steps, trace_dir, manager, _ask
            )
        else:
            extra_instructions: list[str] = []  # grows if user says "explore more"

            while True:
                manager.update(job_id, status=Status.EXPLORING, current_action="Launching browser…")
                manager.emit(job_id, {"type": "stage_change", "stage": Status.EXPLORING})

                # Seed any extra instructions the user gave in the previous loop
                seeded: list[str] = list(extra_instructions)

                explore_task = asyncio.create_task(
                    explore(
                        url=url,
                        max_steps=max_steps,
                        headless=True,
                        out_dir=trace_dir,
                        on_auth_required=on_auth_required,
                        on_question=on_question,
                        get_user_messages=get_user_messages,
                        initial_instructions=seeded,
                        code_lookup=code_lookup,
                    )
                )

                tail_task = asyncio.create_task(
                    _tail_screenshots(job_id, shots_dir, max_steps, manager, explore_task)
                )

                try:
                    await explore_task
                finally:
                    tail_task.cancel()
                    try:
                        await tail_task
                    except asyncio.CancelledError:
                        pass

                if explore_task.exception():
                    raise explore_task.exception()  # type: ignore[misc]

                trace_json = trace_dir / "trace.json"
                if trace_json.exists():
                    trace_data = json.loads(trace_json.read_text())
                    _emit_reasoning(job_id, trace_data, manager)
                    _emit_network(job_id, trace_data, manager)

                # ---------------------------------------------------------- #
                # Coverage check — ask user before moving on
                # ---------------------------------------------------------- #
                check_qid = f"coverage-{uuid.uuid4().hex[:8]}"
                answer = await _ask(
                    check_qid,
                    "I've finished exploring. Do you think I covered all the important pages and features? "
                    "If yes I'll proceed to generate the MCP server. "
                    "If not, tell me which pages or features to visit and I'll keep going.",
                    "choice",
                    choices=["Yes, generate MCP", "No, explore more"],
                )

                # Treat None / timeout / yes-ish as approval
                if not answer or answer.strip().lower().startswith("yes"):
                    break

                # User wants more — ask what specifically to explore
                detail_qid = f"explore-more-{uuid.uuid4().hex[:8]}"
                detail = await _ask(
                    detail_qid,
                    "Which pages or features should I visit? Describe them and I'll start another pass.",
                    "text",
                )
                if detail and detail.strip():
                    extra_instructions = [detail.strip()]
                else:
                    break  # no detail given — proceed anyway

        # ------------------------------------------------------------------ #
        # Stage 2 — Analyze
        # ------------------------------------------------------------------ #
        manager.update(job_id, status=Status.ANALYZING, current_action="Analyzing captured API calls…")
        manager.emit(job_id, {"type": "stage_change", "stage": Status.ANALYZING})

        loop = asyncio.get_running_loop()

        if code_routes and vector_store:
            # Code-aware analysis: merge browser trace with static code analysis
            manager.update(job_id, current_action="Merging browser trace with code analysis…")
            from code_analyzer.merge import merge_analysis

            browser_spec = await loop.run_in_executor(
                None, analyze, trace_dir / "trace.json", None
            )
            spec = await loop.run_in_executor(
                None,
                lambda: merge_analysis(
                    browser_spec=browser_spec,
                    code_routes=code_routes,
                    vector_store=vector_store,
                    target_url=url,
                    detected_env_vars=code_env_vars,
                )
            )
            (job_dir / "feature_spec.json").write_text(json.dumps(spec, indent=2))
        else:
            # Browser-only analysis (original path)
            spec = await loop.run_in_executor(
                None, analyze, trace_dir / "trace.json", job_dir / "feature_spec.json"
            )

        features_found = len(spec.get("features", []))
        manager.update(job_id, features_found=features_found)
        manager.emit(job_id, {"type": "features_found", "count": features_found})

        # ------------------------------------------------------------------ #
        # Stage 3 — Generate
        # ------------------------------------------------------------------ #
        manager.update(job_id, status=Status.GENERATING, current_action="Generating MCP server…")
        manager.emit(job_id, {"type": "stage_change", "stage": Status.GENERATING})

        # Load user-provided env var values (collected during code analysis stage)
        user_env: dict | None = None
        env_file = job_dir / "user_env.json"
        if env_file.exists():
            try:
                user_env = json.loads(env_file.read_text())
            except Exception:
                pass

        await loop.run_in_executor(
            None, generate, spec, job_dir / "mcp_server", user_env
        )

        manager.update(job_id, status=Status.DONE, current_action=None, features_found=features_found)
        manager.emit(job_id, {"type": "stage_change", "stage": Status.DONE, "features_found": features_found})

    except Exception as exc:
        err = str(exc)
        manager.update(job_id, status=Status.FAILED, error=err, current_action=None)
        manager.emit(job_id, {"type": "error", "message": err})
        raise


# --------------------------------------------------------------------------- #
# Local agent relay
# --------------------------------------------------------------------------- #

async def _run_local_agent_relay(
    job_id: str,
    url: str,
    max_steps: int | None,
    trace_dir: Path,
    manager,
    _ask,
) -> None:
    """AI relay loop for local agent mode.

    The local agent (on the user's machine) drives Playwright and POSTs a
    snapshot each step.  This function calls DeepSeek, returns the action,
    and handles ask_user / auth_required by emitting SSE to the frontend.
    The local agent uploads trace.json when it is finished, and we wait for
    that before exiting so Stage 2 (analyze) can proceed.
    """
    from openai import AsyncOpenAI
    from explorer.agent import SYSTEM_PROMPT, _build_user_message, _parse_action, UIAction

    client = AsyncOpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )

    manager.update(
        job_id,
        status=Status.WAITING_FOR_AGENT,
        current_action="Waiting for local agent to connect…",
    )
    manager.emit(job_id, {"type": "stage_change", "stage": Status.WAITING_FOR_AGENT})

    # Rebuild minimal _ask-like state for the relay
    history: list[UIAction] = []
    qa_history: list[dict] = []
    visited_urls: set[str] = {url}
    creds: dict | None = None
    ask_user_streak = 0
    recent_actions: list[tuple[str, str]] = []
    step_limit = max_steps  # may be None → unlimited

    step = 0
    while True:
        if step_limit is not None and step >= step_limit:
            manager.emit(job_id, {"type": "relay_info", "message": "Max steps reached."})
            break

        # Wait for the local agent to POST a snapshot
        snapshot = await manager.get_snapshot(job_id, timeout=300.0)
        if snapshot is None:
            manager.emit(job_id, {"type": "relay_info", "message": "Timed out waiting for snapshot."})
            break

        current_url = snapshot.get("url", url)
        elements = snapshot.get("elements", [])
        visited_urls.add(current_url)

        # Update frontend with step progress
        manager.update(job_id, status=Status.EXPLORING, current_step=step)
        manager.emit(job_id, {
            "type": "step_update",
            "step": step,
            "total_steps": step_limit,
            "screenshot_url": f"/api/jobs/{job_id}/screenshot/{step}",
        })

        # Detect loops
        loop_warning: str | None = None
        if len(recent_actions) >= 3:
            last3 = recent_actions[-3:]
            kinds = [k for k, _ in last3]
            aids = [a for _, a in last3]
            if len(set(aids)) == 1 and aids[0] and all(k == "click" for k in kinds):
                loop_warning = (
                    f"You have clicked '{aids[0]}' 3 times in a row. "
                    "DO NOT click it again. Move on to a different element or action."
                )
            elif len(set(aids)) == 1 and aids[0] and len(set(kinds)) == 1:
                loop_warning = (
                    f"You have performed '{kinds[0]}' on '{aids[0]}' 3 times in a row. "
                    "This is a loop. Choose a DIFFERENT element or action."
                )

        text_parts = _build_user_message(
            current_url, elements, history, creds, qa_history,
            visited_urls, None, loop_warning, None,
        )
        text_block = next((p for p in text_parts if p.get("type") == "text"), {})

        resp = await client.chat.completions.create(
            model="deepseek-chat",
            max_tokens=500,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text_block.get("text", "")},
            ],
        )
        raw = resp.choices[0].message.content or ""
        try:
            action = _parse_action(raw)
        except Exception as exc:
            manager.emit(job_id, {"type": "relay_error", "message": f"Parse error: {exc}"})
            manager.post_agent_action(job_id, {"action": "wait", "reasoning": "parse error"})
            step += 1
            continue

        kind = action.get("action", "")
        reasoning = action.get("reasoning", "")

        # Record in history
        history.append(UIAction(
            timestamp=__import__("time").time(),
            step=step,
            action=kind,
            selector=action.get("aid"),
            value=action.get("value") or action.get("url") or action.get("direction"),
            reasoning=reasoning,
        ))

        manager.emit(job_id, {
            "type": "reasoning",
            "step": step,
            "action": kind,
            "reasoning": reasoning,
        })

        # Handle actions that require backend involvement before forwarding
        if kind == "done":
            manager.post_agent_action(job_id, action)
            break

        if kind == "auth_required":
            fields = action.get("fields", [])
            qid = f"auth-{uuid.uuid4().hex[:8]}"
            answer = await _ask(
                qid,
                "Login required. Please enter your credentials:",
                "credentials",
                fields=fields,
            )
            if answer and isinstance(answer, dict):
                creds = answer
            # Forward to local agent with creds embedded so it can fill the form
            action_to_send = dict(action)
            action_to_send["provided_creds"] = creds
            manager.post_agent_action(job_id, action_to_send)
            step += 1
            continue

        if kind == "ask_user":
            ask_user_streak += 1
            if ask_user_streak > 10:
                manager.post_agent_action(job_id, {"action": "done", "reasoning": "ask_user limit"})
                break
            qid = f"q-{step}-{uuid.uuid4().hex[:8]}"
            answer = await _ask(
                qid,
                action.get("question", "What should I do next?"),
                action.get("question_type", "text"),
                choices=action.get("choices", []),
            )
            if answer:
                qa_history.append({"q": action.get("question", ""), "a": answer})
            action_to_send = dict(action)
            action_to_send["answer"] = answer
            manager.post_agent_action(job_id, action_to_send)
            step += 1
            continue

        ask_user_streak = 0
        recent_actions.append((kind, action.get("aid", "")))
        if len(recent_actions) > 10:
            recent_actions.pop(0)

        manager.post_agent_action(job_id, action)
        step += 1

    # Wait for the local agent to upload trace.json
    manager.update(job_id, current_action="Waiting for local agent to upload trace…")
    trace_ready = await manager.wait_for_trace(job_id, timeout=300.0)
    if not trace_ready:
        manager.emit(job_id, {"type": "relay_info", "message": "Trace upload timed out."})
        return

    trace_json = trace_dir / "trace.json"
    if trace_json.exists():
        trace_data = json.loads(trace_json.read_text())
        _emit_reasoning(job_id, trace_data, manager)
        _emit_network(job_id, trace_data, manager)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

async def _tail_screenshots(job_id, shots_dir, max_steps, manager, explore_task):
    seen: set[str] = set()
    while not explore_task.done():
        if shots_dir.exists():
            for f in sorted(shots_dir.glob("step_*.png")):
                if f.name not in seen:
                    seen.add(f.name)
                    try:
                        step = int(f.stem.split("_")[1])
                    except (IndexError, ValueError):
                        continue
                    manager.update(job_id, current_step=step)
                    manager.emit(job_id, {
                        "type": "step_update",
                        "step": step,
                        "total_steps": max_steps,
                        "screenshot_url": f"/api/jobs/{job_id}/screenshot/{step}",
                    })
        await asyncio.sleep(0.5)


def _emit_reasoning(job_id, trace_data, manager):
    for action in trace_data.get("actions", []):
        manager.emit(job_id, {
            "type": "reasoning",
            "step": action.get("step"),
            "action": action.get("action"),
            "reasoning": action.get("reasoning", ""),
        })


def _emit_network(job_id, trace_data, manager):
    from analyzer.analyze import templatize_path
    seen: set[tuple] = set()
    endpoints: list[dict] = []
    for call in trace_data.get("network", []):
        parsed = urlparse(call["url"])
        path_t = templatize_path(parsed.path)
        key = (call["method"], parsed.netloc, path_t)
        if key not in seen:
            seen.add(key)
            endpoints.append({"method": call["method"], "host": parsed.netloc, "path": path_t})
    manager.emit(job_id, {"type": "network_update", "endpoints": endpoints})

"""
local_agent.py — auto-mcp local browser agent

Runs the Playwright browser loop on the user's machine while the backend
handles all AI decisions. Download and run with:

    python local_agent.py --job-id <uuid> --token <token> --backend-url https://api.auto-mcp.com

Dependencies: playwright, requests  (pip install playwright requests && playwright install chromium)
"""

from __future__ import annotations

import sys

# ------------------------------------------------------------------ #
# Dependency guard — give friendly instructions before any import fails
# ------------------------------------------------------------------ #
try:
    from playwright.async_api import async_playwright, Page, Request, Response
except ImportError:
    print(
        "\n[auto-mcp] Playwright is not installed.\n"
        "Install it with:\n"
        "    pip install playwright requests\n"
        "    playwright install chromium\n"
    )
    sys.exit(1)

try:
    import requests as _requests
except ImportError:
    print(
        "\n[auto-mcp] 'requests' is not installed.\n"
        "Install it with:\n"
        "    pip install playwright requests\n"
    )
    sys.exit(1)

import argparse
import asyncio
import base64
import json
import threading
import time
from dataclasses import dataclass, field, asdict
from typing import Any


# ------------------------------------------------------------------ #
# Data classes — mirror ExplorationTrace / UIAction / NetworkCall
# from explorer/agent.py so the trace format is identical
# ------------------------------------------------------------------ #

@dataclass
class NetworkCall:
    timestamp: float
    method: str
    url: str
    status: int | None
    request_headers: dict[str, str]
    request_body: str | None
    response_body_preview: str | None
    resource_type: str

    def is_api_call(self) -> bool:
        """Heuristic: does this look like an API call worth capturing?"""
        if self.resource_type in ("image", "stylesheet", "font", "media"):
            return False
        if self.url.endswith((".js", ".css", ".woff", ".woff2", ".ttf", ".png",
                              ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp")):
            return False
        if self.resource_type in ("xhr", "fetch"):
            return True
        return False


@dataclass
class UIAction:
    timestamp: float
    step: int
    action: str
    selector: str | None
    value: str | None
    reasoning: str
    screenshot_path: str | None = None


@dataclass
class ExplorationTrace:
    target_url: str
    started_at: float
    ended_at: float | None = None
    actions: list[UIAction] = field(default_factory=list)
    network: list[NetworkCall] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_url": self.target_url,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "actions": [asdict(a) for a in self.actions],
            "network": [asdict(n) for n in self.network if n.is_api_call()],
        }


# ------------------------------------------------------------------ #
# Browser glue — copied verbatim from explorer/agent.py
# ------------------------------------------------------------------ #

ANNOTATE_JS = """
() => {
  const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [contenteditable="true"]';
  const els = Array.from(document.querySelectorAll(selectors));
  const visible = (el) => {
    // Hidden file inputs are intentionally invisible but still targetable by Playwright
    if (el.tagName.toLowerCase() === 'input' && el.getAttribute('type') === 'file') return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  };
  const out = [];
  let i = 0;
  for (const el of els) {
    if (!visible(el)) continue;
    const aid = `aid-${i++}`;
    el.setAttribute('data-aid', aid);
    const r = el.getBoundingClientRect();
    const entry = {
      aid,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || null,
      role: el.getAttribute('role') || null,
      name: (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().slice(0, 100),
      placeholder: el.getAttribute('placeholder') || null,
      href: el.getAttribute('href') || null,
      min: el.getAttribute('min') || null,
      max: el.getAttribute('max') || null,
      checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : null,
      required: el.required || null,
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
    };
    // For <select>, expose available options so the model can choose intelligently
    if (el.tagName.toLowerCase() === 'select') {
      entry.options = Array.from(el.options).slice(0, 20).map(o => ({
        value: o.value, text: o.text.trim(), selected: o.selected
      }));
    }
    out.push(entry);
  }
  return out;
}
"""


async def _wait_stable(page: Page, timeout: float = 5.0) -> None:
    """Wait until the page is no longer navigating and the DOM is ready."""
    try:
        await page.wait_for_load_state("domcontentloaded", timeout=int(timeout * 1000))
    except Exception:
        pass
    # Best-effort networkidle — ignore timeout on heavy pages
    try:
        await page.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass


async def snapshot_page(page: Page) -> tuple[str, list[dict]]:
    """Return (base64_screenshot, list_of_interactive_elements).

    Retries up to 3 times if the execution context is destroyed mid-navigation.
    """
    await _wait_stable(page)
    for attempt in range(3):
        try:
            elements = await page.evaluate(ANNOTATE_JS)
            png_bytes = await page.screenshot(full_page=False)
            return base64.standard_b64encode(png_bytes).decode("ascii"), elements
        except Exception as exc:
            msg = str(exc)
            if "Execution context was destroyed" in msg or "Target closed" in msg:
                if attempt < 2:
                    await asyncio.sleep(1.0 + attempt)
                    await _wait_stable(page)
                    continue
            raise
    # Fallback: return empty elements so the loop can continue
    try:
        png_bytes = await page.screenshot(full_page=False)
    except Exception:
        png_bytes = b""
    return base64.standard_b64encode(png_bytes).decode("ascii"), []


def _record_network(
    page: Page,
    network_buffer: list[dict],
) -> None:
    """Wire up Playwright network listeners to write into network_buffer.

    Unlike explorer/agent.py (which writes into an ExplorationTrace), we write
    into a plain list of dicts that gets drained and sent per-step.
    """
    pending: dict[str, dict] = {}

    def on_request(req: Request) -> None:
        try:
            body = req.post_data
        except Exception:
            body = None
        pending[req.url + ":" + req.method] = {
            "timestamp": time.time(),
            "method": req.method,
            "url": req.url,
            "status": None,
            "request_headers": dict(req.headers),
            "request_body": body,
            "response_body_preview": None,
            "resource_type": req.resource_type,
        }

    async def on_response(resp: Response) -> None:
        key = resp.url + ":" + resp.request.method
        call = pending.pop(key, None)
        if call is None:
            return
        call["status"] = resp.status
        try:
            text = await resp.text()
            call["response_body_preview"] = text[:2000]
        except Exception:
            call["response_body_preview"] = None
        network_buffer.append(call)

    page.on("request", on_request)
    page.on("response", lambda r: asyncio.create_task(on_response(r)))


# ------------------------------------------------------------------ #
# HTTP helpers — sync requests with retry + backoff
# ------------------------------------------------------------------ #

def _http_get(url: str, headers: dict, retries: int = 3) -> dict:
    """GET url with retry on failure. Returns parsed JSON or raises SystemExit."""
    for attempt in range(retries):
        try:
            resp = _requests.get(url, headers=headers, timeout=30)
            if resp.ok:
                return resp.json()
            print(f"[auto-mcp] GET {url} returned {resp.status_code}: {resp.text[:200]}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            sys.exit(1)
        except _requests.RequestException as e:
            print(f"[auto-mcp] GET {url} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            sys.exit(1)
    sys.exit(1)  # unreachable, satisfies type checker


def _http_get_bytes(url: str, headers: dict, retries: int = 3) -> bytes | None:
    """GET url, return raw bytes. Used for downloading uploaded files."""
    dl_headers = {k: v for k, v in headers.items() if k.lower() != "content-type"}
    for attempt in range(retries):
        try:
            resp = _requests.get(url, headers=dl_headers, timeout=60)
            if resp.ok:
                return resp.content
            print(f"[auto-mcp] GET {url} returned {resp.status_code}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
        except _requests.RequestException as e:
            print(f"[auto-mcp] GET {url} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return None


def _http_post(url: str, headers: dict, body: dict, retries: int = 3, timeout: int = 86400) -> dict | None:
    """POST body to url with retry. Returns parsed JSON on success, None on non-fatal error."""
    for attempt in range(retries):
        try:
            resp = _requests.post(url, headers=headers, json=body, timeout=timeout)
            if resp.ok:
                try:
                    return resp.json()
                except Exception:
                    return {}
            print(f"[auto-mcp] POST {url} returned {resp.status_code}: {resp.text[:200]}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            # Non-2xx after all retries — print and return None so caller can decide
            return None
        except _requests.RequestException as e:
            print(f"[auto-mcp] POST {url} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            return None
    return None


# ------------------------------------------------------------------ #
# Playwright action executor — matches explorer/agent.py _execute()
# ------------------------------------------------------------------ #

async def _execute(page: Page, action: dict) -> None:
    kind = action.get("action")
    if kind == "click":
        await page.locator(f'[data-aid="{action["aid"]}"]').first.click(timeout=5000)
    elif kind == "type":
        loc = page.locator(f'[data-aid="{action["aid"]}"]').first
        await loc.click(timeout=5000)
        await loc.fill(action["value"], timeout=5000)
    elif kind == "select_option":
        loc = page.locator(f'[data-aid="{action["aid"]}"]').first
        val = action["value"]
        try:
            await loc.select_option(value=val, timeout=5000)
        except Exception:
            # Fall back to matching by visible text
            await loc.select_option(label=val, timeout=5000)
    elif kind == "navigate":
        await page.goto(action["url"], wait_until="domcontentloaded")
        await _wait_stable(page)
    elif kind == "scroll":
        delta = 600 if action.get("direction") == "down" else -600
        await page.mouse.wheel(0, delta)
    elif kind == "hover":
        await page.locator(f'[data-aid="{action["aid"]}"]').first.hover(timeout=5000)
        await asyncio.sleep(0.6)
    elif kind == "upload_file":
        file_path = action.get("path", "").strip()
        await page.locator(f'[data-aid="{action["aid"]}"]').first.set_input_files(
            file_path, timeout=30000
        )
    elif kind == "wait":
        await _wait_stable(page)
        await asyncio.sleep(1.0)


# ------------------------------------------------------------------ #
# Question polling — wait until the backend says question is answered
# ------------------------------------------------------------------ #

def _poll_question(
    backend_url: str,
    job_id: str,
    question_id: str,
    headers: dict,
    poll_interval: float = 3.0,
    timeout: float = 600.0,
) -> str | None:
    """Block until the backend says the question has been answered.

    Returns the answer string, or None on timeout.
    """
    deadline = time.time() + timeout
    url = f"{backend_url}/api/jobs/{job_id}/agent/question/{question_id}"
    print(f"  Waiting for answer (question_id={question_id}) — answer via the dashboard ...")
    while time.time() < deadline:
        try:
            resp = _requests.get(url, headers=headers, timeout=15)
            if resp.ok:
                data = resp.json()
                if data.get("answered"):
                    answer = data.get("answer", "")
                    print(f"  Answer received: {answer!r}")
                    return answer
        except Exception as e:
            print(f"  [poll] request error: {e}")
        time.sleep(poll_interval)
    print("  [poll] timed out waiting for answer")
    return None


# ------------------------------------------------------------------ #
# Local file-upload intercept (local runs only)
# ------------------------------------------------------------------ #

def _local_file_upload_thread(
    backend_url: str,
    job_id: str,
    auth_headers: dict,
    stop_event: threading.Event,
) -> None:
    """Background thread (local runs only): watches for file-upload questions,
    asks the user to upload directly in the Playwright browser, then answers
    the question with an empty string so the backend unblocks.
    The local_agent step handler skips set_input_files when answer is empty,
    and the next screenshot captures whatever the user uploaded in the browser.
    """
    url = f"{backend_url}/api/jobs/{job_id}/events"
    headers = {k: v for k, v in auth_headers.items() if k.lower() != "content-type"}
    handled: set[str] = set()

    try:
        with _requests.get(url, headers=headers, stream=True, timeout=86400) as resp:
            buf = ""
            for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
                if stop_event.is_set():
                    break
                if not chunk:
                    continue
                buf += chunk
                while "\n\n" in buf:
                    frame, buf = buf.split("\n\n", 1)
                    data_line = next(
                        (ln[6:] for ln in frame.split("\n") if ln.startswith("data: ")),
                        None,
                    )
                    if not data_line:
                        continue
                    try:
                        event = json.loads(data_line)
                    except json.JSONDecodeError:
                        continue

                    if (
                        event.get("type") == "chat_question"
                        and event.get("question_type") == "file_upload"
                    ):
                        qid: str = event["question_id"]
                        if qid in handled:
                            continue
                        handled.add(qid)

                        print(
                            "\n"
                            "  ┌─────────────────────────────────────────────────────┐\n"
                            "  │  FILE UPLOAD REQUIRED                               │\n"
                            "  │  Go to the browser window Playwright opened,        │\n"
                            "  │  click the upload button and select your file.      │\n"
                            "  └─────────────────────────────────────────────────────┘"
                        )
                        input("  Press Enter here once you have uploaded the file... ")

                        # Unblock the backend — empty answer skips set_input_files
                        _http_post(
                            f"{backend_url}/api/jobs/{job_id}/chat",
                            headers=auth_headers,
                            body={"question_id": qid, "answer": ""},
                        )
    except Exception as exc:
        if not stop_event.is_set():
            print(f"  [file-upload thread] stopped: {exc}")


# ------------------------------------------------------------------ #
# Main explore loop
# ------------------------------------------------------------------ #

async def explore(
    job_id: str,
    token: str,
    backend_url: str,
    headless: bool,
    max_steps_override: int | None,
) -> None:
    backend_url = backend_url.rstrip("/")
    auth_headers = {
        "X-Agent-Token": token,
        "Content-Type": "application/json",
    }

    # ---- 1. Fetch job config ----------------------------------------
    print(f"[auto-mcp] Fetching job config for {job_id} ...")
    config = _http_get(f"{backend_url}/api/jobs/{job_id}", headers=auth_headers)
    target_url: str = config.get("url", "")
    if not target_url:
        print("[auto-mcp] Backend did not return a target URL. Cannot proceed.")
        sys.exit(1)
    max_steps: int | None = max_steps_override or config.get("max_steps") or None
    print(f"[auto-mcp] Target URL : {target_url}")
    print(f"[auto-mcp] Max steps  : {max_steps or 'unlimited (until done)'}")

    # ---- 2. Build trace skeleton -------------------------------------
    trace = ExplorationTrace(target_url=target_url, started_at=time.time())

    # Shared network buffer — drained after each step POST
    network_buffer: list[dict] = []

    # ---- 3. Launch browser -------------------------------------------
    _fu_stop = threading.Event()
    threading.Thread(
        target=_local_file_upload_thread,
        args=(backend_url, job_id, dict(auth_headers), _fu_stop),
        daemon=True,
        name="local-file-upload",
    ).start()

    print(f"[auto-mcp] Launching {'headless' if headless else 'visible'} browser ...")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()
        _record_network(page, network_buffer)

        print(f"[auto-mcp] Navigating to {target_url} ...")
        await page.goto(target_url, wait_until="domcontentloaded")
        await _wait_stable(page)

        # ---- 4. Step loop --------------------------------------------
        step_iter = (
            range(max_steps) if max_steps is not None
            else __import__("itertools").count()
        )

        for step in step_iter:
            current_url = page.url
            print(f"\n[step {step}] URL: {current_url}")

            # Take screenshot + extract elements
            screenshot_b64, elements = await snapshot_page(page)

            # Drain network events captured since last step
            step_network = list(network_buffer)
            network_buffer.clear()

            # Also accumulate API calls into the trace for final submission
            for call_dict in step_network:
                nc = NetworkCall(**call_dict)
                trace.network.append(nc)

            # POST step data to backend, get next action
            step_payload = {
                "screenshot_b64": screenshot_b64,
                "elements": elements,
                "url": current_url,
                "network_events": step_network,
                "step": step,
            }
            print(f"[step {step}] Sending snapshot to backend ...")
            result = _http_post(
                f"{backend_url}/api/jobs/{job_id}/agent/step",
                headers=auth_headers,
                body=step_payload,
            )
            if result is None:
                print(f"[step {step}] Backend error — aborting.")
                break

            action: dict = result.get("action", {})
            kind: str = action.get("action", "")
            reasoning: str = action.get("reasoning", "")

            print(f"[step {step}] Action: {kind}  --  {reasoning}")

            # Record action in trace
            ua = UIAction(
                timestamp=time.time(),
                step=step,
                action=kind,
                selector=action.get("aid"),
                value=action.get("value") or action.get("url") or action.get("direction"),
                reasoning=reasoning,
            )
            trace.actions.append(ua)

            # ---- done ------------------------------------------------
            if kind == "done":
                print(f"[step {step}] Exploration complete.")
                break

            # ---- ask_user / auth_required ----------------------------
            # The backend relay already blocked waiting for the user's answer
            # before returning this action. The answer is embedded in
            # action["answer"] and in the backend's qa_history for DeepSeek.
            if kind in ("ask_user", "auth_required"):
                question = action.get("question", "")
                if question:
                    print(f"\n  [answered via dashboard] {question}")

                # File upload: the user uploaded a file to the backend server.
                # Download it here and call set_input_files on the local browser.
                if (
                    kind == "ask_user"
                    and action.get("question_type") == "file_upload"
                    and action.get("answer")
                    and action.get("aid")
                ):
                    import os as _os
                    import tempfile as _tempfile
                    remote_path: str = action["answer"]          # e.g. "uploads/abc.jpg"
                    filename = remote_path.split("/")[-1]
                    dl_url = f"{backend_url}/api/jobs/{job_id}/uploads/{filename}"
                    print(f"  [file upload] downloading {filename} from backend …")
                    file_bytes = _http_get_bytes(dl_url, headers=auth_headers)
                    if file_bytes:
                        suffix = _os.path.splitext(filename)[1] or ".bin"
                        with _tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                            tmp.write(file_bytes)
                            tmp_path = tmp.name
                        try:
                            await _execute(page, {
                                "action": "upload_file",
                                "aid": action["aid"],
                                "path": tmp_path,
                            })
                            await _wait_stable(page)
                            print(f"  [file upload] set_input_files succeeded for {action['aid']}")
                        except Exception as e:
                            print(f"  [file upload] set_input_files error: {e}")
                        finally:
                            _os.unlink(tmp_path)
                    else:
                        print(f"  [file upload] could not download {filename} — skipping")
                continue

            # ---- execute browser action ------------------------------
            try:
                await _execute(page, action)
            except Exception as e:
                print(f"[step {step}] Playwright error (continuing): {e}")

            await _wait_stable(page)

        await context.close()
        await browser.close()

    _fu_stop.set()

    # ---- 5. Finalise trace -------------------------------------------
    trace.ended_at = time.time()

    # ---- 6. POST trace to backend ------------------------------------
    print("\n[auto-mcp] Sending trace to backend ...")
    trace_result = _http_post(
        f"{backend_url}/api/jobs/{job_id}/agent/trace",
        headers=auth_headers,
        body=trace.to_dict(),
    )
    if trace_result is None:
        print("[auto-mcp] Warning: failed to deliver trace to backend.")
    else:
        print("[auto-mcp] Trace delivered successfully.")

    print("\n[auto-mcp] Done! Check your dashboard for results.")
    print(f"           https://auto-mcp.com/dashboard/jobs/{job_id}")


# ------------------------------------------------------------------ #
# CLI
# ------------------------------------------------------------------ #

def main() -> None:
    parser = argparse.ArgumentParser(
        description="auto-mcp local browser agent — runs Playwright locally while AI decisions happen on the backend.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Example:\n"
            "  python local_agent.py --job-id abc-123 --token mytoken --backend-url https://api.auto-mcp.com\n"
        ),
    )
    parser.add_argument(
        "--job-id",
        required=True,
        metavar="UUID",
        help="Job ID provided by auto-mcp (e.g. abc-123)",
    )
    parser.add_argument(
        "--token",
        required=True,
        metavar="TOKEN",
        help="Agent auth token provided by auto-mcp",
    )
    parser.add_argument(
        "--backend-url",
        default="https://api.auto-mcp.com",
        metavar="URL",
        help="Backend base URL (default: https://api.auto-mcp.com)",
    )
    parser.add_argument(
        "--headed",
        dest="headed",
        action="store_true",
        default=True,
        help="Show the browser window (default: on)",
    )
    parser.add_argument(
        "--no-headed",
        dest="headed",
        action="store_false",
        help="Run browser in headless mode (invisible)",
    )
    parser.add_argument(
        "--max-steps",
        type=int,
        default=None,
        metavar="N",
        help="Override max exploration steps (default: use backend setting)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  auto-mcp local agent")
    print("=" * 60)
    print(f"  Job ID      : {args.job_id}")
    print(f"  Backend URL : {args.backend_url}")
    print(f"  Browser     : {'visible' if args.headed else 'headless'}")
    if args.max_steps:
        print(f"  Max steps   : {args.max_steps}")
    print("=" * 60)
    print()

    asyncio.run(
        explore(
            job_id=args.job_id,
            token=args.token,
            backend_url=args.backend_url,
            headless=not args.headed,
            max_steps_override=args.max_steps,
        )
    )


if __name__ == "__main__":
    main()

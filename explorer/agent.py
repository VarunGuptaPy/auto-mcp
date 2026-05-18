"""
Exploration agent: drives a browser with Claude vision to map out an app's features.

How it works:
  1. Opens the target URL in a Playwright-controlled browser.
  2. Intercepts every network request/response (this becomes the "API spec").
  3. On each step: takes a screenshot + snapshot of interactive elements,
     asks Claude what to do next, executes the action, repeats.
  4. Optional login: if credentials are passed in, the agent will look for
     and use a login form before exploring.
  5. Stops when Claude reports "done" or when max_steps is reached.

Output: a trace.json with two parallel streams — UI actions taken by the
agent, and network calls those actions triggered. The analyzer correlates
these into a feature spec.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

import os

from openai import AsyncOpenAI
from playwright.async_api import async_playwright, Page, Request, Response


MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MAX_STEPS_DEFAULT = None  # runs until agent emits "done" or ask_user limit is hit


# --------------------------------------------------------------------------- #
# Data classes — structured records of what the agent saw and did
# --------------------------------------------------------------------------- #

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


# --------------------------------------------------------------------------- #
# Browser glue — capture network + extract a clickable-element snapshot
# --------------------------------------------------------------------------- #

# Injected each step. Tags every interactive element with a stable `data-aid`
# attribute so the model can reference them by ID instead of fragile selectors.
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

    Retries once if the execution context is destroyed mid-navigation.
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


def _record_network(trace: ExplorationTrace, page: Page) -> None:
    """Wire up Playwright network listeners to write into the trace."""
    pending: dict[str, NetworkCall] = {}

    def on_request(req: Request) -> None:
        try:
            body = req.post_data
        except Exception:
            body = None
        pending[req.url + ":" + req.method] = NetworkCall(
            timestamp=time.time(),
            method=req.method,
            url=req.url,
            status=None,
            request_headers=dict(req.headers),
            request_body=body,
            response_body_preview=None,
            resource_type=req.resource_type,
        )

    async def on_response(resp: Response) -> None:
        key = resp.url + ":" + resp.request.method
        call = pending.pop(key, None)
        if call is None:
            return
        call.status = resp.status
        try:
            text = await resp.text()
            call.response_body_preview = text[:2000]
        except Exception:
            call.response_body_preview = None
        trace.network.append(call)

    page.on("request", on_request)
    page.on("response", lambda r: asyncio.create_task(on_response(r)))


# --------------------------------------------------------------------------- #
# Planning loop — system prompt + context builder
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = """You are a thorough QA engineer and exploration agent mapping a web application owned by the user.
Your goal: discover EVERY feature, screen, and API endpoint the app exposes. Do not stop early.

You own the site. Be exhaustive. Act like a QA engineer on their first day — try everything.

═══════════════════════════════════════════════════════
AVAILABLE ACTIONS — reply with ONE JSON object only:
═══════════════════════════════════════════════════════

  {"action": "click",         "aid": "aid-12",                                    "reasoning": "..."}
  {"action": "type",          "aid": "aid-7",  "value": "hello",                  "reasoning": "..."}
  {"action": "select_option", "aid": "aid-9",  "value": "option_value_or_text",   "reasoning": "selecting from dropdown"}
  {"action": "navigate",      "url": "https://...",                                "reasoning": "..."}
  {"action": "scroll",        "direction": "down",                                 "reasoning": "..."}
  {"action": "hover",         "aid": "aid-3",                                      "reasoning": "hovering to reveal tooltip/dropdown"}
  {"action": "upload_file",   "aid": "aid-5",  "url": "https://example.com/img",  "reasoning": "uploading test file"}
  {"action": "wait",                                                                "reasoning": "page still loading"}
  {"action": "done",                                                                "reasoning": "explored all major features"}
  {"action": "auth_required", "fields": [{"name":"email","label":"Email"},{"name":"password","label":"Password"}], "reasoning": "..."}
  {"action": "ask_user",      "question": "...", "question_type": "text", "choices": [], "reasoning": "..."}

═══════════════════════════════════════════════════════
INPUT FILLING — how to handle every input type:
═══════════════════════════════════════════════════════

FILL YOURSELF (use "type" or "select_option" or "click"):
  text / search / textarea   → realistic data matching the field label (name, address, description…)
  email                      → "testuser@example.com"
  number                     → use the min value if shown, otherwise "1"
  date (type="date")         → today in YYYY-MM-DD format
  time (type="time")         → "10:00"
  datetime-local             → today at 10 AM in "YYYY-MM-DDTHH:MM" format
  month                      → current month as "YYYY-MM"
  week                       → current week as "YYYY-Www"
  url                        → "https://example.com"
  tel                        → "+1 555 000 0000"
  color (type="color")       → "#336699"
  range / slider             → leave at default or type midpoint value
  select (<select> element)  → use select_option with the first non-placeholder option
                               (skip options whose text is "Select…", "Choose…", "-- select --")
  checkbox / radio           → click to check/select (check "checked" field to avoid double-toggling)
  contenteditable div        → use "type" with realistic text

  FALLBACK: If you tried to fill a field and it rejected your value, or if the field label
  is ambiguous and context doesn't help, emit ask_user once describing the field and asking
  the owner what value to use. Do NOT loop on the same field without asking.

ASK USER IMMEDIATELY (do not attempt to fill these yourself):
  password / PIN / secret key / any authentication credential
    → if credentials are already in context, use them; otherwise emit auth_required (on a
      login page) or ask_user: "I need credentials for [field label]. Please provide them."
      NEVER invent, guess, or use placeholder passwords.
  type="file" / image picker / camera button / upload zone
    → emit ask_user with question_type "file_upload" AND include the "aid" of the
      <input type="file"> element (NOT a button or div wrapper):
      {"action":"ask_user","aid":"aid-5","question":"I found [label]. Please upload a suitable
      test file.","question_type":"file_upload","choices":[],"reasoning":"..."}
    CRITICAL: include "aid" pointing to the actual <input type="file"> element.
    The system will automatically call set_input_files on that element once you receive
    the file — do NOT emit ask_user for the same field again, do NOT emit upload_file
    separately. The upload is handled for you. Move on to the next action after asking.

    MULTI-FIELD UPLOAD FORMS (e.g. "Front of Card" + "Back of Card"):
    - Ask for each file field ONCE. Use a distinct "aid" per field.
    - After ALL required file fields are covered, IMMEDIATELY click the form's
      submit / confirm button (e.g. "Upload Card", "Submit", "Save"). Do NOT ask
      again for a field whose "aid" you already asked about — the system tracks it.
    - If the qa_history shows "[File already uploaded to element X]", that field
      is done. Click submit and move on.
  CAPTCHA / reCAPTCHA / hCaptcha / "I'm not a robot"
    → ask_user: "I found a CAPTCHA on this page. Can you solve it, or should I skip this
      flow and explore other features?"
  OTP / 2FA / verification code / SMS code
    → ask_user: "I need a one-time code for [field label]. Please provide the current code,
      or let me know if I should skip this."
  Signature pad (canvas-based draw-to-sign)
    → ask_user: "I found a signature input. Should I skip signing and submit anyway,
      or can you guide me?"
  QR scanner / barcode scanner
    → ask_user: "I found a QR/barcode scanner input. Please provide a value to enter
      manually, or let me know if I should skip it."
  Audio / video recorder
    → ask_user: "I found an audio/video recorder. Should I skip this input and continue?"
  Payment card fields (if filling with test data could cause a charge)
    → ask_user: "I found a payment form. Should I fill it with Stripe test card details
      (4242 4242 4242 4242), or skip it?"
  Map / location picker (custom interactive map, not a plain text address field)
    → ask_user: "I found a map-based location picker. Please provide coordinates or an
      address to search, or let me know if I should skip it."

═══════════════════════════════════════════════════════
EXPLORATION STRATEGY — follow these rules strictly:
═══════════════════════════════════════════════════════

ANTI-LOOP RULES (critical — read before every action):
  - Before clicking a checkbox or radio: check its "checked" field. If it is already in
    the state you want (true to check, false to uncheck), do NOT click it — move on.
  - If you just performed the same action on the same element in your last step, do NOT
    repeat it. If a loop warning appears in the context, STOP immediately and do something
    entirely different (scroll, navigate, click a different element, or ask_user).
  - If you have been on the same URL for 3+ steps without progress, scroll down to look
    for new content, or navigate away to an unexplored section.

DEPTH:
  - Visit EVERY navigation link, sidebar item, tab, and menu option.
  - For every grid or list of items (cards, events, folders, contacts, posts): click into
    AT LEAST ONE item to understand its detail view and available actions.
  - For every "Create", "Add", "New", "+ [thing]", "Upload" button: click it and try to
    complete the full form. Fill every input using the rules above.
  - After completing a create/add flow, go back and verify the new item appears.
  - Scroll down on every page before deciding you've seen all content.

HOVER & MENUS:
  - Hover over user avatars, icons, image thumbnails, and any element that might hide
    a dropdown or tooltip. After hovering, look for newly visible elements and click them.

DESTRUCTIVE / IRREVERSIBLE ACTIONS:
  - Before clicking "Delete", "Remove", "Cancel subscription", "Send to all", or any
    clearly destructive button: emit ask_user to confirm with the owner.

LIVE USER INSTRUCTIONS:
  - If the context begins with "🚨 STOP — USER INSTRUCTIONS", execute those instructions
    as your VERY NEXT action. Ignore your current plan until you have followed them.
  - User instructions take absolute priority over every other rule in this prompt.

ASK_USER GUIDELINES:
  - question_type: "text" (free text answer) or "choice" (pick from choices list).
  - Keep questions SHORT and SPECIFIC — one question per ask_user.
  - The consecutive ask_user limit is 10; after that emit done.
  - After receiving an answer, act on it immediately — do not ask the same question twice.

═══════════════════════════════════════════════════════
AUTHENTICATION:
═══════════════════════════════════════════════════════
  - If you reach a login page with NO credentials: emit auth_required with the exact fields.
  - Once credentials are provided: fill each field with "type", then click submit.
  - Do NOT emit auth_required again once credentials are already in context.
  - SIGNUP → LOGIN RECOVERY: if signup returns "already exists" / "taken" / "already registered"
    → emit ask_user explaining what happened, then navigate to the login page.
  - OAUTH / SSO (GitHub, Google, Apple, etc.): do NOT click the OAuth button. Emit ask_user:
    "I found a [Provider] OAuth button. Provide a pre-authenticated token/cookies, or should I
    skip OAuth and explore other features?"

═══════════════════════════════════════════════════════
STOPPING:
═══════════════════════════════════════════════════════
  - Before emitting "done", ALWAYS emit ask_user first:
      {"action": "ask_user", "question": "I've finished exploring all major features I could find.
      Is there anything specific you'd like me to explore further, or any feature I might have missed?",
      "question_type": "text", "choices": [], "reasoning": "Checking with user before stopping"}
  - Only emit "done" after the user has replied AND either:
    a. The user says they're satisfied / "no" / "looks good" / similar, OR
    b. You have acted on their additional instructions and asked again.
  - Never emit "done" without first giving the user a chance to respond.
  - Do NOT emit done just because you have run many steps. Keep going.
"""


def _build_user_message(
    url: str,
    elements: list[dict],
    history: list[UIAction],
    creds: dict | None,
    qa_history: list[dict] | None = None,
    visited_urls: set[str] | None = None,
    user_instructions: list[str] | None = None,
    loop_warning: str | None = None,
    code_context: list[str] | None = None,
) -> list[dict]:
    history_lines = [
        f"  step {a.step}: {a.action} {a.selector or ''} {a.value or ''} -- {a.reasoning}"
        for a in history[-20:]
    ]
    creds_blurb = ""
    if creds:
        lines = "\n".join(f"  {k}: {v}" for k, v in creds.items())
        creds_blurb = f"\nCredentials provided — use these to log in now:\n{lines}"
    else:
        creds_blurb = "\nNo credentials yet. Emit auth_required if a login form is visible."

    qa_blurb = ""
    if qa_history:
        pairs = "\n".join(f"  Q: {item['q']}\n  A: {item['a']}" for item in qa_history[-8:])
        qa_blurb = f"\nUser has answered your previous questions:\n{pairs}"

    visited_blurb = ""
    if visited_urls:
        urls_list = "\n".join(f"  {u}" for u in list(visited_urls)[-40:])
        visited_blurb = f"\nURLs already explored (avoid re-exploring, focus on new areas):\n{urls_list}"

    # User instructions go at the very TOP so the model sees them first
    instructions_blurb = ""
    if user_instructions:
        lines = "\n".join(f"  - {m}" for m in user_instructions[-10:])
        instructions_blurb = (
            f"🚨 STOP — USER INSTRUCTIONS (execute these FIRST before anything else):\n{lines}\n\n"
        )

    loop_blurb = ""
    if loop_warning:
        loop_blurb = f"\n⚠️  LOOP DETECTED: {loop_warning}\n"

    code_blurb = ""
    if code_context:
        snippets = "\n---\n".join(code_context[:3])
        code_blurb = f"\nRelevant source code (use as reference to understand this page's features and data shapes):\n{snippets}\n"

    text = f"""{instructions_blurb}Current URL: {url}

History so far (last 20 steps):
{chr(10).join(history_lines) or '  (none)'}
{loop_blurb}{creds_blurb}{qa_blurb}{visited_blurb}{code_blurb}

Visible interactive elements — use the `aid` to reference them:
{json.dumps(elements[:150], indent=2)}

What is your next action? Reply with ONE JSON object only — no prose, no markdown.
"""
    return [{"type": "text", "text": text}]


def _parse_action(raw: str) -> dict:
    """Strip code fences and parse the model's JSON action."""
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if not m:
        raise ValueError(f"No JSON object found in: {raw!r}")
    return json.loads(m.group(0))


# --------------------------------------------------------------------------- #
# Main entrypoint
# --------------------------------------------------------------------------- #

async def explore(
    url: str,
    creds: dict | None = None,
    max_steps: int | None = MAX_STEPS_DEFAULT,
    headless: bool = True,
    out_dir: Path | str = "trace_output",
    on_auth_required: Optional[Callable[[list[dict]], Awaitable[Optional[dict]]]] = None,
    on_question: Optional[Callable[[str, str, str, list], Awaitable[Optional[str]]]] = None,
    get_user_messages: Optional[Callable[[], list[str]]] = None,
    initial_instructions: list[str] | None = None,
    code_lookup: Optional[Callable[[str], list[str]]] = None,
) -> ExplorationTrace:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    shots_dir = out_dir / "screenshots"
    shots_dir.mkdir(exist_ok=True)

    client = AsyncOpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url=_DEEPSEEK_BASE_URL,
    )
    trace = ExplorationTrace(target_url=url, started_at=time.time())
    qa_history: list[dict] = []
    ask_user_streak = 0
    upload_streak = 0          # consecutive upload requests without other actions
    uploaded_aids: set[str] = set()  # aids where set_input_files already succeeded
    visited_urls: set[str] = set()
    user_instructions: list[str] = list(initial_instructions or [])  # seeded + live messages
    recent_actions: list[tuple[str, str]] = []  # (action_kind, aid) last 10

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
        _record_network(trace, page)

        await page.goto(url, wait_until="domcontentloaded")
        await _wait_stable(page)
        visited_urls.add(page.url)

        step_iter = range(max_steps) if max_steps is not None else __import__("itertools").count()
        for step in step_iter:
            # Drain any messages the user typed since the last step
            if get_user_messages:
                new_msgs = get_user_messages()
                if new_msgs:
                    user_instructions.extend(new_msgs)
                    print(f"[step {step}] {len(new_msgs)} user instruction(s) received")

            screenshot_b64, elements = await snapshot_page(page)
            shot_path = shots_dir / f"step_{step:03d}.png"
            shot_path.write_bytes(base64.standard_b64decode(screenshot_b64))

            # Query code index for snippets relevant to the current page
            step_code_context: list[str] | None = None
            if code_lookup:
                el_names = " ".join(
                    el.get("name") or el.get("placeholder") or ""
                    for el in elements[:40]
                    if el.get("name") or el.get("placeholder")
                )
                query = f"url: {page.url} {el_names}"
                try:
                    step_code_context = code_lookup(query) or None
                except Exception:
                    step_code_context = None

            # Detect repetitive actions on the same element
            loop_warning: str | None = None
            if len(recent_actions) >= 3:
                last3 = recent_actions[-3:]
                kinds = [k for k, _ in last3]
                aids  = [a for _, a in last3]
                if len(set(aids)) == 1 and aids[0] and all(k == "click" for k in kinds):
                    loop_warning = (
                        f"You have clicked '{aids[0]}' 3 times in a row. DO NOT click it again. "
                        "Check its 'checked' state — if already checked, move on to a different element or action."
                    )
                elif len(set(aids)) == 1 and aids[0] and len(set(kinds)) == 1:
                    loop_warning = (
                        f"You have performed '{kinds[0]}' on '{aids[0]}' 3 times in a row. "
                        "This is a loop. Choose a DIFFERENT element or action."
                    )

            text_parts = _build_user_message(
                page.url, elements, trace.actions, creds, qa_history, visited_urls,
                user_instructions if user_instructions else None,
                loop_warning,
                step_code_context,
            )
            text_block = next((p for p in text_parts if p.get("type") == "text"), {})

            resp = await client.chat.completions.create(
                model=MODEL,
                max_tokens=500,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text_block.get("text", "")},
                ],
            )
            raw = resp.choices[0].message.content or ""
            try:
                action = _parse_action(raw)
            except Exception as e:
                print(f"[step {step}] parse error: {e}; raw={raw!r}")
                break

            kind = action.get("action")
            reasoning = action.get("reasoning", "")
            print(f"[step {step}] {kind}  --  {reasoning}")

            ua = UIAction(
                timestamp=time.time(),
                step=step,
                action=kind,
                selector=action.get("aid"),
                value=action.get("value") or action.get("url") or action.get("direction"),
                reasoning=reasoning,
                screenshot_path=str(shot_path),
            )
            trace.actions.append(ua)

            if kind == "done":
                break

            # ---- auth_required ----
            if kind == "auth_required":
                if not creds and on_auth_required:
                    provided = await on_auth_required(action.get("fields", []))
                    if provided:
                        creds = provided
                elif creds:
                    print(f"[step {step}] auth_required ignored — creds already set")
                continue

            # ---- ask_user ----
            if kind == "ask_user":
                ask_user_streak += 1
                if ask_user_streak > 10:
                    print(f"[step {step}] ask_user limit reached — stopping")
                    break
                if on_question:
                    qid = f"q-{step}"
                    answer = await on_question(
                        qid,
                        action.get("question", "What should I do next?"),
                        action.get("question_type", "text"),
                        action.get("choices", []),
                    )
                    if answer:
                        qa_history.append({"q": action.get("question", ""), "a": answer})

                        # File upload: immediately execute set_input_files with the
                        # returned server path so the model never sees the open modal
                        # again and cannot loop back to ask_user for the same field.
                        if action.get("question_type") == "file_upload":
                            aid = action.get("aid", "")
                            if aid and aid in uploaded_aids:
                                # Already done — tell the agent so it moves on
                                ask_user_streak = 0
                                upload_streak = 0
                                qa_history.append({
                                    "q": action.get("question", ""),
                                    "a": f"[File already uploaded to element {aid}. "
                                         "Do NOT ask again — click the submit/confirm button now.]",
                                })
                            elif aid:
                                ask_user_streak = 0
                                upload_streak = 0
                                print(f"[step {step}] auto-upload {answer!r} → {aid}")
                                try:
                                    await _execute(page, {
                                        "action": "upload_file",
                                        "aid": aid,
                                        "path": answer,
                                    })
                                    uploaded_aids.add(aid)
                                    await _wait_stable(page)
                                    visited_urls.add(page.url)
                                except Exception as e:
                                    print(f"[step {step}] auto-upload error: {e}")
                continue

            # ---- upload_file — resolve server path from user if missing ----
            if kind == "upload_file":
                aid = action.get("aid", "")

                # Skip if this element was already uploaded successfully
                if aid and aid in uploaded_aids:
                    print(f"[step {step}] upload_file skipped — {aid} already uploaded")
                    qa_history.append({
                        "q": "file upload",
                        "a": f"[{aid} already has a file attached. Click the submit button now.]",
                    })
                    continue

                upload_streak += 1
                if upload_streak > 3:
                    # Prevent infinite upload loops — dismiss and move on
                    print(f"[step {step}] upload_file streak exceeded — dismissing")
                    upload_streak = 0
                    user_instructions.append(
                        "You have been stuck on an upload modal. "
                        "Press Cancel/Close or navigate away and explore other features."
                    )
                    continue

                file_path = action.get("path", "").strip()
                if not file_path and on_question:
                    qid = f"upload-{step}"
                    file_path = await on_question(
                        qid,
                        "I need to upload a file for this feature. Please upload a suitable "
                        "test file using the file picker below.",
                        "file_upload",
                        [],
                    )
                    if file_path:
                        qa_history.append({"q": "file upload needed", "a": file_path})
                if file_path:
                    ask_user_streak = 0
                    upload_streak = 0
                    try:
                        await _execute(page, {**action, "path": file_path})
                        if aid:
                            uploaded_aids.add(aid)
                    except Exception as e:
                        print(f"[step {step}] upload error: {e}")
                    await _wait_stable(page)
                    visited_urls.add(page.url)
                continue

            ask_user_streak = 0  # reset on any real action
            upload_streak = 0

            # Track recent (action, aid) to detect loops
            recent_actions.append((kind, action.get("aid", "")))
            if len(recent_actions) > 10:
                recent_actions.pop(0)

            try:
                await _execute(page, action)
            except Exception as e:
                print(f"[step {step}] execution error: {e}")

            await _wait_stable(page)
            visited_urls.add(page.url)

        await context.close()
        await browser.close()

    trace.ended_at = time.time()
    (out_dir / "trace.json").write_text(json.dumps(trace.to_dict(), indent=2))
    return trace


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


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--email", default=None)
    parser.add_argument("--password", default=None)
    parser.add_argument("--max-steps", type=int, default=MAX_STEPS_DEFAULT)
    parser.add_argument("--headed", action="store_true", help="Show the browser")
    parser.add_argument("--out", default="trace_output")
    args = parser.parse_args()

    creds = None
    if args.email and args.password:
        creds = {"email": args.email, "password": args.password}

    asyncio.run(explore(
        url=args.url,
        creds=creds,
        max_steps=args.max_steps,
        headless=not args.headed,
        out_dir=args.out,
    ))
    print(f"\nTrace written to {args.out}/trace.json")

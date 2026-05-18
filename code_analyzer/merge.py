"""
Merges a browser-exploration feature spec with code-derived route information
into a single comprehensive feature spec.

Uses the vector store to pull relevant code snippets per route group instead
of sending all source code to the LLM — this keeps context manageable even
for large repos.
"""

from __future__ import annotations

import json
import os
import re

from openai import OpenAI

MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"

MERGE_SYSTEM = """You are an API analyst and MCP architect. You will receive:
  1. A feature spec derived from browser network-traffic observation.
  2. A list of routes found by statically analysing the application source code.
  3. Relevant code snippets for those routes.

Your job: produce ONE comprehensive JSON feature spec that covers EVERY route
from both sources. Use browser data for realistic request/response examples;
use code data to discover routes the browser missed, to fill in schemas, and
to decide whether a feature is better implemented as direct Python code
rather than an HTTP proxy.

Output ONE JSON object — no markdown, no prose:

{
  "product_name": "...",
  "base_url": "https://...",
  "auth": {"type": "cookie|bearer|api_key|none", "notes": "..."},
  "env_vars": [
    {"name": "ENV_VAR_NAME", "required": true, "description": "..."}
  ],
  "features": [
    {
      "id": "snake_case_id",
      "name": "Human readable name",
      "description": "What a user accomplishes. 1-2 sentences.",
      "source": "browser|code|both",
      "implementation_type": "http_proxy|direct_code",
      "code_snippet": "...",
      "code_imports": ["import json"],
      "endpoint": {
        "method": "GET|POST|PUT|DELETE|PATCH",
        "url_template": "https://host/path/{id}",
        "query_params": [{"name": "...", "type": "string", "required": false}],
        "body_schema": {"type": "object", "properties": {...}}
      },
      "returns": "Short description of what the response contains."
    }
  ]
}

Rules:
- Include ALL routes from the code, even ones the browser never visited.
- Merge browser and code entries for the same endpoint into one feature.
- feature ids must be unique, snake_case, valid Python identifiers.
- Skip pure static-asset endpoints (CSS, JS bundles, images).
- Keep env_vars only for variables that the MCP server will actually need
  (auth tokens, API keys, etc.), not build-time frontend variables.

implementation_type rules — read carefully:
  "http_proxy" (default): the MCP tool forwards the call to the HTTP endpoint.
    Set endpoint to the URL. Set code_snippet and code_imports to null.
  "direct_code": use when the feature can be implemented more accurately or
    completely in Python directly — e.g. pure business logic, data transforms,
    algorithms, SDK calls, or features with no clean HTTP endpoint.
    When you choose direct_code:
    - Set code_snippet to a COMPLETE, RUNNABLE Python function BODY (no def
      line, just the indented body). It must end with a `return` statement
      that returns a string. Use only the args dict for inputs.
    - Set code_imports to a list of import lines the body needs.
    - Set endpoint to null.
    - Only choose direct_code when you can produce a working implementation
      from the provided code snippets. If uncertain, use http_proxy.
"""


def merge_analysis(
    browser_spec: dict,
    code_routes: list,
    vector_store,
    target_url: str,
    detected_env_vars: list | None = None,
) -> dict:
    """
    Parameters
    ----------
    browser_spec : dict
        Output of analyzer.analyze() — the spec derived from browser traffic.
    code_routes : list[Route]
        Routes extracted by code_analyzer.route_extractor.
    vector_store : CodeVectorStore
        Indexed code for context retrieval.
    target_url : str
        The URL the browser explored.
    detected_env_vars : list[EnvVar] | None
        Variables detected by env_detector.detect_env_vars().
    """
    # ---- Code routes summary -------------------------------------------- #
    route_lines: list[str] = []
    for r in code_routes:
        line = f"  [{r.framework.upper()}] {r.method:7s} {r.path}  →  {r.handler_name}()  ({r.file_path})"
        if r.docstring:
            line += f"\n    doc: {r.docstring[:200]}"
        route_lines.append(line)
    routes_text = "\n".join(route_lines) or "  (none found)"

    # ---- Retrieve relevant code snippets --------------------------------- #
    # Per-route: fetch handler body + request/response shapes
    seen_chunks: set[str] = set()
    context_chunks: list[str] = []
    for r in code_routes[:40]:
        for query in [
            f"{r.handler_name} {r.method} {r.path}",
            f"{r.handler_name} implementation business logic",
            f"{r.method} {r.path} request response schema",
        ]:
            for chunk in vector_store.query(query, n_results=3):
                if chunk not in seen_chunks:
                    seen_chunks.add(chunk)
                    context_chunks.append(chunk)

    # Broad pass: discover utility/helper logic not tied to a specific route
    for query in [
        "utility helper pure function data transform",
        "business logic calculation algorithm",
        "class service model schema validation",
    ]:
        for chunk in vector_store.query(query, n_results=4):
            if chunk not in seen_chunks:
                seen_chunks.add(chunk)
                context_chunks.append(chunk)

    code_context = "\n\n---\n\n".join(context_chunks[:40])

    # ---- Env vars -------------------------------------------------------- #
    env_lines: list[str] = []
    for v in (detected_env_vars or []):
        tag = "(required, no default)" if v.required else f"(default: {v.default!r})"
        env_lines.append(f"  {v.name} {tag}  {v.description}")
    env_text = "\n".join(env_lines) or "  (none detected)"

    # ---- Build prompt ---------------------------------------------------- #
    browser_spec_json = json.dumps(browser_spec, indent=2)
    if len(browser_spec_json) > 10_000:
        browser_spec_json = browser_spec_json[:10_000] + "\n... [truncated]"

    if len(code_context) > 14_000:
        code_context = code_context[:14_000] + "\n... [truncated]"

    user_msg = f"""Target URL: {target_url}

=== BROWSER-OBSERVED FEATURE SPEC ===
{browser_spec_json}

=== ROUTES FOUND IN SOURCE CODE ===
{routes_text}

=== DETECTED ENVIRONMENT VARIABLES ===
{env_text}

=== RELEVANT CODE SNIPPETS ===
{code_context}

Produce the merged, comprehensive feature spec JSON.
"""

    client = OpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url=_DEEPSEEK_BASE_URL,
    )
    resp = client.chat.completions.create(
        model=MODEL,
        max_tokens=8000,
        messages=[
            {"role": "system", "content": MERGE_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)

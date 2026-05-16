"""
Analyzer: turns an exploration trace into a structured feature spec.

Two-pass approach:
  1. Mechanical pass — group network calls by (method, path-template).
     This gives us the raw API surface without any LLM cost.
  2. Semantic pass — ask Claude to look at the grouped endpoints + the UI
     actions that triggered them, and produce a human-readable feature
     spec with: name, description, inputs, outputs, auth requirement.

The output is the contract the MCP generator works against.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from pathlib import Path
from urllib.parse import urlparse, parse_qsl

import os

from openai import OpenAI

MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"


# --------------------------------------------------------------------------- #
# Endpoint grouping
# --------------------------------------------------------------------------- #

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
LONG_HEX_RE = re.compile(r"^[0-9a-f]{16,}$", re.I)
NUMERIC_RE = re.compile(r"^\d+$")


def _templatize_segment(seg: str) -> str:
    """Replace likely IDs in a path segment with `{id}`."""
    if not seg:
        return seg
    if NUMERIC_RE.match(seg):
        return "{id}"
    if UUID_RE.match(seg):
        return "{uuid}"
    if LONG_HEX_RE.match(seg):
        return "{hash}"
    return seg


def templatize_path(path: str) -> str:
    parts = path.split("/")
    return "/".join(_templatize_segment(p) for p in parts)


@dataclass
class EndpointGroup:
    method: str
    host: str
    path_template: str
    sample_urls: list[str] = field(default_factory=list)
    sample_request_bodies: list[str] = field(default_factory=list)
    sample_response_previews: list[str] = field(default_factory=list)
    query_params_seen: set[str] = field(default_factory=set)
    triggering_actions: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["query_params_seen"] = sorted(self.query_params_seen)
        # Keep payload samples small
        d["sample_request_bodies"] = self.sample_request_bodies[:3]
        d["sample_response_previews"] = self.sample_response_previews[:3]
        d["sample_urls"] = self.sample_urls[:3]
        return d


def group_endpoints(trace: dict) -> list[EndpointGroup]:
    """Bucket network calls into (method, host, path-template) groups."""
    groups: dict[tuple, EndpointGroup] = {}

    # Build an action lookup so we can correlate by timestamp
    actions = trace.get("actions", [])

    for call in trace.get("network", []):
        url = call["url"]
        parsed = urlparse(url)
        # Skip third-party telemetry/analytics
        if any(x in parsed.netloc for x in ("google-analytics", "googletagmanager",
                                             "segment.io", "mixpanel", "sentry",
                                             "datadog", "doubleclick", "facebook")):
            continue

        path_t = templatize_path(parsed.path)
        key = (call["method"], parsed.netloc, path_t)
        g = groups.get(key)
        if g is None:
            g = EndpointGroup(method=call["method"], host=parsed.netloc, path_template=path_t)
            groups[key] = g

        g.sample_urls.append(url)
        if call.get("request_body"):
            g.sample_request_bodies.append(call["request_body"])
        if call.get("response_body_preview"):
            g.sample_response_previews.append(call["response_body_preview"])
        for k, _ in parse_qsl(parsed.query):
            g.query_params_seen.add(k)

        # Best-effort: attach the most recent UI action before this call's timestamp
        ts = call["timestamp"]
        prior = [a for a in actions if a["timestamp"] <= ts]
        if prior:
            last = prior[-1]
            g.triggering_actions.append({
                "step": last["step"],
                "action": last["action"],
                "value": last.get("value"),
                "reasoning": last.get("reasoning"),
            })

    return list(groups.values())


# --------------------------------------------------------------------------- #
# Semantic pass — Claude turns endpoint groups into a feature spec
# --------------------------------------------------------------------------- #

ANALYZER_SYSTEM = """You are an API analyst. You are given:
  1. A list of HTTP endpoints observed while a user explored a web app,
     each with sample request bodies, sample responses, and the UI actions
     that triggered them.
  2. The original target URL.

Your job is to produce a JSON feature spec that an MCP server generator can
consume. Output ONE JSON object with this shape — no markdown, no prose:

{
  "product_name": "...",
  "base_url": "https://...",
  "auth": {"type": "cookie|bearer|none", "notes": "..."},
  "features": [
    {
      "id": "snake_case_id",
      "name": "Human readable name",
      "description": "What a user accomplishes with this. 1-2 sentences.",
      "endpoint": {
        "method": "GET|POST|...",
        "url_template": "https://host/path/{id}",
        "query_params": [{"name": "...", "type": "string", "required": false}],
        "body_schema": {"type": "object", "properties": {...}}  // or null
      },
      "returns": "Short description of what the response contains."
    }
  ]
}

Rules:
  - Skip pure asset endpoints (CSS, JS, fonts, images).
  - Skip duplicate health-check / telemetry endpoints.
  - Merge endpoints that are clearly the same feature called twice.
  - Infer body schemas from sample request bodies. Use null when unclear.
  - Feature IDs must be unique snake_case identifiers usable as tool names.
  - Only include features that look like real user-facing capabilities.
"""


def analyze(trace_path: str | Path, out_path: str | Path | None = None) -> dict:
    trace_path = Path(trace_path)
    trace = json.loads(trace_path.read_text())

    groups = group_endpoints(trace)
    grouped_payload = [g.to_dict() for g in groups]

    # Trim payload aggressively — Claude doesn't need every byte of every body
    for g in grouped_payload:
        g["sample_response_previews"] = [
            (p[:400] if p else None) for p in g["sample_response_previews"]
        ]

    user_msg = f"""Target URL: {trace['target_url']}

Observed endpoint groups ({len(grouped_payload)} total):
{json.dumps(grouped_payload, indent=2)}

Produce the feature spec JSON.
"""

    client = OpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url=_DEEPSEEK_BASE_URL,
    )
    resp = client.chat.completions.create(
        model=MODEL,
        max_tokens=4000,
        messages=[
            {"role": "system", "content": ANALYZER_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    spec = json.loads(raw)

    if out_path:
        Path(out_path).write_text(json.dumps(spec, indent=2))
    return spec


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("trace", help="Path to trace.json from the explorer")
    parser.add_argument("--out", default="feature_spec.json")
    args = parser.parse_args()
    spec = analyze(args.trace, args.out)
    print(f"Wrote {args.out}: {len(spec.get('features', []))} features")

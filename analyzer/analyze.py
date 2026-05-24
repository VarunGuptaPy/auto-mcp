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


async def analyze_v2(
    trace_path: str | Path,
    out_dir: str | Path,
    question_callback,
    code_routes: list | None = None,
    vector_store=None,
) -> dict:
    """
    Enhanced analysis pipeline with site mapping, feature classification,
    targeted Q&A, and code reconstruction for features without endpoints.

    Args:
        trace_path: Path to trace.json from the explorer.
        out_dir: Job directory (site_map.json and feature_spec.json written here).
        question_callback: Async callable with signature:
            async def _ask(question_id, text, question_type, fields=None,
                           choices=None, feature_context=None) -> str | dict | None
        code_routes: Optional list of routes from static code analysis.
        vector_store: Optional CodeVectorStore for code-context hints.

    Returns:
        feature_spec dict (also written to out_dir/feature_spec.json).
    """
    import uuid
    from analyzer.site_mapper import build_site_map
    from analyzer.feature_classifier import classify_all
    from analyzer.question_generator import generate_questions, get_secret_fields
    from analyzer.reconstructor import reconstruct

    trace_path = Path(trace_path)
    out_dir = Path(out_dir)

    # ------------------------------------------------------------------ #
    # 2a: Build site map
    # ------------------------------------------------------------------ #
    site_map = build_site_map(trace_path, out_dir)

    # ------------------------------------------------------------------ #
    # 2b: Classify features
    # ------------------------------------------------------------------ #
    classify_all(site_map, vector_store)

    all_features = [f for p in site_map.pages for f in p.features]

    # ------------------------------------------------------------------ #
    # 2c: Generate question plans for reconstruction features
    # ------------------------------------------------------------------ #
    shared_answers: dict[str, str] = {}
    plans = generate_questions(all_features, shared_answers)

    answers_by_feature: dict[str, dict[str, str]] = {}

    for plan in plans:
        feature_context = {
            "feature_id": plan.feature_id,
            "feature_name": plan.feature_name,
            "feature_type": plan.feature_type,
        }
        feature_answers: dict[str, str] = {}

        for q in plan.questions:
            # Check if this question's answer is shared from a prior feature
            shared_key = f"{plan.feature_type}:{q.id_suffix}"
            if shared_key in shared_answers and q.id_suffix not in (
                "behavior_description", "db_table", "db_fields", "db_operation",
                "ai_system_prompt", "ai_input_field", "file_operation_type",
                "auth_detail", "ws_purpose",
            ):
                feature_answers[q.id_suffix] = shared_answers[shared_key]
                continue

            qid = f"reconstruct-{plan.feature_id}-{q.id_suffix}-{uuid.uuid4().hex[:6]}"
            answer = await question_callback(
                qid,
                q.render_text(plan.feature_name),
                q.question_type,
                None,
                q.choices if q.choices else None,
                feature_context,
            )

            if answer:
                ans_str = answer if isinstance(answer, str) else str(answer)
                feature_answers[q.id_suffix] = ans_str
                # Share category-level answers (e.g. db_type applies to all db features)
                if q.id_suffix in ("db_type", "ai_provider", "auth_provider", "storage_provider"):
                    shared_answers[shared_key] = ans_str

        answers_by_feature[plan.feature_id] = feature_answers

    # ------------------------------------------------------------------ #
    # Collect secrets in a single batch at the end
    # ------------------------------------------------------------------ #
    secret_fields = get_secret_fields(plans, answers_by_feature)
    user_secrets: dict[str, str] = {}
    if secret_fields:
        secret_qid = f"secrets-{uuid.uuid4().hex[:8]}"
        secret_answer = await question_callback(
            secret_qid,
            "Almost done! I need the following secrets to generate working code. "
            "These are written only to the local .env file — never stored or logged.",
            "env_vars",
            secret_fields,
            None,
            None,
        )
        if secret_answer and isinstance(secret_answer, dict):
            user_secrets = secret_answer

    # ------------------------------------------------------------------ #
    # 2d: Reconstruct implementations
    # ------------------------------------------------------------------ #
    reconstruction_results: dict[str, dict] = {}
    for plan in plans:
        answers = answers_by_feature.get(plan.feature_id, {})
        # Find the feature object
        feature_obj = next(
            (f for p in site_map.pages for f in p.features if f.feature_id == plan.feature_id),
            None,
        )
        if feature_obj is None:
            continue
        result = reconstruct(feature_obj, answers, user_secrets)
        reconstruction_results[plan.feature_id] = result

    # ------------------------------------------------------------------ #
    # 2e: Build final feature_spec — merge endpoint + reconstructed features
    # ------------------------------------------------------------------ #
    # Use existing analyze() for endpoint-backed features
    endpoint_spec = analyze(trace_path, None)

    # Build lookup: feature_id → spec entry from endpoint analysis
    endpoint_features = {f["id"]: f for f in endpoint_spec.get("features", [])}

    final_features: list[dict] = []
    seen_ids: set[str] = set()

    # Add reconstructed features first (they're the new ones)
    for plan in plans:
        if plan.feature_id in seen_ids:
            continue
        seen_ids.add(plan.feature_id)
        feature_obj = next(
            (f for p in site_map.pages for f in p.features if f.feature_id == plan.feature_id),
            None,
        )
        recon = reconstruction_results.get(plan.feature_id, {})
        entry: dict = {
            "id": plan.feature_id,
            "name": plan.feature_name,
            "description": feature_obj.description if feature_obj else plan.feature_name,
            "implementation_type": recon.get("implementation_type", "reconstructed"),
            "feature_type": plan.feature_type,
            "source": "reconstructed",
            "returns": "Result of the operation.",
            "endpoint": None,
            "code_snippet": recon.get("code_snippet"),
            "code_imports": recon.get("code_imports", []),
            "env_vars_needed": recon.get("env_vars_needed", []),
            "reconstruction_answers": recon.get("reconstruction_answers", {}),
        }
        final_features.append(entry)

    # Add endpoint features
    for f in endpoint_spec.get("features", []):
        if f["id"] in seen_ids:
            continue
        seen_ids.add(f["id"])
        f["source"] = "browser"
        f["feature_type"] = "api_endpoint"
        final_features.append(f)

    # Collect all env_vars across reconstructed features
    all_env_vars: list[dict] = []
    seen_env: set[str] = set()
    for f in final_features:
        for ev in f.get("env_vars_needed", []):
            if ev["name"] not in seen_env:
                seen_env.add(ev["name"])
                all_env_vars.append(ev)

    spec = {
        "product_name": endpoint_spec.get("product_name", site_map.product_name),
        "base_url": endpoint_spec.get("base_url", site_map.target_url),
        "auth": endpoint_spec.get("auth", {"type": "none", "notes": ""}),
        "features": final_features,
        "env_vars": all_env_vars,
        "site_map_summary": {
            "pages": len(site_map.pages),
            "total_features": site_map.total_features,
            "features_with_endpoints": site_map.features_with_endpoints,
            "features_reconstructed": len(reconstruction_results),
        },
    }

    # Merge user secrets into user_env file so generate() picks them up
    if user_secrets:
        user_env_path = out_dir / "user_env.json"
        existing: dict = {}
        if user_env_path.exists():
            try:
                existing = json.loads(user_env_path.read_text())
            except Exception:
                pass
        existing.update(user_secrets)
        user_env_path.write_text(json.dumps(existing, indent=2))

    (out_dir / "feature_spec.json").write_text(json.dumps(spec, indent=2))
    return spec


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("trace", help="Path to trace.json from the explorer")
    parser.add_argument("--out", default="feature_spec.json")
    args = parser.parse_args()
    spec = analyze(args.trace, args.out)
    print(f"Wrote {args.out}: {len(spec.get('features', []))} features")

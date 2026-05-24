"""
Site Mapper: builds a semantic map of every page and feature visited during exploration.

Processes trace.json output from the explorer — groups actions by URL transitions,
correlates network calls to each page, and calls DeepSeek once per page to produce
a structured list of discovered features (with or without endpoints).

Output: site_map.json written to the job directory.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from openai import OpenAI

MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"

FeatureType = Literal[
    "api_endpoint",
    "database_query",
    "ai_generation",
    "computation",
    "auth_action",
    "file_operation",
    "websocket",
    "unknown",
]

UITrigger = Literal[
    "page_load", "button_click", "form_submit", "navigation", "scroll", "unknown"
]


@dataclass
class DiscoveredFeature:
    feature_id: str
    name: str
    description: str
    page_url: str
    ui_trigger: str
    triggering_element: str | None
    has_endpoint: bool
    endpoint_refs: list[str] = field(default_factory=list)
    feature_type: str = "unknown"
    classification_confidence: float = 0.0
    classification_notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DiscoveredPage:
    url: str
    title: str
    description: str
    features: list[DiscoveredFeature] = field(default_factory=list)
    visited_at_step: int = 0

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


@dataclass
class SiteMap:
    target_url: str
    product_name: str
    pages: list[DiscoveredPage] = field(default_factory=list)
    total_features: int = 0
    features_with_endpoints: int = 0
    features_needing_reconstruction: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- #
# LLM prompt for page analysis
# --------------------------------------------------------------------------- #

SITE_MAPPER_SYSTEM = """You are a product analyst reviewing an exploration trace of a web application.
You will be given context about a single page: the URL, a list of actions taken on this page,
and the network calls that fired while on this page.

Your task: identify every user-facing feature or capability visible or reachable on this page.

For each feature, produce:
- feature_id: snake_case unique identifier (e.g. "search_products", "create_order")
- name: Human-readable name (e.g. "Search Products")
- description: One sentence describing what a user accomplishes with this feature
- ui_trigger: one of page_load | button_click | form_submit | navigation | scroll | unknown
- triggering_element: the button label, form name, or link text that triggers it (null if page_load)
- has_endpoint: true if one of the provided network calls clearly corresponds to this feature
- endpoint_refs: list of "METHOD /path" strings for matching network calls (empty if none)
- feature_type: your best classification of the backend implementation type:
    - "api_endpoint": clear HTTP endpoint found — straightforward proxy
    - "database_query": feature reads/writes structured data (search, list, filter, CRUD)
    - "ai_generation": feature uses an AI/LLM (chat, summarize, generate text/image)
    - "computation": pure client-side calculation or formatting
    - "auth_action": login, logout, signup, password reset
    - "file_operation": upload, download, file storage
    - "websocket": real-time streaming, live chat, notifications
    - "unknown": cannot determine
- classification_confidence: 0.0 to 1.0 (how confident you are in feature_type)
- classification_notes: one sentence explaining your reasoning

Signs of database_query: data grids, search boxes returning structured rows, pagination controls,
CRUD forms (create/edit/delete), filters/sorting.
Signs of ai_generation: chat interfaces, text-generation forms, summarize buttons, image generation.
Signs of auth_action: login/signup forms, password reset, OAuth buttons (Google, GitHub, etc.)
Signs of file_operation: file upload areas, download buttons, image/document management.
Signs of websocket: live feeds, real-time chat, notification bells, "typing..." indicators.

Output ONE JSON object per page:
{
  "url": "https://...",
  "title": "Page Title",
  "description": "What this page is for — 1 sentence",
  "features": [
    {
      "feature_id": "snake_case_id",
      "name": "Human Name",
      "description": "What the user accomplishes",
      "ui_trigger": "button_click",
      "triggering_element": "Search button",
      "has_endpoint": true,
      "endpoint_refs": ["GET /api/search"],
      "feature_type": "api_endpoint",
      "classification_confidence": 0.95,
      "classification_notes": "Network call GET /api/search fires on form submit"
    }
  ]
}

Rules:
- Skip purely navigational features (clicking a link that just changes URL with no data)
- Merge features that are the same action seen twice
- Feature IDs must be unique within this page
- No markdown, no prose outside the JSON object
"""


def _group_actions_by_page(trace: dict) -> list[dict]:
    """Group trace actions into page segments by URL transitions."""
    actions = trace.get("actions", [])
    network = trace.get("network", [])
    target_url = trace.get("target_url", "")

    if not actions:
        return []

    pages: list[dict] = []
    current_url = target_url
    current_actions: list[dict] = []
    current_start_step = 0

    for action in actions:
        if action.get("action") == "navigate" and action.get("value") != current_url:
            if current_actions:
                pages.append({
                    "url": current_url,
                    "actions": current_actions,
                    "start_step": current_start_step,
                })
            current_url = action.get("value") or current_url
            current_actions = [action]
            current_start_step = action.get("step", 0)
        else:
            current_actions.append(action)

    if current_actions:
        pages.append({
            "url": current_url,
            "actions": current_actions,
            "start_step": current_start_step,
        })

    # Attach network calls to each page based on timestamp overlap
    for i, page in enumerate(pages):
        page_start = page["actions"][0]["timestamp"]
        page_end = (
            pages[i + 1]["actions"][0]["timestamp"] if i + 1 < len(pages) else float("inf")
        )
        page["network"] = [
            c for c in network if page_start <= c.get("timestamp", 0) < page_end
        ]

    return pages


def _format_page_context(page: dict) -> str:
    """Format a page's context for the LLM prompt."""
    lines: list[str] = [f"URL: {page['url']}"]

    lines.append("\nActions taken on this page:")
    for a in page["actions"][:30]:  # cap to avoid huge prompts
        action = a.get("action", "")
        reasoning = a.get("reasoning", "")
        value = a.get("value") or a.get("selector") or ""
        if action in ("navigate", "done", "auth_required"):
            continue
        line = f"  Step {a.get('step', '?')}: {action}"
        if value:
            line += f" → {str(value)[:60]}"
        if reasoning:
            line += f" | {str(reasoning)[:100]}"
        lines.append(line)

    lines.append(f"\nNetwork calls that fired on this page ({len(page['network'])} total):")
    for c in page["network"][:20]:
        parsed = urlparse(c["url"])
        resp_preview = (c.get("response_body_preview") or "")[:120]
        line = f"  {c['method']} {parsed.path}"
        if resp_preview:
            line += f" → {resp_preview[:100]}"
        lines.append(line)

    return "\n".join(lines)


def _dedupe_pages(pages: list[DiscoveredPage]) -> list[DiscoveredPage]:
    """Merge pages with the same normalized URL."""
    seen: dict[str, DiscoveredPage] = {}
    for page in pages:
        key = _normalize_url(page.url)
        if key not in seen:
            seen[key] = page
        else:
            # Merge features
            existing_ids = {f.feature_id for f in seen[key].features}
            for f in page.features:
                if f.feature_id not in existing_ids:
                    seen[key].features.append(f)
    return list(seen.values())


def _normalize_url(url: str) -> str:
    parsed = urlparse(url)
    # Replace numeric IDs and UUIDs in path with placeholders for dedup
    path = re.sub(r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/{uuid}", parsed.path)
    path = re.sub(r"/\d+", "/{id}", path)
    return f"{parsed.netloc}{path}"


def _llm_analyze_page(client: OpenAI, page_context: str, page_url: str) -> dict | None:
    """Call DeepSeek to analyze one page and return structured JSON."""
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": SITE_MAPPER_SYSTEM},
                {"role": "user", "content": page_context},
            ],
        )
        raw = (resp.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        return json.loads(raw)
    except Exception:
        return None


def build_site_map(trace_path: str | Path, out_dir: str | Path | None = None) -> SiteMap:
    """
    Build a SiteMap from a trace.json file.

    Args:
        trace_path: Path to trace.json from the explorer.
        out_dir: If provided, writes site_map.json here.

    Returns:
        SiteMap dataclass instance.
    """
    trace_path = Path(trace_path)
    trace = json.loads(trace_path.read_text())

    client = OpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url=_DEEPSEEK_BASE_URL,
    )

    page_groups = _group_actions_by_page(trace)
    discovered_pages: list[DiscoveredPage] = []

    for page_group in page_groups:
        # Skip pages with no meaningful actions
        meaningful_actions = [
            a for a in page_group["actions"]
            if a.get("action") not in ("navigate", "done")
        ]
        if not meaningful_actions and not page_group["network"]:
            continue

        context = _format_page_context(page_group)
        page_data = _llm_analyze_page(client, context, page_group["url"])

        if not page_data:
            # Fallback: create a minimal page entry from network calls
            page = DiscoveredPage(
                url=page_group["url"],
                title="",
                description="",
                visited_at_step=page_group.get("start_step", 0),
            )
            for call in page_group["network"][:5]:
                parsed = urlparse(call["url"])
                feat = DiscoveredFeature(
                    feature_id=f"endpoint_{call['method'].lower()}_{parsed.path.replace('/', '_').strip('_')}"[:40],
                    name=f"{call['method']} {parsed.path}",
                    description=f"HTTP {call['method']} request to {parsed.path}",
                    page_url=page_group["url"],
                    ui_trigger="unknown",
                    triggering_element=None,
                    has_endpoint=True,
                    endpoint_refs=[f"{call['method']} {parsed.path}"],
                    feature_type="api_endpoint",
                    classification_confidence=0.8,
                    classification_notes="Directly observed network call",
                )
                page.features.append(feat)
            discovered_pages.append(page)
            continue

        features = []
        for f_data in page_data.get("features", []):
            feat = DiscoveredFeature(
                feature_id=f_data.get("feature_id", "unknown"),
                name=f_data.get("name", "Unknown Feature"),
                description=f_data.get("description", ""),
                page_url=page_data.get("url", page_group["url"]),
                ui_trigger=f_data.get("ui_trigger", "unknown"),
                triggering_element=f_data.get("triggering_element"),
                has_endpoint=bool(f_data.get("has_endpoint", False)),
                endpoint_refs=f_data.get("endpoint_refs", []),
                feature_type=f_data.get("feature_type", "unknown"),
                classification_confidence=float(f_data.get("classification_confidence", 0.5)),
                classification_notes=f_data.get("classification_notes", ""),
            )
            features.append(feat)

        page = DiscoveredPage(
            url=page_data.get("url", page_group["url"]),
            title=page_data.get("title", ""),
            description=page_data.get("description", ""),
            features=features,
            visited_at_step=page_group.get("start_step", 0),
        )
        discovered_pages.append(page)

    # Deduplicate pages with similar URLs
    discovered_pages = _dedupe_pages(discovered_pages)

    # Compute summary stats
    all_features = [f for p in discovered_pages for f in p.features]
    with_endpoints = sum(1 for f in all_features if f.has_endpoint)
    needing_reconstruction = sum(
        1 for f in all_features
        if not f.has_endpoint and f.feature_type not in ("api_endpoint", "computation")
    )

    # Infer product name from target URL
    parsed_target = urlparse(trace.get("target_url", ""))
    product_name = parsed_target.netloc.split(".")[0].title() if parsed_target.netloc else "App"

    site_map = SiteMap(
        target_url=trace.get("target_url", ""),
        product_name=product_name,
        pages=discovered_pages,
        total_features=len(all_features),
        features_with_endpoints=with_endpoints,
        features_needing_reconstruction=needing_reconstruction,
    )

    if out_dir:
        out_path = Path(out_dir) / "site_map.json"
        out_path.write_text(json.dumps(site_map.to_dict(), indent=2))

    return site_map


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("trace", help="Path to trace.json")
    parser.add_argument("--out", default=".", help="Output directory for site_map.json")
    args = parser.parse_args()
    sm = build_site_map(args.trace, args.out)
    print(f"Site map: {len(sm.pages)} pages, {sm.total_features} features "
          f"({sm.features_with_endpoints} with endpoints, "
          f"{sm.features_needing_reconstruction} needing reconstruction)")

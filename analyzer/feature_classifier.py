"""
Feature Classifier: determines the implementation type for each discovered feature.

Two-pass approach:
1. Deterministic heuristics (no LLM cost) — catches obvious cases.
2. LLM batch call for ambiguous cases (confidence < 0.7 or type == "unknown").

Updates DiscoveredFeature.feature_type and classification_confidence in place.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from openai import OpenAI

MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"


# --------------------------------------------------------------------------- #
# Deterministic heuristics
# --------------------------------------------------------------------------- #

_AUTH_KEYWORDS = re.compile(
    r"\b(login|log in|sign in|signin|signup|sign up|register|logout|log out|"
    r"password|forgot password|reset password|oauth|verify email|2fa|two-factor)\b",
    re.IGNORECASE,
)

_AI_KEYWORDS = re.compile(
    r"\b(chat|generate|summarize|summarise|suggest|ai|gpt|llm|openai|anthropic|"
    r"claude|gemini|cohere|huggingface|assistant|copilot|autocomplete|completion)\b",
    re.IGNORECASE,
)

_FILE_KEYWORDS = re.compile(
    r"\b(upload|download|attach|file|image|photo|document|pdf|csv|import|export|"
    r"drag.?and.?drop|dropzone)\b",
    re.IGNORECASE,
)

_DB_KEYWORDS = re.compile(
    r"\b(search|filter|sort|list|table|grid|results|records|entries|query|find|"
    r"browse|catalog|directory|index|pagination|page \d+)\b",
    re.IGNORECASE,
)

_COMPUTE_KEYWORDS = re.compile(
    r"\b(calculate|compute|convert|format|preview|validate|estimate|price|total|"
    r"sum|percentage|rate|render)\b",
    re.IGNORECASE,
)

_WS_KEYWORDS = re.compile(
    r"\b(live|real.?time|realtime|stream|streaming|typing|notifications|feed|"
    r"broadcast|subscribe|push|socket|websocket)\b",
    re.IGNORECASE,
)

_AI_RESPONSE_PATTERNS = re.compile(
    r'"(model|usage|choices|finish_reason|content|tokens|prompt_tokens|completion_tokens)"',
    re.IGNORECASE,
)


def _apply_heuristics(feature) -> tuple[str, float, str]:
    """
    Apply deterministic rules to classify a feature.
    Returns (feature_type, confidence, notes).
    """
    text = f"{feature.name} {feature.description} {feature.triggering_element or ''}"

    # If endpoint already found and confidence is high, trust the LLM's classification
    if feature.has_endpoint and feature.feature_type == "api_endpoint" and feature.classification_confidence >= 0.8:
        return feature.feature_type, feature.classification_confidence, feature.classification_notes

    # Check response patterns for AI signals
    for ref in feature.endpoint_refs:
        if _AI_RESPONSE_PATTERNS.search(ref):
            return "ai_generation", 0.85, "Response body matches AI API JSON patterns"

    # Auth: explicit keywords in triggering element or name
    if _AUTH_KEYWORDS.search(text):
        return "auth_action", 0.88, "Auth-related keywords in feature text"

    # File operations
    if _FILE_KEYWORDS.search(text):
        return "file_operation", 0.85, "File operation keywords in feature text"

    # AI generation
    if _AI_KEYWORDS.search(text):
        return "ai_generation", 0.82, "AI/LLM keywords in feature text"

    # WebSocket / real-time
    if _WS_KEYWORDS.search(text):
        return "websocket", 0.80, "Real-time/streaming keywords in feature text"

    # Database query (data grids, search, etc.)
    if _DB_KEYWORDS.search(text):
        confidence = 0.70 if feature.has_endpoint else 0.65
        return "database_query", confidence, "Data/search keywords in feature text"

    # Computation
    if _COMPUTE_KEYWORDS.search(text):
        return "computation", 0.72, "Computation/transformation keywords in feature text"

    # If endpoint is found but type is still unclear, keep as api_endpoint
    if feature.has_endpoint:
        return "api_endpoint", 0.75, "Has endpoint; type unclear but will proxy"

    return feature.feature_type, feature.classification_confidence, feature.classification_notes


# --------------------------------------------------------------------------- #
# LLM batch classifier for ambiguous cases
# --------------------------------------------------------------------------- #

CLASSIFIER_SYSTEM = """You are a backend architecture analyst. For each feature described,
determine the most likely backend implementation type.

Feature types:
- "api_endpoint": Clear HTTP endpoint exists. Will be proxied via HTTP.
- "database_query": Likely reads/writes to a database (search, list, CRUD, filters, pagination).
- "ai_generation": Calls an AI/LLM API (text generation, chat, summarize, image generation).
- "computation": Pure algorithmic work with no external I/O (calculators, formatters, validators).
- "auth_action": Authentication / authorization (login, logout, signup, OAuth, JWT, 2FA).
- "file_operation": File storage / retrieval (upload, download, S3, cloud storage).
- "websocket": Real-time communication (live chat, notifications, collaborative editing).
- "unknown": Cannot determine with confidence.

For each feature return:
{
  "feature_id": "...",
  "feature_type": "...",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence"
}

Output a JSON array of these objects. No markdown. No prose.
"""


def _llm_classify_batch(client: OpenAI, features: list) -> dict[str, tuple[str, float, str]]:
    """
    Send ambiguous features to LLM for classification.
    Returns dict: feature_id → (feature_type, confidence, reasoning).
    """
    if not features:
        return {}

    feature_descriptions = [
        {
            "feature_id": f.feature_id,
            "name": f.name,
            "description": f.description,
            "ui_trigger": f.ui_trigger,
            "triggering_element": f.triggering_element,
            "has_endpoint": f.has_endpoint,
            "endpoint_refs": f.endpoint_refs,
            "page_url": f.page_url,
        }
        for f in features
    ]

    user_msg = f"Classify these {len(features)} features:\n{json.dumps(feature_descriptions, indent=2)}"

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": CLASSIFIER_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        raw = (resp.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = raw.replace("```json", "").replace("```", "").strip()
        results = json.loads(raw)
        return {
            r["feature_id"]: (
                r.get("feature_type", "unknown"),
                float(r.get("confidence", 0.5)),
                r.get("reasoning", ""),
            )
            for r in results
        }
    except Exception:
        return {}


def classify_all(site_map, vector_store=None) -> None:
    """
    Classify all features in the site map in place.

    Step 1: Apply deterministic heuristics.
    Step 2: Batch LLM call for features with confidence < 0.7 or type == "unknown".

    Args:
        site_map: SiteMap instance (modified in place).
        vector_store: Optional CodeVectorStore for code-context hints (not yet used).
    """
    all_features = [f for p in site_map.pages for f in p.features]

    # Step 1: deterministic pass
    for feature in all_features:
        ftype, conf, notes = _apply_heuristics(feature)
        feature.feature_type = ftype
        feature.classification_confidence = conf
        feature.classification_notes = notes

    # Step 2: LLM pass for ambiguous cases
    ambiguous = [
        f for f in all_features
        if f.classification_confidence < 0.7 or f.feature_type == "unknown"
    ]

    if not ambiguous:
        return

    client = OpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url=_DEEPSEEK_BASE_URL,
    )

    # Process in batches of 10 to avoid huge prompts
    batch_size = 10
    for i in range(0, len(ambiguous), batch_size):
        batch = ambiguous[i : i + batch_size]
        classifications = _llm_classify_batch(client, batch)
        for feature in batch:
            if feature.feature_id in classifications:
                ftype, conf, notes = classifications[feature.feature_id]
                feature.feature_type = ftype
                feature.classification_confidence = conf
                feature.classification_notes = notes

    # Recompute site_map summary stats
    with_endpoints = sum(1 for f in all_features if f.has_endpoint)
    needing_reconstruction = sum(
        1 for f in all_features
        if not f.has_endpoint and f.feature_type not in ("api_endpoint", "computation")
    )
    site_map.features_with_endpoints = with_endpoints
    site_map.features_needing_reconstruction = needing_reconstruction

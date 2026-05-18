"""
Patch: generates one new MCP tool from a user's free-form description
and appends it to an existing feature spec.
"""

from __future__ import annotations

import json
import os
import re

from openai import OpenAI

MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"

PATCH_SYSTEM = """You are an MCP tool designer. You will receive:
1. An existing MCP feature spec (JSON) with product info, base_url, auth type,
   and a list of already-implemented tools.
2. A user description of a tool they think is missing.

Your job: generate ONE new feature object that fits naturally into the spec.
Follow the same base_url, auth approach, and snake_case id conventions.

Output ONLY the new feature as a raw JSON object — no prose, no markdown fences:

{
  "id": "snake_case_unique_id",
  "name": "Human readable name",
  "description": "What the user accomplishes with this tool. 1-2 sentences.",
  "source": "user_patch",
  "implementation_type": "http_proxy",
  "code_snippet": null,
  "code_imports": null,
  "endpoint": {
    "method": "GET|POST|PUT|DELETE|PATCH",
    "url_template": "https://host/path/{id}",
    "query_params": [{"name": "...", "type": "string", "required": false}],
    "body_schema": {"type": "object", "properties": {...}} or null
  },
  "returns": "Short description of what the response contains."
}

Rules:
- id must not match any existing feature id. Make it descriptive and unique.
- If the user describes a pure computation / local logic with no HTTP endpoint,
  set implementation_type to "direct_code", set code_snippet to a runnable
  Python function body (indented, ending with return), set code_imports to
  needed imports, and set endpoint to null.
- Otherwise use "http_proxy": guess a REST endpoint from the base_url and
  REST conventions if the user didn't specify one.
- Keep body_schema null when the endpoint takes no body.
- Infer required vs optional query params from the description.
"""


def patch_spec(spec: dict, description: str) -> tuple[dict, dict]:
    """
    Generate one new feature from `description` and append it to `spec`.

    Returns (updated_spec, new_feature).
    """
    existing_ids = {f["id"] for f in spec.get("features", [])}

    # Trim spec payload — the LLM doesn't need every response sample
    compact = {
        "product_name": spec.get("product_name"),
        "base_url": spec.get("base_url"),
        "auth": spec.get("auth"),
        "existing_tool_ids": sorted(existing_ids),
        "features_summary": [
            {
                "id": f["id"],
                "name": f.get("name"),
                "description": (f.get("description") or "")[:120],
                "endpoint": {
                    "method": (f.get("endpoint") or {}).get("method"),
                    "url_template": (f.get("endpoint") or {}).get("url_template"),
                } if f.get("endpoint") else None,
            }
            for f in spec.get("features", [])
        ],
    }

    user_msg = (
        f"Existing spec summary:\n{json.dumps(compact, indent=2)}\n\n"
        f"User says the following is missing:\n{description}\n\n"
        "Generate the new feature JSON."
    )

    client = OpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url=_DEEPSEEK_BASE_URL,
    )
    resp = client.chat.completions.create(
        model=MODEL,
        max_tokens=1200,
        messages=[
            {"role": "system", "content": PATCH_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    new_feature = json.loads(raw)

    # Guarantee unique id
    base_id = new_feature.get("id") or "new_tool"
    uid = base_id
    n = 2
    while uid in existing_ids:
        uid = f"{base_id}_{n}"
        n += 1
    new_feature["id"] = uid

    spec = dict(spec)  # shallow copy — don't mutate caller's dict
    spec["features"] = list(spec.get("features", [])) + [new_feature]
    return spec, new_feature

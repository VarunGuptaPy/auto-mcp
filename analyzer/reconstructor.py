"""
Feature Reconstructor: generates Python implementation code for features that have
no captured HTTP endpoint, using answers collected from the user.

Strategy: structured seed templates (deterministic boilerplate) + LLM refinement
(fills in the feature-specific logic). The result is a code_snippet + code_imports
that the generator injects directly into the MCP tool.
"""

from __future__ import annotations

import json
import os
import re

from openai import OpenAI

MODEL = "deepseek-chat"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"


# --------------------------------------------------------------------------- #
# Provider-specific code seeds
# --------------------------------------------------------------------------- #

_DB_SEEDS: dict[str, str] = {
    "postgresql": """\
    import psycopg2, json, os
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cursor = conn.cursor()
    # QUERY_PLACEHOLDER
    cursor.execute("SELECT ...", [])
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return json.dumps(rows, default=str)
""",
    "mysql": """\
    import mysql.connector, json, os
    conn = mysql.connector.connect(
        host=os.environ.get("MYSQL_HOST", "localhost"),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DATABASE", ""),
    )
    cursor = conn.cursor(dictionary=True)
    # QUERY_PLACEHOLDER
    cursor.execute("SELECT ...", [])
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return json.dumps(rows, default=str)
""",
    "mongodb": """\
    import pymongo, json, os
    client = pymongo.MongoClient(os.environ["MONGODB_URI"])
    db = client.get_default_database()
    collection = db["COLLECTION_NAME"]
    # QUERY_PLACEHOLDER
    results = list(collection.find({}))
    for r in results:
        r["_id"] = str(r["_id"])
    return json.dumps(results, default=str)
""",
    "sqlite": """\
    import sqlite3, json, os
    conn = sqlite3.connect(os.environ.get("SQLITE_PATH", "db.sqlite3"))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # QUERY_PLACEHOLDER
    cursor.execute("SELECT ...", [])
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return json.dumps(rows, default=str)
""",
    "supabase": """\
    import json, os
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    # QUERY_PLACEHOLDER
    result = sb.table("TABLE_NAME").select("*").execute()
    return json.dumps(result.data, default=str)
""",
    "redis": """\
    import redis, json, os
    r = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))
    # QUERY_PLACEHOLDER
    value = r.get("key")
    return json.dumps({"value": value.decode() if value else None})
""",
}

_AI_SEEDS: dict[str, str] = {
    "openai": """\
    import openai, os
    client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    user_input = args.get("prompt") or args.get("message") or args.get("input") or ""
    response = client.chat.completions.create(
        model="{model}",
        messages=[
            {{"role": "system", "content": {system_prompt!r}}},
            {{"role": "user", "content": user_input}},
        ],
    )
    return response.choices[0].message.content or ""
""",
    "anthropic": """\
    import anthropic, os
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    user_input = args.get("prompt") or args.get("message") or args.get("input") or ""
    message = client.messages.create(
        model="{model}",
        max_tokens=1024,
        system={system_prompt!r},
        messages=[{{"role": "user", "content": user_input}}],
    )
    return message.content[0].text
""",
    "gemini": """\
    import google.generativeai as genai, os
    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    model_obj = genai.GenerativeModel("{model}")
    user_input = args.get("prompt") or args.get("message") or args.get("input") or ""
    response = model_obj.generate_content(user_input)
    return response.text or ""
""",
    "cohere": """\
    import cohere, os
    co = cohere.Client(os.environ["COHERE_API_KEY"])
    user_input = args.get("prompt") or args.get("message") or args.get("input") or ""
    response = co.generate(model="{model}", prompt=user_input, max_tokens=500)
    return response.generations[0].text
""",
    "ollama": """\
    import httpx, json, os
    user_input = args.get("prompt") or args.get("message") or args.get("input") or ""
    resp = httpx.post(
        os.environ.get("OLLAMA_URL", "http://localhost:11434") + "/api/generate",
        json={{"model": "{model}", "prompt": user_input, "stream": False}},
        timeout=60.0,
    )
    return resp.json().get("response", "")
""",
}

_FILE_SEEDS: dict[str, str] = {
    "aws s3": """\
    import boto3, os, json
    s3 = boto3.client(
        "s3",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )
    bucket = os.environ["AWS_S3_BUCKET"]
    # OPERATION_PLACEHOLDER
    objects = s3.list_objects_v2(Bucket=bucket).get("Contents", [])
    return json.dumps([{"key": o["Key"], "size": o["Size"]} for o in objects])
""",
    "supabase storage": """\
    import json, os
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    bucket_id = args.get("bucket", "uploads")
    # OPERATION_PLACEHOLDER
    result = sb.storage.from_(bucket_id).list()
    return json.dumps(result)
""",
}

_AUTH_SEEDS: dict[str, str] = {
    "firebase": """\
    import firebase_admin, os, json
    from firebase_admin import auth as fb_auth, credentials
    if not firebase_admin._apps:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
    token = args.get("id_token") or args.get("token") or ""
    try:
        decoded = fb_auth.verify_id_token(token)
        return json.dumps({"uid": decoded["uid"], "email": decoded.get("email")})
    except Exception as e:
        return f"Auth failed: {{e}}"
""",
    "supabase auth": """\
    import json, os
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    email = args.get("email", "")
    password = args.get("password", "")
    try:
        result = sb.auth.sign_in_with_password({"email": email, "password": password})
        return json.dumps({"access_token": result.session.access_token, "user_id": result.user.id})
    except Exception as e:
        return f"Auth failed: {{e}}"
""",
    "custom jwt": """\
    import json, os
    from jose import jwt
    token = args.get("token") or args.get("id_token") or ""
    secret = os.environ["JWT_SECRET"]
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return json.dumps(payload)
    except Exception as e:
        return f"JWT validation failed: {{e}}"
""",
}


# --------------------------------------------------------------------------- #
# LLM refinement prompt
# --------------------------------------------------------------------------- #

RECONSTRUCTOR_SYSTEM = """You are a Python backend engineer writing a self-contained function body
for an MCP tool.

You are given:
- A feature description (what it does)
- A seed code template with PLACEHOLDER comments
- User-provided answers about the backend implementation

Your task: replace the PLACEHOLDER comments with correct, specific Python code.

Rules:
- The function body receives `args: dict` — use args.get("field_name") to access parameters
- Use os.environ.get() or os.environ["KEY"] for all secrets and connection strings
- Include proper error handling
- Return a string (MCP requirement) — use json.dumps() for structured data
- Do NOT add function definition, decorators, or try/except wrapper (those are added externally)
- Do NOT add any markdown, only output the code body
- Keep it concise — no unnecessary comments
- If the user described a specific operation (e.g. "search by name"), implement that exact logic

Output TWO JSON fields ONLY:
{
  "code_body": "    # Python code indented by 4 spaces...",
  "code_imports": ["import psycopg2", "import json", "import os"]
}
"""


def _llm_refine_code(
    client: OpenAI,
    feature_name: str,
    feature_description: str,
    seed_code: str,
    answers: dict[str, str],
) -> tuple[str, list[str]]:
    """Call LLM to fill in the seed template and return (code_body, imports)."""
    user_msg = f"""Feature: {feature_name}
Description: {feature_description}

Seed template (fill in the PLACEHOLDERs):
{seed_code}

User-provided backend details:
{json.dumps(answers, indent=2)}

Produce the final code_body and code_imports JSON."""

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=1500,
            messages=[
                {"role": "system", "content": RECONSTRUCTOR_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        raw = (resp.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)
        code_body = result.get("code_body", "    return 'Not implemented'")
        code_imports = result.get("code_imports", [])
        return code_body, code_imports
    except Exception:
        return f"    return 'Not implemented: {feature_name}'", []


def _generate_from_scratch(
    client: OpenAI,
    feature_name: str,
    feature_description: str,
    behavior_description: str,
) -> tuple[str, list[str]]:
    """For 'unknown' features: generate entire body from user's description."""
    user_msg = f"""Feature: {feature_name}
Description: {feature_description}

The user described how this works in their backend:
{behavior_description}

Write a self-contained Python function body that implements this feature.
Use os.environ for any secrets or config.
Return a string result.

Output TWO JSON fields ONLY:
{{
  "code_body": "    # code here...",
  "code_imports": ["import ...", ...]
}}"""

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=1500,
            messages=[
                {"role": "system", "content": RECONSTRUCTOR_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        raw = (resp.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)
        return result.get("code_body", "    return 'Not implemented'"), result.get("code_imports", [])
    except Exception:
        return f"    return 'Not implemented: {feature_name}'", []


def _extract_env_vars(code_body: str, code_imports: list[str]) -> list[dict]:
    """Scan generated code for os.environ references to build env_vars_needed list."""
    env_refs = re.findall(r'os\.environ(?:\.get)?\(\s*["\']([A-Z_][A-Z0-9_]+)["\']', code_body)
    seen: set[str] = set()
    result: list[dict] = []
    for name in env_refs:
        if name not in seen:
            seen.add(name)
            required = f'os.environ["{name}"]' in code_body or f"os.environ['{name}']" in code_body
            result.append({
                "name": name,
                "required": required,
                "description": f"Environment variable required by {name.lower().replace('_', ' ')}",
            })
    return result


def reconstruct(
    feature,
    answers: dict[str, str],
    user_secrets: dict[str, str] | None = None,
) -> dict:
    """
    Generate a Python implementation for a feature that has no captured endpoint.

    Args:
        feature: DiscoveredFeature instance with feature_type set.
        answers: User's answers from the question plan (id_suffix → answer).
        user_secrets: Secret env var values provided by user (name → value).

    Returns:
        Dict with keys: code_snippet, code_imports, env_vars_needed, implementation_type,
        reconstruction_answers.
    """
    client = OpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url=_DEEPSEEK_BASE_URL,
    )

    code_body: str = "    return 'Not implemented'"
    code_imports: list[str] = ["import os"]
    feature_type = feature.feature_type

    # ------------------------------------------------------------------ #
    # database_query
    # ------------------------------------------------------------------ #
    if feature_type == "database_query":
        db_type = answers.get("db_type", "").lower()
        seed = None
        for key, template in _DB_SEEDS.items():
            if key in db_type:
                seed = template
                break
        if seed is None:
            seed = _DB_SEEDS.get("postgresql", "")

        # Substitute table name into seed
        table_name = answers.get("db_table", "items")
        seed = seed.replace("TABLE_NAME", table_name).replace("COLLECTION_NAME", table_name)

        code_body, code_imports = _llm_refine_code(
            client, feature.name, feature.description, seed, answers
        )

    # ------------------------------------------------------------------ #
    # ai_generation
    # ------------------------------------------------------------------ #
    elif feature_type == "ai_generation":
        provider = answers.get("ai_provider", "openai").lower()
        model_name = answers.get("ai_model", "gpt-4o")
        system_prompt = answers.get("ai_system_prompt", "You are a helpful assistant.")

        seed = None
        for key, template in _AI_SEEDS.items():
            if key in provider:
                seed = template
                break
        if seed is None:
            seed = _AI_SEEDS["openai"]

        seed = seed.format(model=model_name, system_prompt=system_prompt)
        code_body, code_imports = _llm_refine_code(
            client, feature.name, feature.description, seed, answers
        )

    # ------------------------------------------------------------------ #
    # auth_action
    # ------------------------------------------------------------------ #
    elif feature_type == "auth_action":
        auth_provider = answers.get("auth_provider", "custom jwt").lower()
        seed = None
        for key, template in _AUTH_SEEDS.items():
            if key in auth_provider:
                seed = template
                break
        if seed is None:
            seed = _AUTH_SEEDS["custom jwt"]

        code_body, code_imports = _llm_refine_code(
            client, feature.name, feature.description, seed, answers
        )

    # ------------------------------------------------------------------ #
    # file_operation
    # ------------------------------------------------------------------ #
    elif feature_type == "file_operation":
        storage = answers.get("storage_provider", "").lower()
        seed = None
        for key, template in _FILE_SEEDS.items():
            if key in storage:
                seed = template
                break
        if seed is None:
            seed = _FILE_SEEDS["aws s3"]

        code_body, code_imports = _llm_refine_code(
            client, feature.name, feature.description, seed, answers
        )

    # ------------------------------------------------------------------ #
    # websocket — generate polling equivalent
    # ------------------------------------------------------------------ #
    elif feature_type == "websocket":
        purpose = answers.get("ws_purpose", "real-time data")
        code_body, code_imports = _generate_from_scratch(
            client,
            feature.name,
            feature.description,
            f"This is a WebSocket/real-time feature for: {purpose}. "
            f"Generate a REST-equivalent implementation that retrieves the latest state.",
        )

    # ------------------------------------------------------------------ #
    # unknown — fully custom from user's description
    # ------------------------------------------------------------------ #
    else:
        behavior = answers.get("behavior_description", "")
        if behavior:
            code_body, code_imports = _generate_from_scratch(
                client, feature.name, feature.description, behavior
            )

    # Ensure os is imported
    if "import os" not in code_imports:
        code_imports.insert(0, "import os")

    env_vars_needed = _extract_env_vars(code_body, code_imports)

    return {
        "implementation_type": "reconstructed",
        "code_snippet": code_body,
        "code_imports": code_imports,
        "env_vars_needed": env_vars_needed,
        "feature_type": feature_type,
        "reconstruction_answers": answers,
        "source": "reconstructed",
    }

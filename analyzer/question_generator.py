"""
Question Generator: produces targeted Q&A plans for features that need reconstruction.

Questions are hardcoded templates per feature type — deterministic, not LLM-generated.
This ensures consistent, predictable questions and avoids burning LLM tokens unnecessarily.

Deduplication: if the same "category" question was answered for a previous feature
(e.g. db_type for a prior database_query), that answer is reused for subsequent features
of the same type rather than asking again.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


QuestionType = Literal["text", "choice", "credentials", "file_upload", "env_vars"]


@dataclass
class QuestionSpec:
    """A single question to ask the user about a feature."""
    id_suffix: str          # appended to feature_id to form the full question_id
    text_template: str      # may contain {feature_name}
    question_type: QuestionType
    choices: list[str] = field(default_factory=list)
    required: bool = True
    # follow_ups: list of id_suffixes to ask when this Q is answered (conditional)
    follow_ups: dict[str, list[str]] = field(default_factory=dict)

    def render_text(self, feature_name: str) -> str:
        return self.text_template.format(feature_name=feature_name)


# --------------------------------------------------------------------------- #
# Question templates per feature type
# --------------------------------------------------------------------------- #

_TEMPLATES: dict[str, list[QuestionSpec]] = {
    "database_query": [
        QuestionSpec(
            id_suffix="db_type",
            text_template="For the '{feature_name}' feature: what database does your backend use?",
            question_type="choice",
            choices=["PostgreSQL", "MySQL", "MongoDB", "SQLite", "Redis", "Supabase", "Other"],
        ),
        QuestionSpec(
            id_suffix="db_table",
            text_template="For '{feature_name}': what is the table or collection name that stores this data?",
            question_type="text",
        ),
        QuestionSpec(
            id_suffix="db_fields",
            text_template="For '{feature_name}': which fields/columns are most important? (comma-separated, e.g. id, name, created_at)",
            question_type="text",
            required=False,
        ),
        QuestionSpec(
            id_suffix="db_operation",
            text_template="For '{feature_name}': what does this feature do with the data?",
            question_type="choice",
            choices=["Read / Query / Search", "Create / Insert", "Update / Edit", "Delete / Remove", "Mixed / multiple"],
        ),
    ],
    "ai_generation": [
        QuestionSpec(
            id_suffix="ai_provider",
            text_template="For '{feature_name}': which AI provider does your backend call?",
            question_type="choice",
            choices=["OpenAI", "Anthropic / Claude", "Google Gemini", "Cohere", "Local / Ollama", "Other"],
        ),
        QuestionSpec(
            id_suffix="ai_model",
            text_template="For '{feature_name}': what model name should be used? (e.g. gpt-4o, claude-3-5-sonnet-20241022, gemini-1.5-pro)",
            question_type="text",
        ),
        QuestionSpec(
            id_suffix="ai_system_prompt",
            text_template="For '{feature_name}': is there a specific system prompt or task instruction? (leave blank if none)",
            question_type="text",
            required=False,
        ),
        QuestionSpec(
            id_suffix="ai_input_field",
            text_template="For '{feature_name}': what is the main user input called? (e.g. 'prompt', 'message', 'query')",
            question_type="text",
            required=False,
        ),
    ],
    "auth_action": [
        QuestionSpec(
            id_suffix="auth_provider",
            text_template="For '{feature_name}': what authentication system does your app use?",
            question_type="choice",
            choices=["Firebase Auth", "Auth0", "Supabase Auth", "Custom JWT", "Session cookie", "NextAuth / Auth.js", "Clerk", "Other"],
        ),
        QuestionSpec(
            id_suffix="auth_detail",
            text_template="For '{feature_name}': what specifically does this auth action do?",
            question_type="choice",
            choices=["Login with email/password", "OAuth login (Google, GitHub, etc.)", "Signup / register", "Logout / sign out", "Password reset", "Token refresh", "Other"],
        ),
    ],
    "file_operation": [
        QuestionSpec(
            id_suffix="storage_provider",
            text_template="For '{feature_name}': where are files stored?",
            question_type="choice",
            choices=["AWS S3", "Google Cloud Storage", "Cloudflare R2", "Supabase Storage", "Azure Blob", "Local filesystem", "Other"],
        ),
        QuestionSpec(
            id_suffix="file_operation_type",
            text_template="For '{feature_name}': what does this feature do with files?",
            question_type="choice",
            choices=["Upload a file", "Download a file", "List / browse files", "Delete a file", "Process / transform file"],
        ),
    ],
    "websocket": [
        QuestionSpec(
            id_suffix="ws_purpose",
            text_template="For '{feature_name}': what data is streamed in real-time?",
            question_type="text",
        ),
        QuestionSpec(
            id_suffix="ws_tech",
            text_template="For '{feature_name}': what WebSocket / real-time technology is used?",
            question_type="choice",
            choices=["Socket.io", "Raw WebSocket", "Server-Sent Events (SSE)", "Supabase Realtime", "Pusher", "Ably", "Other / unknown"],
        ),
    ],
    "unknown": [
        QuestionSpec(
            id_suffix="behavior_description",
            text_template=(
                "For '{feature_name}': I couldn't determine how this works from the UI alone. "
                "Can you describe what happens in your backend when a user triggers this?"
            ),
            question_type="text",
        ),
    ],
}

# Secret questions asked once at the end (after all feature questions)
_SECRET_TEMPLATES: dict[str, list[dict]] = {
    "database_query": [
        {"name": "DATABASE_URL", "label": "DATABASE_URL",
         "description": "Full database connection string (e.g. postgresql://user:pass@host/db)"},
    ],
    "ai_generation_openai": [
        {"name": "OPENAI_API_KEY", "label": "OPENAI_API_KEY", "description": "OpenAI API key"},
    ],
    "ai_generation_anthropic": [
        {"name": "ANTHROPIC_API_KEY", "label": "ANTHROPIC_API_KEY", "description": "Anthropic API key"},
    ],
    "ai_generation_gemini": [
        {"name": "GOOGLE_API_KEY", "label": "GOOGLE_API_KEY", "description": "Google AI API key"},
    ],
    "ai_generation_cohere": [
        {"name": "COHERE_API_KEY", "label": "COHERE_API_KEY", "description": "Cohere API key"},
    ],
    "file_operation_s3": [
        {"name": "AWS_ACCESS_KEY_ID", "label": "AWS_ACCESS_KEY_ID", "description": "AWS Access Key ID"},
        {"name": "AWS_SECRET_ACCESS_KEY", "label": "AWS_SECRET_ACCESS_KEY", "description": "AWS Secret Access Key"},
        {"name": "AWS_S3_BUCKET", "label": "AWS_S3_BUCKET", "description": "S3 bucket name"},
        {"name": "AWS_REGION", "label": "AWS_REGION", "description": "AWS region (e.g. us-east-1)"},
    ],
    "file_operation_gcs": [
        {"name": "GCS_BUCKET", "label": "GCS_BUCKET", "description": "Google Cloud Storage bucket name"},
        {"name": "GOOGLE_APPLICATION_CREDENTIALS", "label": "GOOGLE_APPLICATION_CREDENTIALS",
         "description": "Path to service account JSON file"},
    ],
    "file_operation_supabase": [
        {"name": "SUPABASE_URL", "label": "SUPABASE_URL", "description": "Supabase project URL"},
        {"name": "SUPABASE_SERVICE_KEY", "label": "SUPABASE_SERVICE_KEY",
         "description": "Supabase service role key (for storage operations)"},
    ],
    "auth_firebase": [
        {"name": "FIREBASE_PROJECT_ID", "label": "FIREBASE_PROJECT_ID", "description": "Firebase project ID"},
        {"name": "FIREBASE_SERVICE_ACCOUNT_JSON", "label": "FIREBASE_SERVICE_ACCOUNT_JSON",
         "description": "Firebase service account JSON (single-line)"},
    ],
    "auth_supabase": [
        {"name": "SUPABASE_URL", "label": "SUPABASE_URL", "description": "Supabase project URL"},
        {"name": "SUPABASE_SERVICE_KEY", "label": "SUPABASE_SERVICE_KEY",
         "description": "Supabase service role key"},
    ],
    "auth_jwt": [
        {"name": "JWT_SECRET", "label": "JWT_SECRET", "description": "JWT signing secret"},
    ],
}


@dataclass
class FeatureQuestionPlan:
    """All questions needed to reconstruct one feature."""
    feature_id: str
    feature_name: str
    feature_type: str
    questions: list[QuestionSpec]
    answers: dict[str, str] = field(default_factory=dict)  # id_suffix → answer


def generate_questions(
    features: list,
    shared_answers: dict[str, str] | None = None,
) -> list[FeatureQuestionPlan]:
    """
    Generate question plans for features that need reconstruction.

    Args:
        features: List of DiscoveredFeature instances with feature_type set.
        shared_answers: Answers already collected (e.g. db_type from a prior feature).
                        Shared across features of the same type to avoid repetition.

    Returns:
        List of FeatureQuestionPlan, one per feature needing reconstruction.
    """
    if shared_answers is None:
        shared_answers = {}

    plans: list[FeatureQuestionPlan] = []

    for feature in features:
        if feature.has_endpoint and feature.feature_type == "api_endpoint":
            continue  # will be handled as http_proxy — no questions needed
        if feature.feature_type == "computation":
            continue  # no external dependencies — generate directly

        templates = _TEMPLATES.get(feature.feature_type, _TEMPLATES["unknown"])

        # Filter out questions whose id_suffix already has a shared answer
        questions_to_ask: list[QuestionSpec] = []
        for q in templates:
            shared_key = f"{feature.feature_type}:{q.id_suffix}"
            if shared_key in shared_answers and q.id_suffix not in (
                "behavior_description",  # always ask per-feature
                "db_table", "db_fields", "db_operation",  # feature-specific
                "ai_system_prompt", "ai_input_field",  # feature-specific
                "file_operation_type",  # feature-specific
                "ws_purpose",  # feature-specific
            ):
                continue  # already answered by a prior feature
            questions_to_ask.append(q)

        if questions_to_ask:
            plans.append(FeatureQuestionPlan(
                feature_id=feature.feature_id,
                feature_name=feature.name,
                feature_type=feature.feature_type,
                questions=questions_to_ask,
            ))

    return plans


def get_secret_fields(
    reconstruction_plans: list[FeatureQuestionPlan],
    answers_by_feature: dict[str, dict[str, str]],
) -> list[dict]:
    """
    Determine which secret env vars are needed based on reconstruction answers.

    Returns a list of field dicts for the batch env_vars question.
    """
    needed: dict[str, dict] = {}

    for plan in reconstruction_plans:
        feature_answers = answers_by_feature.get(plan.feature_id, {})

        if plan.feature_type == "database_query":
            for field in _SECRET_TEMPLATES["database_query"]:
                needed[field["name"]] = field

        elif plan.feature_type == "ai_generation":
            provider = feature_answers.get("ai_provider", "").lower()
            if "openai" in provider:
                for f in _SECRET_TEMPLATES["ai_generation_openai"]:
                    needed[f["name"]] = f
            elif "anthropic" in provider or "claude" in provider:
                for f in _SECRET_TEMPLATES["ai_generation_anthropic"]:
                    needed[f["name"]] = f
            elif "gemini" in provider or "google" in provider:
                for f in _SECRET_TEMPLATES["ai_generation_gemini"]:
                    needed[f["name"]] = f
            elif "cohere" in provider:
                for f in _SECRET_TEMPLATES["ai_generation_cohere"]:
                    needed[f["name"]] = f

        elif plan.feature_type == "file_operation":
            provider = feature_answers.get("storage_provider", "").lower()
            if "s3" in provider or "aws" in provider:
                for f in _SECRET_TEMPLATES["file_operation_s3"]:
                    needed[f["name"]] = f
            elif "google" in provider or "gcs" in provider:
                for f in _SECRET_TEMPLATES["file_operation_gcs"]:
                    needed[f["name"]] = f
            elif "supabase" in provider:
                for f in _SECRET_TEMPLATES["file_operation_supabase"]:
                    needed[f["name"]] = f

        elif plan.feature_type == "auth_action":
            provider = feature_answers.get("auth_provider", "").lower()
            if "firebase" in provider:
                for f in _SECRET_TEMPLATES["auth_firebase"]:
                    needed[f["name"]] = f
            elif "supabase" in provider:
                for f in _SECRET_TEMPLATES["auth_supabase"]:
                    needed[f["name"]] = f
            elif "jwt" in provider or "custom" in provider:
                for f in _SECRET_TEMPLATES["auth_jwt"]:
                    needed[f["name"]] = f

    return list(needed.values())

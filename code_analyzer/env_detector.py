"""
Detects environment variable references in source code and classifies them
as required (no default, sensitive-looking names) or optional.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from code_analyzer.github_fetcher import RepoFile


@dataclass
class EnvVar:
    name: str
    default: str | None          # None = no default found
    required: bool               # True = no fallback and name looks like a secret
    description: str             # best-effort from nearby comment
    file_path: str

    @property
    def is_secret(self) -> bool:
        n = self.name.upper()
        return any(kw in n for kw in (
            "KEY", "SECRET", "TOKEN", "PASSWORD", "PASSWD", "PWD",
            "CREDENTIAL", "AUTH", "APIKEY", "API_KEY", "PRIVATE",
        ))


# Words whose names suggest they are not user-secrets
_SKIP_NAMES = frozenset({
    "NODE_ENV", "PORT", "HOST", "DEBUG", "LOG_LEVEL", "PYTHONPATH",
    "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "PWD",
    "NEXT_PUBLIC_API_URL",  # typically set by build system
    "VERCEL_URL", "RAILWAY_STATIC_URL",
})

# ---- Python patterns -------------------------------------------------------

_PY_GET_RE = re.compile(
    r'os\.(?:environ\.get|getenv)\s*\(\s*["\']([A-Z][A-Z0-9_]*)["\']'
    r'(?:\s*,\s*(?:None|["\']([^"\']*)["\']))?\s*\)',
)
_PY_BRACKET_RE = re.compile(r'os\.environ\[["\']([A-Z][A-Z0-9_]*)["\']')

# ---- JS / TS patterns ------------------------------------------------------

_JS_ENV_RE = re.compile(
    r'process\.env(?:\.|\[["\'`])([A-Z][A-Z0-9_]*)(?:["\'`\]])?'
)
_NEXT_PUBLIC_RE = re.compile(r'NEXT_PUBLIC_[A-Z0-9_]+')
_VITE_RE = re.compile(r'import\.meta\.env\.([A-Z][A-Z0-9_]+)')


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _nearby_comment(content: str, match_start: int) -> str:
    """Return the first inline comment on the same line as match_start, if any."""
    line_start = content.rfind("\n", 0, match_start) + 1
    line_end = content.find("\n", match_start)
    line = content[line_start: line_end if line_end != -1 else len(content)]
    for marker in ("#", "//"):
        idx = line.find(marker)
        if idx != -1:
            return line[idx + len(marker):].strip()
    return ""


# --------------------------------------------------------------------------- #
# Per-language extractors
# --------------------------------------------------------------------------- #

def _from_python(path: str, content: str) -> list[EnvVar]:
    found: dict[str, EnvVar] = {}

    for m in _PY_GET_RE.finditer(content):
        name = m.group(1)
        default = m.group(2)
        var = EnvVar(
            name=name,
            default=default,
            required=(default is None),
            description=_nearby_comment(content, m.start()),
            file_path=path,
        )
        if name not in found or (found[name].default is not None and default is None):
            found[name] = var

    for m in _PY_BRACKET_RE.finditer(content):
        name = m.group(1)
        if name not in found:
            found[name] = EnvVar(
                name=name,
                default=None,
                required=True,
                description=_nearby_comment(content, m.start()),
                file_path=path,
            )

    return list(found.values())


def _from_js(path: str, content: str) -> list[EnvVar]:
    found: dict[str, EnvVar] = {}

    for m in _JS_ENV_RE.finditer(content):
        name = m.group(1)
        if name not in found:
            found[name] = EnvVar(
                name=name,
                default=None,
                required=False,   # JS env vars usually have fallback logic
                description=_nearby_comment(content, m.start()),
                file_path=path,
            )

    for m in _VITE_RE.finditer(content):
        name = m.group(1)
        if name not in found:
            found[name] = EnvVar(
                name=name,
                default=None,
                required=False,
                description=_nearby_comment(content, m.start()),
                file_path=path,
            )

    return list(found.values())


# --------------------------------------------------------------------------- #
# Public entrypoint
# --------------------------------------------------------------------------- #

def detect_env_vars(files: list) -> list[EnvVar]:
    """
    Scan all files and return a deduplicated list of detected environment
    variable references, filtered to remove common non-secret names.
    """
    all_vars: dict[str, EnvVar] = {}

    for f in files:
        if f.language == "python":
            raw = _from_python(f.path, f.content)
        elif f.language in ("typescript", "javascript"):
            raw = _from_js(f.path, f.content)
        else:
            continue

        for v in raw:
            if v.name in _SKIP_NAMES:
                continue
            existing = all_vars.get(v.name)
            if existing is None:
                all_vars[v.name] = v
            elif v.is_secret and not existing.is_secret:
                all_vars[v.name] = v   # prefer the more-informative entry

    return sorted(all_vars.values(), key=lambda v: (not v.is_secret, v.name))

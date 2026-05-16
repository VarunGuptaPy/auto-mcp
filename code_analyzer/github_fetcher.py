"""
Fetches repository source files via the GitHub REST API.

Security properties:
  - The token is used only in-memory during the HTTP requests.
  - It is never written to disk or logged.
  - Callers must discard the token from their own memory after calling fetch_repo().
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass

import httpx

GITHUB_API = "https://api.github.com"
MAX_FILE_BYTES = 150_000   # skip files larger than this
MAX_FILES = 300            # cap to avoid enormous repos


@dataclass
class RepoFile:
    path: str
    content: str
    language: str


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #

_EXT_TO_LANG: dict[str, str] = {
    "py": "python",
    "ts": "typescript",  "tsx": "typescript",
    "js": "javascript",  "jsx": "javascript",
    "mjs": "javascript", "cjs": "javascript",
    "go": "go",
    "rb": "ruby",
    "java": "java",
    "cs": "csharp",
    "php": "php",
    "rs": "rust",
}

_SKIP_DIRS = frozenset({
    "node_modules", ".next", "dist", "build", "__pycache__",
    ".git", "coverage", ".pytest_cache", "venv", ".venv",
    "vendor", "assets", "public", "static", ".turbo",
    "out", ".cache", "target",
})

_SKIP_SUFFIXES = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp4", ".mp3", ".wav", ".avi", ".mov",
    ".zip", ".tar", ".gz", ".tgz", ".br",
    ".lock", ".map", ".min.js", ".min.css",
    ".pyc", ".pyo",
)

_CODE_SUFFIXES = tuple(f".{ext}" for ext in _EXT_TO_LANG)


def _detect_language(path: str) -> str:
    dot = path.rfind(".")
    if dot == -1:
        return "unknown"
    return _EXT_TO_LANG.get(path[dot + 1:].lower(), "unknown")


def _is_code_file(path: str) -> bool:
    parts = path.split("/")
    if any(p in _SKIP_DIRS for p in parts):
        return False
    lower = path.lower()
    if any(lower.endswith(s) for s in _SKIP_SUFFIXES):
        return False
    return any(lower.endswith(s) for s in _CODE_SUFFIXES)


def _parse_repo_id(repo_url: str) -> str:
    """Return 'owner/repo' from a URL or bare identifier."""
    m = re.search(r"github\.com/([^/]+/[^/?#]+?)(?:\.git)?(?:[/?#]|$)", repo_url)
    if m:
        return m.group(1)
    if re.match(r"^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$", repo_url.strip()):
        return repo_url.strip()
    raise ValueError(
        f"Cannot parse a GitHub repo from {repo_url!r}. "
        "Expected 'https://github.com/owner/repo' or 'owner/repo'."
    )


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def fetch_repo(repo_url: str, token: str | None = None) -> list[RepoFile]:
    """
    Return a list of source-code files from a GitHub repository.

    Parameters
    ----------
    repo_url : str
        Full URL (https://github.com/user/repo) or short form (user/repo).
    token : str or None
        GitHub Personal Access Token. Used only in-memory; never persisted.
    """
    repo_id = _parse_repo_id(repo_url)

    headers: dict[str, str] = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
        # Note: token is referenced only here; caller should del their reference after return.

    with httpx.Client(headers=headers, timeout=30.0) as client:
        # Resolve default branch
        repo_info = client.get(f"{GITHUB_API}/repos/{repo_id}")
        repo_info.raise_for_status()
        default_branch = repo_info.json().get("default_branch", "main")

        # Full recursive tree — single API call
        tree_resp = client.get(
            f"{GITHUB_API}/repos/{repo_id}/git/trees/{default_branch}",
            params={"recursive": "1"},
        )
        tree_resp.raise_for_status()
        tree = tree_resp.json().get("tree", [])

        # Filter to code files within size budget
        candidates = [
            item for item in tree
            if item["type"] == "blob"
            and item.get("size", 0) < MAX_FILE_BYTES
            and _is_code_file(item["path"])
        ][:MAX_FILES]

        results: list[RepoFile] = []
        for item in candidates:
            try:
                blob = client.get(f"{GITHUB_API}/repos/{repo_id}/git/blobs/{item['sha']}")
                blob.raise_for_status()
                data = blob.json()
                if data.get("encoding") == "base64":
                    raw = base64.b64decode(data["content"].replace("\n", ""))
                    content = raw.decode("utf-8", errors="replace")
                else:
                    content = data.get("content", "")
                results.append(RepoFile(
                    path=item["path"],
                    content=content,
                    language=_detect_language(item["path"]),
                ))
            except Exception:
                pass  # silently skip unreadable files

    return results

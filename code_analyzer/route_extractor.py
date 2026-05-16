"""
Extracts API route definitions from source code.

Supported frameworks:
  Python  : FastAPI, Flask, Django (urls.py)
  TS / JS : Next.js App Router, Next.js Pages API, Express / Fastify
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from code_analyzer.github_fetcher import RepoFile


@dataclass
class Route:
    method: str           # GET POST PUT DELETE PATCH * (wildcard)
    path: str             # URL path, params as {name}
    handler_name: str
    file_path: str
    framework: str
    docstring: str = ""
    query_params: list[str] = field(default_factory=list)
    body_hint: str = ""   # short string hint about request body


# --------------------------------------------------------------------------- #
# Python – FastAPI / Flask / Django
# --------------------------------------------------------------------------- #

_HTTP_ATTRS = {"get", "post", "put", "delete", "patch", "head", "options"}
_ROUTE_ATTRS = _HTTP_ATTRS | {"route", "api_route"}


def _guess_py_framework(content: str) -> str:
    c = content.lower()
    if "fastapi" in c:
        return "fastapi"
    if "flask" in c:
        return "flask"
    if "django" in c:
        return "django"
    return "python"


def _parse_decorator(dec: ast.expr) -> tuple[str | None, str | None]:
    """Return (method, path) from an AST decorator node, or (None, None)."""
    if not isinstance(dec, ast.Call):
        return None, None

    func = dec.func
    attr = None
    if isinstance(func, ast.Attribute):
        attr = func.attr.lower()
    elif isinstance(func, ast.Name):
        attr = func.id.lower()

    if attr not in _ROUTE_ATTRS:
        return None, None

    # First positional arg is the path string
    path: str | None = None
    if dec.args and isinstance(dec.args[0], ast.Constant) and isinstance(dec.args[0].value, str):
        path = dec.args[0].value

    if attr in _HTTP_ATTRS:
        return attr, path

    # @app.route("/path", methods=["POST", "GET"])
    if attr in ("route", "api_route"):
        methods: list[str] = []
        for kw in dec.keywords:
            if kw.arg == "methods" and isinstance(kw.value, ast.List):
                methods = [
                    elt.value.upper()
                    for elt in kw.value.elts
                    if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                ]
        if methods:
            # Return the first method; caller can expand if needed
            return methods[0].lower(), path
        return "get", path

    return None, None


def _extract_python(path: str, content: str) -> list[Route]:
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []

    framework = _guess_py_framework(content)
    routes: list[Route] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            method, route_path = _parse_decorator(dec)
            if method and route_path:
                # Convert FastAPI path params {id} → already fine
                # Convert Flask path params <int:id> → {id}
                normalized = re.sub(r"<(?:[a-z_]+:)?([a-zA-Z_][a-zA-Z0-9_]*)>", r"{\1}", route_path)
                doc = ast.get_docstring(node) or ""
                routes.append(Route(
                    method=method.upper(),
                    path=normalized,
                    handler_name=node.name,
                    file_path=path,
                    framework=framework,
                    docstring=doc[:300],
                ))
    return routes


def _extract_django_urls(path: str, content: str) -> list[Route]:
    """Parse Django urls.py: path("endpoint/", view, name="...")."""
    routes: list[Route] = []
    pattern = re.compile(
        r"""(?:re_)?path\(\s*[r]?['"]([^'"]+)['"]\s*,\s*([A-Za-z_.]+)""",
        re.MULTILINE,
    )
    for m in pattern.finditer(content):
        url_pattern = m.group(1)
        view_name = m.group(2).rsplit(".", 1)[-1]
        # Convert Django named groups (?P<id>[^/]+) → {id}
        normalized = re.sub(r"\(\?P<([^>]+)>[^)]+\)", r"{\1}", url_pattern)
        normalized = re.sub(r"<(?:[a-z_]+:)?([a-zA-Z_][a-zA-Z0-9_]*)>", r"{\1}", normalized)
        routes.append(Route(
            method="*",
            path="/" + normalized.lstrip("/"),
            handler_name=view_name,
            file_path=path,
            framework="django",
        ))
    return routes


# --------------------------------------------------------------------------- #
# TypeScript / JavaScript — Next.js + Express
# --------------------------------------------------------------------------- #

_NEXT_APP_RE = re.compile(r"(?:^|/)app/.+/route\.[tj]sx?$")
_NEXT_PAGES_API_RE = re.compile(r"(?:^|/)pages/api/.+\.[tj]sx?$")
_EXPORTED_METHOD_RE = re.compile(
    r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b",
    re.IGNORECASE,
)


def _nextjs_path_from_file(file_path: str) -> str:
    """Convert Next.js app-router file path to a URL template."""
    m = re.search(r"app/(.+)/route\.[tj]sx?$", file_path)
    if not m:
        return "/"
    parts = []
    for seg in m.group(1).split("/"):
        if seg.startswith("(") and seg.endswith(")"):
            continue  # route group — not part of URL
        elif seg.startswith("[...") and seg.endswith("]"):
            parts.append("{" + seg[4:-1] + "}")
        elif seg.startswith("[") and seg.endswith("]"):
            parts.append("{" + seg[1:-1] + "}")
        else:
            parts.append(seg)
    return "/" + "/".join(parts)


def _extract_nextjs_app(path: str, content: str) -> list[Route]:
    url = _nextjs_path_from_file(path)
    routes = []
    for m in _EXPORTED_METHOD_RE.finditer(content):
        routes.append(Route(
            method=m.group(1).upper(),
            path=url,
            handler_name=m.group(1),
            file_path=path,
            framework="nextjs",
        ))
    return routes


def _nextjs_pages_path_from_file(file_path: str) -> str:
    m = re.search(r"pages/api/(.+)\.[tj]sx?$", file_path)
    if not m:
        return "/api/unknown"
    parts = []
    for seg in m.group(1).split("/"):
        if seg.startswith("[...") and seg.endswith("]"):
            parts.append("{" + seg[4:-1] + "}")
        elif seg.startswith("[") and seg.endswith("]"):
            parts.append("{" + seg[1:-1] + "}")
        else:
            parts.append(seg)
    return "/api/" + "/".join(parts)


def _extract_nextjs_pages(path: str, content: str) -> list[Route]:
    url = _nextjs_pages_path_from_file(path)
    methods = re.findall(r"req\.method\s*===?\s*['\"]([A-Z]+)['\"]", content)
    if methods:
        return [
            Route(method=m, path=url, handler_name="handler", file_path=path, framework="nextjs")
            for m in sorted(set(methods))
        ]
    if re.search(r"export\s+default", content):
        return [Route(method="*", path=url, handler_name="handler", file_path=path, framework="nextjs")]
    return []


_EXPRESS_RE = re.compile(
    r"(?:app|router)\.(get|post|put|delete|patch|all)\s*\(\s*['\"`]([^'\"` ]+)['\"`]",
    re.IGNORECASE,
)


def _extract_express(path: str, content: str) -> list[Route]:
    routes = []
    for m in _EXPRESS_RE.finditer(content):
        method = m.group(1).upper()
        rpath = re.sub(r":([a-zA-Z_][a-zA-Z0-9_]*)", r"{\1}", m.group(2))
        routes.append(Route(
            method=method if method != "ALL" else "*",
            path=rpath,
            handler_name="handler",
            file_path=path,
            framework="express",
        ))
    return routes


def _extract_ts(path: str, content: str) -> list[Route]:
    if _NEXT_APP_RE.search(path):
        return _extract_nextjs_app(path, content)
    if _NEXT_PAGES_API_RE.search(path):
        return _extract_nextjs_pages(path, content)
    return _extract_express(path, content)


# --------------------------------------------------------------------------- #
# Public entrypoint
# --------------------------------------------------------------------------- #

def extract_routes(files: list) -> list[Route]:
    """Return all routes found across the given list of RepoFile objects."""
    routes: list[Route] = []
    for f in files:
        if f.language == "python":
            if "urls.py" in f.path or "urls/" in f.path:
                routes.extend(_extract_django_urls(f.path, f.content))
            else:
                routes.extend(_extract_python(f.path, f.content))
        elif f.language in ("typescript", "javascript"):
            routes.extend(_extract_ts(f.path, f.content))
    return routes

"""
Local vector store for code chunks.

Primary backend : ChromaDB with its default ONNX embeddings (local, no cloud).
Fallback        : BM25 keyword search via rank-bm25 (lightweight, no model needed).

All data is persisted on-disk inside the job directory — nothing leaves
the user's machine.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from code_analyzer.github_fetcher import RepoFile

CHUNK_CHARS = 600
CHUNK_OVERLAP = 100
MAX_CHUNKS = 5000  # cap to prevent runaway memory usage


# --------------------------------------------------------------------------- #
# Text chunking — fixed to guarantee forward progress on every iteration
# --------------------------------------------------------------------------- #

def _chunk(text: str, size: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks of at most `size` characters."""
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        # Prefer to break at a newline boundary within the window
        if end < n:
            nl = text.rfind("\n", start, end)
            if nl > start:
                end = nl + 1

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
            if len(chunks) >= MAX_CHUNKS:
                break

        # ---- guarantee forward progress ----
        if end >= n:
            break  # consumed the entire text
        next_start = end - overlap
        if next_start <= start:
            next_start = end  # never go backwards
        start = next_start

    return chunks


# --------------------------------------------------------------------------- #
# ChromaDB backend
# --------------------------------------------------------------------------- #

def _try_load_chroma(persist_dir: Path):
    try:
        import chromadb
        from chromadb.config import Settings
        client = chromadb.PersistentClient(
            path=str(persist_dir),
            settings=Settings(anonymized_telemetry=False),
        )
        col = client.get_or_create_collection(
            "code_chunks",
            metadata={"hnsw:space": "cosine"},
        )
        return col
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# BM25 fallback
# --------------------------------------------------------------------------- #

class _BM25Store:
    def __init__(self) -> None:
        self._docs: list[str] = []
        self._tokenized: list[list[str]] = []
        self._bm25 = None

    def add(self, docs: list[str]) -> None:
        self._docs.extend(docs)
        self._tokenized.extend(re.findall(r"\w+", d.lower()) for d in docs)
        self._bm25 = None  # invalidate cached model

    def query(self, text: str, n: int) -> list[str]:
        if not self._docs:
            return []
        try:
            from rank_bm25 import BM25Okapi
        except ImportError:
            # Last-resort: simple substring frequency match
            q = text.lower()
            scored = sorted(self._docs, key=lambda d: -d.lower().count(q[:20]))
            return scored[:n]

        if self._bm25 is None:
            self._bm25 = BM25Okapi(self._tokenized)
        tokens = re.findall(r"\w+", text.lower())
        scores = self._bm25.get_scores(tokens)
        top_idx = sorted(range(len(scores)), key=lambda i: -scores[i])[:n]
        return [self._docs[i] for i in top_idx]


# --------------------------------------------------------------------------- #
# Public interface
# --------------------------------------------------------------------------- #

class CodeVectorStore:
    """
    Chunks source files and stores them for semantic retrieval.
    Uses ChromaDB when available; falls back to BM25 keyword search.
    """

    def __init__(self, persist_dir: str | Path) -> None:
        self._dir = Path(persist_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._col = _try_load_chroma(self._dir)
        self._fallback = _BM25Store()
        self._use_chroma = self._col is not None

    def add_files(self, files: list) -> None:
        """Index all code files into the store."""
        docs: list[str] = []
        ids: list[str] = []
        metas: list[dict] = []

        for f in files:
            for i, chunk in enumerate(_chunk(f.content)):
                doc = f"# {f.path}\n{chunk}"
                chunk_id = hashlib.md5(
                    f"{f.path}:{i}:{chunk[:40]}".encode()
                ).hexdigest()
                docs.append(doc)
                ids.append(chunk_id)
                metas.append({"path": f.path, "lang": f.language})

        if not docs:
            return

        if self._use_chroma and self._col is not None:
            batch = 100
            for i in range(0, len(docs), batch):
                try:
                    self._col.upsert(
                        documents=docs[i : i + batch],
                        metadatas=metas[i : i + batch],
                        ids=ids[i : i + batch],
                    )
                except Exception:
                    self._use_chroma = False
                    break

        if not self._use_chroma:
            self._fallback.add(docs)

    def query(self, query_text: str, n_results: int = 6) -> list[str]:
        """Return the top-N most relevant code chunks."""
        if self._use_chroma and self._col is not None:
            try:
                count = self._col.count()
                if count == 0:
                    return []
                result = self._col.query(
                    query_texts=[query_text],
                    n_results=min(n_results, count),
                )
                docs = result.get("documents", [[]])[0]
                return docs
            except Exception:
                self._use_chroma = False

        return self._fallback.query(query_text, n_results)

    @property
    def backend(self) -> str:
        return "chromadb" if self._use_chroma else "bm25"

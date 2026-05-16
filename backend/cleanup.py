"""
Background task: prune runs/ directories older than MAX_AGE_HOURS.
Runs every CLEANUP_INTERVAL_SECONDS inside the FastAPI process.
"""

from __future__ import annotations

import asyncio
import shutil
import time
from pathlib import Path

from backend.jobs import RUNS_DIR

MAX_AGE_HOURS = 24
CLEANUP_INTERVAL_SECONDS = 3600  # run once per hour


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        _prune(max_age_hours=MAX_AGE_HOURS)


def _prune(max_age_hours: int = MAX_AGE_HOURS) -> list[str]:
    """Delete run directories older than max_age_hours. Returns list of removed IDs."""
    cutoff = time.time() - max_age_hours * 3600
    removed: list[str] = []
    if not RUNS_DIR.exists():
        return removed
    for run_dir in RUNS_DIR.iterdir():
        if not run_dir.is_dir():
            continue
        try:
            if run_dir.stat().st_mtime < cutoff:
                shutil.rmtree(run_dir, ignore_errors=True)
                removed.append(run_dir.name)
        except OSError:
            pass
    return removed

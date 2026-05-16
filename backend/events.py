"""
Server-Sent Events helpers.

Usage:
    return EventSourceResponse(sse_generator(job_id, manager, request))
"""

from __future__ import annotations

import asyncio
import json

from fastapi import Request
from fastapi.responses import StreamingResponse

from backend.jobs import Status


def _format(data: dict, event_name: str | None = None) -> str:
    """Encode one SSE frame."""
    lines = []
    if event_name:
        lines.append(f"event: {event_name}")
    lines.append(f"data: {json.dumps(data)}")
    lines.append("")  # blank line = end of frame
    lines.append("")
    return "\n".join(lines)


async def sse_generator(job_id: str, manager, request: Request):
    """
    Async generator that yields SSE frames.

    - Replays all past events first so late-joining clients see full history.
    - Then streams new events from the per-connection queue.
    - Emits a heartbeat comment every 25 s to keep the connection alive through
      proxies.
    - Exits cleanly once the job reaches a terminal stage or the client disconnects.
    """
    q = manager.subscribe(job_id)
    try:
        # Replay history
        for event in manager.replay_log(job_id):
            yield _format(event)

        # Fast-path: job already terminal when client connects
        job = manager.get(job_id)
        if job and job.get("status") in Status.TERMINAL:
            return

        # Stream live events
        while True:
            if await request.is_disconnected():
                break

            try:
                event = await asyncio.wait_for(q.get(), timeout=25.0)
            except asyncio.TimeoutError:
                # Heartbeat keeps proxy connections alive
                yield ": heartbeat\n\n"
                continue

            yield _format(event)

            stage = event.get("stage") if event.get("type") == "stage_change" else None
            if stage in Status.TERMINAL or event.get("type") == "error":
                break
    finally:
        manager.unsubscribe(job_id, q)


def make_sse_response(generator) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # tell nginx not to buffer SSE
            "Connection": "keep-alive",
        },
    )

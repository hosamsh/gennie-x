"""
SSE Streaming - Server-Sent Events utilities for real-time log streaming.

Provides utilities for streaming output from long-running operations
to the frontend via SSE.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi.responses import StreamingResponse

from src.web.services.pipeline_run_tracker import get_pipeline_run_tracker


class SSELogHandler(logging.Handler):
    """Bridge stdlib `logging` -> per-run SSE.

    This handler is meant to be temporarily attached to the `"src"` logger during
    a specific run triggered from the web frontend (e.g., extraction)
    so that any `logging.getLogger("src.*")` output becomes SSE events of type `log`.
    """

    def __init__(self, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
        super().__init__()
        self.queue = queue
        self.loop = loop

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            # Schedule the async put on the event loop
            asyncio.run_coroutine_threadsafe(
                self.queue.put({"type": "log", "message": msg}), self.loop
            )
        except Exception:
            self.handleError(record)

class SSELogger:
    """Per-run *producer* for structured SSE events.

    Use this from async pipeline/service code to send structured events that the
    frontend can act on (`status`, `progress`, `error`, `done`) in addition to
    plain log lines (`log`).
    """

    def __init__(self, run_id: str):
        self.run_id = run_id
        self._tracker = get_pipeline_run_tracker()

    @property
    def queue(self) -> asyncio.Queue:
        return self._tracker.get_queue(self.run_id)

    async def log(self, message: str) -> None:
        """Send a log message."""
        await self.queue.put({"type": "log", "message": message})
        await asyncio.sleep(0)

    async def status(self, status: str) -> None:
        """Send a status update."""
        self._tracker.set_status(self.run_id, status)
        await self.queue.put({"type": "status", "status": status})
        await asyncio.sleep(0)

    async def error(self, error: str) -> None:
        """Send an error message."""
        self._tracker.set_error(self.run_id, error)
        await self.queue.put({"type": "error", "message": error})
        await asyncio.sleep(0)

    async def progress(
        self, current: int, total: int, completed: int = 0, failed: int = 0, skipped: int = 0
    ) -> None:
        """Send a progress update."""
        await self.queue.put(
            {
                "type": "progress",
                "current": current,
                "total": total,
                "completed": completed,
                "failed": failed,
                "skipped": skipped,
            }
        )
        await asyncio.sleep(0)

    async def done(self) -> None:
        """Signal that the stream is complete."""
        await self.queue.put({"type": "done"})
        await asyncio.sleep(0)

async def create_per_run_sse_response(run_id: str) -> StreamingResponse:
    """Create the *consumer* side of SSE for a given run.

    The browser connects to `/api/run/{run_id}/stream`; this response continuously
    reads that run's queue and streams each item as an SSE `data:` frame until a
    `{"type": "done"}` message is received.
    """

    async def event_generator() -> AsyncGenerator[str, None]:
        tracker = get_pipeline_run_tracker()
        queue = tracker.get_queue(run_id)

        while True:
            try:
                # Wait for next message with timeout
                message = await asyncio.wait_for(queue.get(), timeout=30.0)

                # Send the message as SSE event
                yield f"data: {json.dumps(message)}\n\n"

                # If done, stop the stream
                if message.get("type") == "done":
                    break

            except asyncio.TimeoutError:
                # Send keepalive to prevent connection timeout
                yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


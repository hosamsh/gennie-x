"""
Run Registry - Tracks streaming extraction/analysis runs.

Provides an in-memory registry for managing long-running background jobs
and their output queues for SSE streaming.
"""

from __future__ import annotations

import asyncio
from typing import Any


class PipelineRunTracker:
    """Simple in-memory tracker for running extraction pipeline jobs."""

    def __init__(self):
        self._runs: dict[str, dict] = {}
        self._queues: dict[str, asyncio.Queue] = {}

    def create_run(self, run_id: str, metadata: dict) -> None:
        """Create a new run entry with metadata."""
        self._runs[run_id] = metadata
        self._queues[run_id] = asyncio.Queue()

    def get_run(self, run_id: str) -> dict:
        """Get run metadata dict."""
        return self._runs.get(run_id, {})

    def get_queue(self, run_id: str) -> asyncio.Queue:
        """Get the output queue for a run."""
        return self._queues.get(run_id, asyncio.Queue())

    def set_status(self, run_id: str, status: str) -> None:
        """Update run status."""
        if run_id in self._runs:
            self._runs[run_id]["status"] = status

    def set_error(self, run_id: str, error: str) -> None:
        """Set error message for a run."""
        if run_id in self._runs:
            self._runs[run_id]["error"] = error

    def update_run(self, run_id: str, **kwargs: Any) -> None:
        """Update run metadata with additional fields."""
        if run_id in self._runs:
            self._runs[run_id].update(kwargs)

    def has_run(self, run_id: str) -> bool:
        """Check if a run exists."""
        return run_id in self._runs

    def cleanup_run(self, run_id: str) -> None:
        """Remove a completed run from the registry."""
        self._runs.pop(run_id, None)
        self._queues.pop(run_id, None)


# Global tracker instance - singleton
_tracker: PipelineRunTracker | None = None


def get_pipeline_run_tracker() -> PipelineRunTracker:
    """Get the global pipeline run tracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = PipelineRunTracker()
    return _tracker

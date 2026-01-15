"""Run Streaming Endpoints - API endpoints for streaming run output.

This router centralizes SSE streaming for long-running runs
(extraction, etc.) behind a single endpoint.
"""

from __future__ import annotations

from fastapi import APIRouter

from src.web.services.sse_streaming import create_per_run_sse_response

router = APIRouter(tags=["runs"])


@router.get("/api/run/{run_id}/stream")
async def stream_run_output(run_id: str):
    """Stream run output via Server-Sent Events."""
    return await create_per_run_sse_response(run_id)

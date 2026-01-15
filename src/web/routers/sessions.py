"""
Session Endpoints - API endpoints for session and turn browsing.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from src.web.shared_state import (
    get_all_workspace_metadata,
    get_sessions_for_workspace,
    get_turns_for_session,
)
from src.web.utils.perf_timer import PerfTimer
router = APIRouter(tags=["sessions"])


@router.get("/api/browse/workspace/{workspace_id}/sessions")
async def get_workspace_sessions(workspace_id: str):
    """Get all sessions for a workspace across all agents."""
    perf = PerfTimer(f"GET /api/browse/workspace/{workspace_id[:8]}/sessions")
    
    # Get unified workspace metadata
    all_metadata = get_all_workspace_metadata()
    metadata = all_metadata.get(workspace_id)
    perf.checkpoint("get_all_workspace_metadata")
    
    if not metadata:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    agents = metadata.agents
    all_sessions: list[dict[str, Any]] = []
    for agent in agents:
        sessions = get_sessions_for_workspace(workspace_id, agent)
        perf.checkpoint(f"get_sessions_for_workspace({agent})")
        for s in sessions:
            s["agent"] = agent
        all_sessions.extend(sessions)

    all_sessions.sort(key=lambda s: s.get("first_timestamp") or "")
    perf.done()
    return {"sessions": all_sessions, "agents": agents}


@router.get("/api/browse/session/{session_id}/turns")
async def get_session_turns(session_id: str):
    """Get all turns for a session."""
    perf = PerfTimer(f"GET /api/browse/session/{session_id[:8]}/turns")
    turns = get_turns_for_session(session_id)
    perf.done()
    return {"turns": turns}

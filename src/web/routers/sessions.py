"""
Session Endpoints - API endpoints for session and turn browsing.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.web.shared_state import (
    get_all_workspace_metadata,
    get_sessions_for_workspace_by_folder,
    get_turns_for_session,
)
from src.web.utils.perf_timer import PerfTimer
router = APIRouter(tags=["sessions"])


@router.get("/api/browse/workspace/{workspace_id}/sessions")
async def get_workspace_sessions(workspace_id: str):
    """Get all sessions for a workspace across all agents.
    
    Sessions are consolidated by workspace_folder, so workspaces that share
    the same folder (e.g., copilot + claude_code on the same project) will
    have their sessions combined in this view.
    """
    perf = PerfTimer(f"GET /api/browse/workspace/{workspace_id[:8]}/sessions")
    
    # Get unified workspace metadata
    all_metadata = get_all_workspace_metadata()
    metadata = all_metadata.get(workspace_id)
    perf.checkpoint("get_all_workspace_metadata")
    
    if not metadata:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    agents = metadata.agents
    # Use folder-based query for cross-agent consolidation
    # Pass 'all' to get sessions from all agents sharing the same folder
    all_sessions = get_sessions_for_workspace_by_folder(workspace_id, 'all')
    perf.checkpoint("get_sessions_for_workspace_by_folder")
    
    # Add agent info to each session if not already present
    for s in all_sessions:
        if "agent" not in s and "agents" in s:
            # Use first agent if multiple
            s["agent"] = s["agents"][0] if s["agents"] else "unknown"

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

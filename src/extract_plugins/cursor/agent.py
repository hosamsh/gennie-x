"""Cursor workspace extractor - adapts extractor implementation to agent framework.

This module provides the CursorExtractor class that implements the AgentExtractor
interface for the Cursor IDE chat extraction.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

from src.shared.logging.logger import get_logger
from src.extract_plugins.agent_extractor import (
    AgentExtractor,
    ExtractedWorkspace,
    WorkspaceActivity,
)
from src.shared.models.workspace import WorkspaceInfo

# Import the extraction implementation
from .extractor import (
    discover_workspaces,
    extract_workspace,
    get_workspace_activity,
    WorkspaceMeta,
    get_workspace_storage,
    get_global_storage,
)

logger = get_logger(__name__)


class CursorExtractor(AgentExtractor):
    """Cursor extractor using clean implementation from CURSOR_EXTRACTOR_SPEC.md.
    
    This adapter bridges the internal extractor to the agent framework interface.
    
    Cursor stores chat data in SQLite databases:
    - Global database: globalStorage/state.vscdb (contains most composer data)
    - Workspace databases: workspaceStorage/{id}/state.vscdb (fallback)
    
    Key concepts:
    - Composer: A chat session (conversation)
    - Bubble: A single message (user or assistant)
    """
    
    AGENT_NAME = "cursor"
    
    def __init__(self, workspace_id: str, workspace_meta: Optional[WorkspaceMeta] = None):
        super().__init__(workspace_id)
        self._meta = workspace_meta
        self._workspace_cache: Dict[str, WorkspaceMeta] = {}
    
    @classmethod
    def create(cls, workspace_id: str, **kwargs) -> "CursorExtractor":
        """Factory method to create extractor instance."""
        return cls(workspace_id, workspace_meta=kwargs.get("workspace_meta"))
    
    def scan_workspaces(self) -> List[WorkspaceInfo]:
        """Scan for available workspaces with Cursor chat sessions.
        
        Returns only workspaces with validated, extractable sessions.
        The session_count reflects actual extractable sessions, not raw composer list.
        """
        # Get paths from config if available
        workspace_storage = None
        global_storage = None
        
        if self.config:
            ws_path = self.config.get('workspace_storage')
            if ws_path:
                workspace_storage = Path(ws_path)
            
            gs_path = self.config.get('global_storage')
            if gs_path:
                global_storage = Path(gs_path) / "state.vscdb"
        
        # Use defaults if not in config
        if not workspace_storage:
            workspace_storage = get_workspace_storage()
        if not global_storage:
            global_storage = get_global_storage() / "state.vscdb"
        
        workspaces = discover_workspaces(
            workspace_storage=workspace_storage,
            global_db_path=global_storage,
        )
        
        result = []
        for meta in workspaces:
            # Cache for later use
            self._workspace_cache[meta.workspace_id] = meta
            
            result.append(WorkspaceInfo(
                workspace_id=meta.workspace_id,
                workspace_name=meta.workspace_name,
                workspace_folder=meta.workspace_folder,
                agents=[self.AGENT_NAME],
                session_count=len(meta.composer_ids),  # Already validated
            ))
        
        return result
    
    def extract_sessions(self) -> ExtractedWorkspace:
        """Extract all turns from the workspace.
        
        Returns ExtractedWorkspace with turns (raw data only, no computed fields).
        The orchestrator enriches these via turn_enrichment.py.
        """
        meta = self._get_workspace_meta()
        if not meta:
            logger.warning(f"Workspace not found: {self.workspace_id}")
            return ExtractedWorkspace(
                turns=[],
                session_count=0,
                agent_name=self.AGENT_NAME,
                workspace_id=self.workspace_id,
                code_metrics=[],
            )
        
        # Get global db path from config if available
        global_db_path = None
        if self.config:
            gs_path = getattr(self.config, 'global_storage', None)
            if gs_path:
                global_db_path = Path(gs_path) / "state.vscdb"
        
        # Extract using implementation
        turns, session_count = extract_workspace(meta, global_db_path)
        
        return ExtractedWorkspace(
            turns=turns,
            session_count=session_count,
            agent_name=self.AGENT_NAME,
            workspace_id=self.workspace_id,
            code_metrics=[],
        )
    
    def get_latest_activity(self) -> Optional[WorkspaceActivity]:
        """Get quick stats from source without full extraction.
        
        Used to detect if re-extraction is needed by comparing counts.
        """
        meta = self._get_workspace_meta()
        if not meta:
            return None
        
        # Get global db path from config if available
        global_db_path = None
        if self.config:
            gs_path = getattr(self.config, 'global_storage', None)
            if gs_path:
                global_db_path = Path(gs_path) / "state.vscdb"
        
        session_count, turn_count, session_ids = get_workspace_activity(
            meta, global_db_path
        )
        
        return WorkspaceActivity(
            session_count=session_count,
            turn_count=turn_count,
            session_ids=session_ids,
        )
    
    def cleanup(self) -> None:
        """Cleanup resources.
        
        Database connections are managed per-operation and closed after use,
        so no cleanup is needed here.
        """
        pass
    
    def _get_workspace_meta(self) -> Optional[WorkspaceMeta]:
        """Get workspace metadata, discovering if needed."""
        if self._meta:
            return self._meta
        
        # Check cache
        if self.workspace_id in self._workspace_cache:
            return self._workspace_cache[self.workspace_id]
        
        # Get paths from config if available
        workspace_storage = None
        global_db_path = None
        
        if self.config:
            ws_path = getattr(self.config, 'workspace_storage', None)
            if ws_path:
                workspace_storage = Path(ws_path)
            
            gs_path = getattr(self.config, 'global_storage', None)
            if gs_path:
                global_db_path = Path(gs_path) / "state.vscdb"
        
        # Discover all workspaces and find ours
        for meta in discover_workspaces(workspace_storage, global_db_path):
            self._workspace_cache[meta.workspace_id] = meta
            if meta.workspace_id == self.workspace_id:
                self._meta = meta
                return meta
        
        return None


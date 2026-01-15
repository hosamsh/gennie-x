"""Claude Code workspace extractor - adapts extractor implementation to agent framework.

This module provides the Claude_CodeExtractor class that implements the AgentExtractor
interface for the Claude Code IDE chat extraction.
"""
from __future__ import annotations

from typing import List, Optional

from src.shared.logging.logger import get_logger
from src.extract_plugins.agent_extractor import (
    AgentExtractor,
    ExtractedWorkspace,
    WorkspaceActivity,
)
from src.shared.models.workspace import WorkspaceInfo

# Import the extraction implementation
from .extractor import (
    ClaudeCodeExtractor as ClaudeCodeExtractorImpl,
)

logger = get_logger(__name__)


class Claude_CodeExtractor(AgentExtractor):
    """Claude Code extractor adapter to agent framework.
    
    This adapter bridges the internal extractor to the agent framework interface.
    
    Claude Code stores chat data in:
    - ~/.claude/history.jsonl (contains project references and session metadata)
    - ~/.claude/projects/{encoded_path}/*.jsonl (session files)
    """
    
    AGENT_NAME = "claude_code"
    
    def __init__(self, workspace_id: str):
        super().__init__(workspace_id)
        self._impl = ClaudeCodeExtractorImpl(workspace_id)
    
    @classmethod
    def create(cls, workspace_id: str, **kwargs) -> "Claude_CodeExtractor":
        """Factory method to create extractor instance."""
        return cls(workspace_id)
    
    def scan_workspaces(self) -> List[WorkspaceInfo]:
        """Scan for available workspaces with Claude Code chat sessions."""
        return self._impl.scan_workspaces()
    
    def extract_sessions(self) -> ExtractedWorkspace:
        """Extract all turns from the workspace."""
        return self._impl.extract_sessions()
    
    def get_latest_activity(self) -> Optional[WorkspaceActivity]:
        """Get the latest activity for the workspace."""
        return self._impl.get_latest_activity()
    
    def cleanup(self) -> None:
        """Clean up any resources."""
        self._impl.cleanup()

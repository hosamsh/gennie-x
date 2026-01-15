"""Base class for agent-specific extraction logic."""
from __future__ import annotations

from typing import ClassVar, List, Optional
from abc import ABC, abstractmethod

from src.shared.logging.logger import get_logger
from src.shared.models.workspace import WorkspaceInfo, WorkspaceActivity, ExtractedWorkspace
from src.shared.config.config_loader import get_extract_config
from src.shared.config.models import ExtractConfig

logger = get_logger(__name__)


class AgentExtractor(ABC):
    """Base class for agent extractors. Subclasses must implement AGENT_NAME, scan_workspaces(), create(), extract_sessions(), get_latest_activity(), cleanup()."""
    
    AGENT_NAME: ClassVar[str] = ""
    
    def __init__(self, workspace_id: str):
        self.workspace_id = workspace_id
        self.config = self._load_config()
        
    def _load_config(self) -> ExtractConfig:
        """Load agent-specific configuration from config.yaml."""
        if not self.AGENT_NAME:
            raise NotImplementedError(
                f"{self.__class__.__name__} must define AGENT_NAME class attribute"
            )
        return get_extract_config(self.AGENT_NAME)
    
    @abstractmethod
    def scan_workspaces(self) -> List[WorkspaceInfo]:
        """Scan agent storage and return list of available workspaces."""
        pass
    
    @classmethod
    @abstractmethod
    def create(cls, workspace_id: str, **kwargs) -> "AgentExtractor":
        """Factory method to create extractor instance."""
        pass
        
    @abstractmethod
    def extract_sessions(self) -> "ExtractedWorkspace":
        """Extract all turns from the workspace. Returns ExtractedWorkspace."""
        pass
    
    @abstractmethod
    def get_latest_activity(self) -> Optional[WorkspaceActivity]:
        """Get quick stats from source files without full extraction."""
        pass
    
    @abstractmethod
    def cleanup(self) -> None:
        """Cleanup resources (e.g., close database connections)."""
        pass

"""Combined Turn Model for extraction and analysis.

Combines consecutive user-assistant turn pairs into a single record.
This enables analyzing interactions as coherent exchanges rather than isolated turns.

Used in:
- Extraction: Created from raw Turn pairs, contains all extraction data
- Web dashboards: Source data for analysis and visualization
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from .dataclass_mixin import DataclassIO

if TYPE_CHECKING:
    from .turn import EnrichedTurn, CodeEdit


@dataclass
class CombinedTurn(DataclassIO):
    """A combined user-assistant turn pair.
    
    Represents a coherent exchange: a user message and the agent's response.
    Contains all raw extraction data.
    """
    
    # =========================================================================
    # Identifiers
    # =========================================================================
    session_id: str
    workspace_id: str = ""
    exchange_index: int = 0  # 0-based index within session
    chunk_id: Optional[int] = None  # Assigned during chunking (Stage 2/3)
    
    # Turn numbers (from original Turn records)
    user_turn_number: int = 0
    assistant_turn_number: int = 0
    
    # =========================================================================
    # Workspace context
    # =========================================================================
    workspace_name: str = ""
    workspace_folder: str = ""
    session_name: str = ""
    
    # =========================================================================
    # User turn - raw extraction data
    # =========================================================================
    user_cleaned_text: str = ""
    user_original_text: str = ""
    user_files: List[str] = field(default_factory=list)
    user_languages: List[str] = field(default_factory=list)
    user_primary_language: Optional[str] = None
    user_timestamp_ms: Optional[int] = None
    user_timestamp_iso: Optional[str] = None
    user_request_id: str = ""
    user_original_text_tokens: int = 0
    user_cleaned_text_tokens: int = 0
    user_code_tokens: int = 0
    user_tool_tokens: int = 0
    
    # =========================================================================
    # Assistant turn - raw extraction data
    # =========================================================================
    assistant_cleaned_text: str = ""
    assistant_original_text: str = ""
    assistant_files: List[str] = field(default_factory=list)
    assistant_tools: List[str] = field(default_factory=list)
    assistant_languages: List[str] = field(default_factory=list)
    assistant_primary_language: Optional[str] = None
    assistant_timestamp_ms: Optional[int] = None
    assistant_timestamp_iso: Optional[str] = None
    assistant_request_id: str = ""
    assistant_original_text_tokens: int = 0
    assistant_cleaned_text_tokens: int = 0
    assistant_code_tokens: int = 0
    assistant_tool_tokens: int = 0
    
    # Response timing
    response_time_ms: Optional[int] = None
    
    # =========================================================================
    # Code edits (from assistant turn)
    # =========================================================================
    # Note: code_edits stored as list of dicts for JSON serialization
    # Use get_code_edits() to get CodeEdit objects
    code_edits: List[Dict[str, Any]] = field(default_factory=list)
    
    # Aggregated code metrics
    total_lines_added: Optional[int] = None
    total_lines_removed: Optional[int] = None
    total_nloc_change: Optional[int] = None
    weighted_complexity_change: Optional[float] = None
    
    # =========================================================================
    # Metadata
    # =========================================================================
    model_id: str = ""
    agent_used: str = ""
    
    @property
    def user_total_tokens(self) -> int:
        """Calculate total tokens for user turn."""
        return (
            self.user_original_text_tokens +
            self.user_code_tokens +
            self.user_tool_tokens
        )
    
    @property
    def assistant_total_tokens(self) -> int:
        """Calculate total tokens for assistant turn."""
        return (
            self.assistant_original_text_tokens +
            self.assistant_code_tokens +
            self.assistant_tool_tokens
        )
    
    @property
    def total_tokens(self) -> int:
        """Calculate total tokens for the exchange (user + assistant)."""
        return self.user_total_tokens + self.assistant_total_tokens
    
    # =========================================================================
    # Factory methods
    # =========================================================================
    
    @classmethod
    def from_turns(
        cls,
        user_turn: "EnrichedTurn",
        assistant_turn: "EnrichedTurn",
        exchange_index: int = 0,
    ) -> "CombinedTurn":
        """Create a CombinedTurn from Turn objects (extraction).
        
        This is the primary factory method for creating CombinedTurn records
        from raw extracted Turn objects.
        
        Args:
            user_turn: The user's Turn object
            assistant_turn: The assistant's Turn object  
            exchange_index: 0-based position of this exchange in the session
            
        Returns:
            CombinedTurn instance with all extraction data
        """
        # Serialize code_edits to dicts for storage
        code_edits_dicts = []
        if assistant_turn.code_edits:
            for edit in assistant_turn.code_edits:
                if hasattr(edit, 'to_dict'):
                    code_edits_dicts.append(edit.to_dict())
                elif isinstance(edit, dict):
                    code_edits_dicts.append(edit)
        
        return cls(
            # Identifiers
            session_id=user_turn.session_id,
            workspace_id=user_turn.workspace_id,
            exchange_index=exchange_index,
            user_turn_number=user_turn.turn,
            assistant_turn_number=assistant_turn.turn,
            
            # Workspace context
            workspace_name=user_turn.workspace_name,
            workspace_folder=user_turn.workspace_folder,
            session_name=user_turn.session_name,
            
            # User turn data
            user_cleaned_text=user_turn.cleaned_text,
            user_original_text=user_turn.original_text,
            user_files=user_turn.files,
            user_languages=user_turn.languages,
            user_primary_language=user_turn.primary_language,
            user_timestamp_ms=user_turn.timestamp_ms,
            user_timestamp_iso=user_turn.timestamp_iso,
            user_request_id=user_turn.request_id,
            user_original_text_tokens=user_turn.original_text_tokens,
            user_cleaned_text_tokens=user_turn.cleaned_text_tokens,
            user_code_tokens=user_turn.code_tokens,
            user_tool_tokens=user_turn.tool_tokens,
            
            # Assistant turn data
            assistant_cleaned_text=assistant_turn.cleaned_text,
            assistant_original_text=assistant_turn.original_text,
            assistant_files=assistant_turn.files,
            assistant_tools=assistant_turn.tools,
            assistant_languages=assistant_turn.languages,
            assistant_primary_language=assistant_turn.primary_language,
            assistant_timestamp_ms=assistant_turn.timestamp_ms,
            assistant_timestamp_iso=assistant_turn.timestamp_iso,
            assistant_request_id=assistant_turn.request_id,
            assistant_original_text_tokens=assistant_turn.original_text_tokens,
            assistant_cleaned_text_tokens=assistant_turn.cleaned_text_tokens,
            assistant_code_tokens=assistant_turn.code_tokens,
            assistant_tool_tokens=assistant_turn.tool_tokens,
            
            # Response timing
            response_time_ms=assistant_turn.response_time_ms,
            
            # Code edits
            code_edits=code_edits_dicts,
            total_lines_added=assistant_turn.total_lines_added,
            total_lines_removed=assistant_turn.total_lines_removed,
            total_nloc_change=assistant_turn.total_nloc_change,
            weighted_complexity_change=assistant_turn.weighted_complexity_change,
            
            # Metadata
            model_id=assistant_turn.model_id,
            agent_used=assistant_turn.agent_used,
        )
    
    def get_code_edits(self) -> List["CodeEdit"]:
        """Get code edits as CodeEdit objects.
        
        Returns:
            List of CodeEdit objects
        """
        from .turn import CodeEdit
        
        result = []
        for edit in self.code_edits:
            result.append(CodeEdit.from_dict(edit))
        return result


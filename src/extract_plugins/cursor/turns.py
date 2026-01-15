"""Turn building logic for Cursor chat data.

Handles building Turn objects from bubbles with merging and deduplication.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.shared.models.turn import Turn, CodeEdit
from src.shared.io.paths import normalize_path, decode_file_uri

from .bubbles import (
    BubbleData,
    is_thinking_only_bubble,
    should_skip_bubble,
    should_merge_bubble,
)


@dataclass
class WorkspaceMeta:
    """Workspace metadata."""
    workspace_id: str
    workspace_name: str
    workspace_folder: str
    path: Any  # Path to workspace storage folder
    composer_ids: List[str] = field(default_factory=list)


@dataclass
class TurnBuilder:
    """Helper class to build turns from bubbles with merging logic."""
    session_id: str
    workspace_meta: WorkspaceMeta
    session_name: str
    session_timestamp_ms: Optional[int] = None
    inline_diffs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    original_file_states: Dict[str, str] = field(default_factory=dict)
    
    def build_turns(self, bubbles: List[BubbleData]) -> List[Turn]:
        """Build turns from a list of bubbles, applying merging rules."""
        turns: List[Turn] = []
        current_turn: Optional[Dict[str, Any]] = None
        
        for bubble in bubbles:
            # Skip completely empty bubbles
            if should_skip_bubble(bubble):
                continue
            
            role = "user" if bubble.type == 1 else "assistant"
            
            # Rule 1: Thinking-only bubbles are merged into current or previous assistant turn
            if is_thinking_only_bubble(bubble):
                if current_turn and current_turn["role"] == "assistant":
                    # Merge thinking into current assistant turn
                    self._merge_bubble_into_turn(current_turn, bubble)
                # else: thinking-only bubble with no current assistant turn - skip it
                # (this is rare and would mean thinking without any response)
                continue
            
            # Rule 2: Tool-only bubbles merge into previous assistant turn
            if should_merge_bubble(bubble) and current_turn and current_turn["role"] == "assistant":
                self._merge_bubble_into_turn(current_turn, bubble)
                continue
            
            # Rule 3: Merge consecutive same-role bubbles
            if current_turn and current_turn["role"] == role:
                self._merge_bubble_into_turn(current_turn, bubble)
                continue
            
            # Finalize previous turn
            if current_turn:
                turns.append(self._finalize_turn(current_turn, len(turns)))
            
            # Start new turn
            current_turn = self._create_turn_dict(bubble, role)
        
        # Finalize last turn
        if current_turn:
            turns.append(self._finalize_turn(current_turn, len(turns)))
        
        return turns
    
    def _create_turn_dict(self, bubble: BubbleData, role: str) -> Dict[str, Any]:
        """Create a new turn dictionary from a bubble."""
        return {
            "role": role,
            "text_parts": [bubble.text] if bubble.text else [],
            "bubble_ids": [bubble.bubble_id],
            "tools": [bubble.tool_name] if bubble.tool_name else [],
            "thinking": bubble.thinking,
            "thinking_ms": bubble.thinking_ms,
            "model_info": bubble.model_info,
            "timestamps": [bubble.timestamp_ms] if bubble.timestamp_ms else [],
            "timestamp_iso": bubble.timestamp_iso,
            "code_blocks": list(bubble.code_blocks),
            "codeblock_ids": list(bubble.codeblock_ids),
        }
    
    def _merge_bubble_into_turn(self, turn: Dict[str, Any], bubble: BubbleData) -> None:
        """Merge a bubble into an existing turn."""
        # Merge text
        if bubble.text:
            turn["text_parts"].append(bubble.text)
        
        # Track bubble IDs
        turn["bubble_ids"].append(bubble.bubble_id)
        
        # Merge tools
        if bubble.tool_name and bubble.tool_name not in turn["tools"]:
            turn["tools"].append(bubble.tool_name)
        
        # Merge thinking
        if bubble.thinking:
            if turn["thinking"]:
                turn["thinking"] += "\n\n" + bubble.thinking
            else:
                turn["thinking"] = bubble.thinking
        
        # Sum thinking_ms
        turn["thinking_ms"] += bubble.thinking_ms
        
        # Track timestamps
        if bubble.timestamp_ms:
            turn["timestamps"].append(bubble.timestamp_ms)
        
        # Update model_info if not set
        if not turn["model_info"] and bubble.model_info:
            turn["model_info"] = bubble.model_info
        
        # Merge code blocks
        turn["code_blocks"].extend(bubble.code_blocks)
        turn["codeblock_ids"].extend(bubble.codeblock_ids)
    
    def _finalize_turn(self, turn: Dict[str, Any], turn_index: int) -> Turn:
        """Finalize a turn dictionary into a Turn object."""
        role = turn["role"]
        
        # Build text from parts
        text_parts = turn["text_parts"]
        if len(text_parts) > 1:
            # Join with newlines, prefix subsequent parts
            text = text_parts[0]
            for part in text_parts[1:]:
                text += "\n\n_ " + part
        elif text_parts:
            text = text_parts[0]
        else:
            text = ""
        
        # Store original text only - cleaning happens during enrichment
        original_text = text
        
        # Calculate timestamp based on role convention
        timestamps = turn["timestamps"]
        if timestamps:
            if role == "user":
                # User: use earliest timestamp
                timestamp_ms = min(timestamps)
            else:
                # Assistant: use latest timestamp
                timestamp_ms = max(timestamps)
        else:
            timestamp_ms = self.session_timestamp_ms
        
        # Build timestamp_iso
        timestamp_iso = None
        if timestamp_ms:
            try:
                dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
                timestamp_iso = dt.isoformat()
            except (ValueError, OSError, OverflowError):
                pass
        
        # Build code edits from code blocks
        code_edits = self._build_code_edits(turn)
        
        # Extract thinking content for reasoning models
        thinking = turn["thinking"] or ""
        thinking_ms = turn["thinking_ms"] or 0
        
        # Build extra dict (for additional metadata not in core fields)
        extra: Dict[str, Any] = {}
        if timestamps and len(timestamps) > 1:
            if role == "user":
                extra["timestamp_end_ms"] = max(timestamps)
            else:
                extra["timestamp_start_ms"] = min(timestamps)
        
        bubble_ids = turn["bubble_ids"]
        request_id = bubble_ids[0] if bubble_ids else ""
        merged_request_ids = bubble_ids if len(bubble_ids) > 1 else []
        
        # Model ID only for assistant turns
        model_id = turn["model_info"] if role == "assistant" else ""
        
        return Turn(
            session_id=self.session_id,
            turn=turn_index,
            role=role,
            original_text=original_text,
            workspace_id=self.workspace_meta.workspace_id,
            workspace_name=self.workspace_meta.workspace_name,
            workspace_folder=self.workspace_meta.workspace_folder,
            session_name=self.session_name,
            agent_used="cursor",
            model_id=model_id or "",
            request_id=request_id,
            merged_request_ids=merged_request_ids,
            timestamp_ms=timestamp_ms,
            timestamp_iso=timestamp_iso,
            ts=str(timestamp_ms) if timestamp_ms else "",
            files=[],  # Context files extracted separately if needed
            tools=turn["tools"],
            code_edits=code_edits,
            thinking_text=thinking,
            thinking_duration_ms=thinking_ms,
            extra=extra,
        )
    
    def _build_code_edits(self, turn: Dict[str, Any]) -> List[CodeEdit]:
        """Build code edits from turn's code blocks with deduplication."""
        code_blocks = turn["code_blocks"]
        if not code_blocks:
            return []
        
        # Track edits by normalized file path for deduplication
        file_edits: Dict[str, Dict[str, Any]] = {}  # normalized_path -> tracker
        
        for block in code_blocks:
            file_path = block.get("file_path", "")
            if not file_path:
                continue  # Skip inline code examples without file path
            
            normalized_path = normalize_path(file_path).lower()
            codeblock_id = block.get("codeblock_id", "")
            
            if normalized_path not in file_edits:
                file_edits[normalized_path] = {
                    "file_path": file_path,
                    "language_id": block.get("language_id", ""),
                    "first_codeblock_id": codeblock_id,
                    "last_codeblock_id": codeblock_id,
                    "last_content": block.get("content", ""),
                }
            else:
                # Same file edited again - update last
                file_edits[normalized_path]["last_codeblock_id"] = codeblock_id
                file_edits[normalized_path]["last_content"] = block.get("content", "")
        
        # Build CodeEdit objects
        edits = []
        for tracker in file_edits.values():
            file_path = tracker["file_path"]
            first_id = tracker["first_codeblock_id"]
            last_id = tracker["last_codeblock_id"]
            
            # Get before content from first codeblock's inline diff or original file states
            before_content = None
            if first_id and first_id in self.inline_diffs:
                before_lines = self.inline_diffs[first_id].get("before_lines", [])
                before_content = "\n".join(before_lines)
            elif file_path:
                # Try original file states
                normalized = normalize_path(file_path)
                for uri, state in self.original_file_states.items():
                    if normalize_path(decode_file_uri(uri)) == normalized:
                        before_content = state
                        break
            
            # Get after content from last codeblock's inline diff or content
            after_content = None
            if last_id and last_id in self.inline_diffs:
                after_lines = self.inline_diffs[last_id].get("after_lines", [])
                after_content = "\n".join(after_lines)
            else:
                after_content = tracker.get("last_content")
            
            # Only add edit if we have meaningful content
            if after_content or before_content:
                edits.append(CodeEdit(
                    file_path=file_path,
                    language=tracker.get("language_id", ""),
                    code_before=before_content,
                    code_after=after_content,
                    extra={"codeblock_ids": [first_id, last_id] if first_id != last_id else [first_id]}
                ))
        
        return edits

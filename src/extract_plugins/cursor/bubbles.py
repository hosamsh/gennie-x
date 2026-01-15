"""Bubble parsing for Cursor chat data.

Handles parsing of raw bubble data from the Cursor database into BubbleData objects.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from src.shared.io.paths import normalize_path
from src.shared.text.stupid_text_cleaner import coerce_text


@dataclass
class BubbleData:
    """Parsed bubble data from database."""
    bubble_id: str
    type: int  # 1 = user, 2 = assistant
    text: str = ""
    thinking: str = ""
    thinking_ms: int = 0
    tool_name: str = ""
    model_info: Optional[str] = None
    timestamp_ms: Optional[int] = None
    timestamp_iso: Optional[str] = None
    code_blocks: List[Dict[str, Any]] = field(default_factory=list)
    codeblock_ids: List[str] = field(default_factory=list)


def parse_timestamp(value: Any) -> Tuple[Optional[int], Optional[str]]:
    """Parse various timestamp formats into (ms, iso) tuple."""
    if value is None:
        return None, None
    
    timestamp_ms = None
    
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None, None
        
        # Try numeric string
        if stripped.isdigit():
            timestamp_ms = int(stripped)
        else:
            # Try ISO format
            try:
                iso_str = stripped.replace("Z", "+00:00")
                dt = datetime.fromisoformat(iso_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                timestamp_ms = int(dt.timestamp() * 1000)
            except ValueError:
                return None, None
    elif isinstance(value, (int, float)):
        timestamp_ms = int(value)
    
    if timestamp_ms is None:
        return None, None
    
    # Validate timestamp is reasonable (after 2020)
    if timestamp_ms < 1577836800000:
        return None, None
    
    # Convert to ISO
    try:
        dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
        timestamp_iso = dt.isoformat()
        return timestamp_ms, timestamp_iso
    except (ValueError, OSError, OverflowError):
        return None, None


def extract_bubble_timestamp(bubble_data: Dict[str, Any]) -> Tuple[Optional[int], Optional[str]]:
    """Extract timestamp from bubble data with fallback chain."""
    # Priority 1: createdAt
    if "createdAt" in bubble_data:
        ts_ms, ts_iso = parse_timestamp(bubble_data["createdAt"])
        if ts_ms:
            return ts_ms, ts_iso
    
    # Priority 2: timingInfo.clientRpcSendTime
    timing = bubble_data.get("timingInfo", {})
    if timing.get("clientRpcSendTime"):
        ts_ms, ts_iso = parse_timestamp(timing["clientRpcSendTime"])
        if ts_ms:
            return ts_ms, ts_iso
    
    # Priority 3: timingInfo.clientEndTime
    if timing.get("clientEndTime"):
        ts_ms, ts_iso = parse_timestamp(timing["clientEndTime"])
        if ts_ms:
            return ts_ms, ts_iso
    
    return None, None


def parse_bubble(bubble_id: str, bubble_data: Dict[str, Any]) -> BubbleData:
    """Parse raw bubble data into BubbleData object."""
    bubble_type = bubble_data.get("type", 0)
    
    # Extract text
    text = coerce_text(bubble_data.get("text", "")).strip()
    
    # Extract thinking content
    thinking = coerce_text(bubble_data.get("thinking", "")).strip()
    thinking_ms = bubble_data.get("thinkingDurationMs", 0) or 0
    
    # Extract tool name
    tool_former = bubble_data.get("toolFormerData", {})
    tool_name = tool_former.get("name", "") if isinstance(tool_former, dict) else ""
    
    # Extract model info
    model_info = None
    mi = bubble_data.get("modelInfo", {})
    if isinstance(mi, dict) and mi.get("modelName"):
        model_info = mi["modelName"]
    
    # Extract timestamp
    ts_ms, ts_iso = extract_bubble_timestamp(bubble_data)
    
    # Extract code blocks
    code_blocks = []
    codeblock_ids = []
    for block in bubble_data.get("codeBlocks", []):
        if not isinstance(block, dict):
            continue
        
        uri = block.get("uri", {})
        file_path = ""
        if isinstance(uri, dict):
            file_path = uri.get("fsPath") or uri.get("path") or uri.get("_fsPath") or ""
        
        code_blocks.append({
            "file_path": normalize_path(file_path),
            "content": block.get("content", ""),
            "language_id": block.get("languageId", ""),
            "codeblock_id": block.get("codeblockId", ""),
            "codeblock_idx": block.get("codeBlockIdx", 0),
        })
        
        if block.get("codeblockId"):
            codeblock_ids.append(block["codeblockId"])
    
    return BubbleData(
        bubble_id=bubble_id,
        type=bubble_type,
        text=text,
        thinking=thinking,
        thinking_ms=thinking_ms,
        tool_name=tool_name,
        model_info=model_info,
        timestamp_ms=ts_ms,
        timestamp_iso=ts_iso,
        code_blocks=code_blocks,
        codeblock_ids=codeblock_ids,
    )


def is_thinking_only_bubble(bubble: BubbleData) -> bool:
    """Check if bubble is a thinking-only bubble (has thinking but no text/tool).
    
    These bubbles should be merged into adjacent assistant turns to preserve
    the thinking content, rather than being skipped entirely.
    """
    if bubble.type == 2:  # assistant
        if bubble.thinking and not bubble.text and not bubble.tool_name:
            return True
    return False


def should_skip_bubble(bubble: BubbleData) -> bool:
    """Check if bubble should be filtered out completely.
    
    Note: Thinking-only bubbles are NOT skipped - they are merged to preserve
    their thinking content. Only truly empty bubbles should be skipped.
    """
    # Skip empty assistant bubbles (no text, no tool, no thinking)
    if bubble.type == 2:  # assistant
        if not bubble.text and not bubble.tool_name and not bubble.thinking:
            return True
    return False


def should_merge_bubble(bubble: BubbleData) -> bool:
    """Check if bubble should be merged into previous turn (tool-only bubbles)."""
    # Rule 2: Merge tool-only bubbles into previous assistant turn
    if bubble.type == 2:  # assistant
        if bubble.tool_name and not bubble.text:
            return True
    return False

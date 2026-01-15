"""Token estimation utilities.

Simple character-based estimation for LLM token counts.
"""
from __future__ import annotations

from typing import Any, List, Optional


# Average characters per token for common tokenizers (approximation)
CHARS_PER_TOKEN = 4


def estimate_tokens(text: Optional[str]) -> int:
    """Estimate token count for a text string.
    
    Uses a simple character-based approximation.
    For more accurate counts, use tiktoken or model-specific tokenizers.
    
    Args:
        text: The text to estimate tokens for
        
    Returns:
        Estimated token count
    """
    if not text:
        return 0
    return max(1, len(text) // CHARS_PER_TOKEN)


def estimate_tool_tokens(tools: Optional[List[Any]]) -> int:
    """Estimate token count for tool calls.
    
    Args:
        tools: List of tool call objects or dicts
        
    Returns:
        Estimated token count for all tools
    """
    if not tools:
        return 0
    
    total = 0
    for tool in tools:
        if isinstance(tool, dict):
            # Estimate based on tool name and arguments
            name = tool.get("name", tool.get("type", ""))
            args = tool.get("arguments", tool.get("input", {}))
            total += estimate_tokens(str(name)) + estimate_tokens(str(args))
        elif hasattr(tool, "to_dict"):
            tool_dict = tool.to_dict()
            total += estimate_tokens(str(tool_dict))
        else:
            total += estimate_tokens(str(tool))
    
    return total

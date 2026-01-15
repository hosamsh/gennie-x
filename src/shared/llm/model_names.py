"""Model name normalization utilities.

Standardizes model identifiers across different sources and formats.
"""
from __future__ import annotations

import re
from typing import Optional


# Common model name mappings (raw name -> normalized name)
MODEL_ALIASES = {
    # GPT models
    "gpt4": "gpt-4",
    "gpt-4-turbo": "gpt-4-turbo",
    "gpt-4-turbo-preview": "gpt-4-turbo",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4o": "gpt-4o",
    "gpt-4.5-preview": "gpt-4.5",
    "gpt-4.1": "gpt-4.1",
    "gpt-5": "gpt-5",
    "gpt-3.5-turbo": "gpt-3.5-turbo",
    "gpt35": "gpt-3.5-turbo",
    
    # Claude models
    "claude-3-opus": "claude-3-opus",
    "claude-3-sonnet": "claude-3-sonnet",
    "claude-3-haiku": "claude-3-haiku",
    "claude-3.5-sonnet": "claude-3.5-sonnet",
    "claude-3.5-haiku": "claude-3.5-haiku",
    "claude-3.7-sonnet": "claude-3.7-sonnet",
    "claude-sonnet-4": "claude-sonnet-4",
    "claude-sonnet-4.5": "claude-sonnet-4.5",
    "claude-opus-4": "claude-opus-4",
    
    # Other models
    "o1-preview": "o1-preview",
    "o1-mini": "o1-mini",
    "o1": "o1",
    "o3": "o3",
    "o3-mini": "o3-mini",
}


def normalize_model_id(model_id: Optional[str]) -> Optional[str]:
    """Normalize a model identifier to a standard format.
    
    Args:
        model_id: Raw model identifier (e.g., "gpt-4-turbo-preview")
        
    Returns:
        Normalized model name (e.g., "gpt-4-turbo") or original if no mapping exists
    """
    if not model_id:
        return None
    
    # Lowercase and strip
    normalized = model_id.lower().strip()
    
    # Check direct alias
    if normalized in MODEL_ALIASES:
        return MODEL_ALIASES[normalized]
    
    # Try to extract base model name
    # Remove version suffixes like -20240101, -preview, etc.
    base = re.sub(r'-\d{6,}.*$', '', normalized)
    base = re.sub(r'-preview$', '', base)
    base = re.sub(r'-latest$', '', base)
    
    if base in MODEL_ALIASES:
        return MODEL_ALIASES[base]
    
    # Return original if no mapping found
    return model_id

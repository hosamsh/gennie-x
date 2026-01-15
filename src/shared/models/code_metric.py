"""Code metric model for tracking code changes and complexity metrics."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from .dataclass_mixin import DataclassIO


@dataclass
class CodeMetric(DataclassIO):
    """Code metrics for a file changed in a turn.
    
    This captures before/after state, complexity metrics, and line changes
    for code files modified during a conversation turn.
    """
    request_id: str
    file_path: str
    
    # Optional context
    session_id: Optional[str] = None
    workspace_id: Optional[str] = None
    agent_used: Optional[str] = None
    model_id: Optional[str] = None
    
    # Delta metrics (extracted from delta_metrics for convenience)
    delta_nloc: Optional[int] = None
    delta_complexity: Optional[float] = None
    lines_added: Optional[int] = None
    lines_removed: Optional[int] = None
    
    # Full metrics objects (stored as JSON in DB)
    before_metrics: Optional[Dict[str, Any]] = None
    after_metrics: Optional[Dict[str, Any]] = None
    delta_metrics: Optional[Dict[str, Any]] = None
    
    # Raw code content
    code_before: Optional[str] = None
    code_after: Optional[str] = None

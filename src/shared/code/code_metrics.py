"""
Code metrics calculation using lizard.
"""
import difflib
import lizard
from typing import Dict, Any, Tuple

from src.shared.logging.logger import get_logger

logger = get_logger(__name__)

def calculate_metrics(content: str, filename: str = "temp.py") -> Dict[str, Any]:
    """
    Calculate code metrics for a given string content.
    
    Args:
        content: The code content to analyze.
        filename: Virtual filename to help lizard determine language (default: temp.py).
        
    Returns:
        Dict containing metrics:
        - nloc: Non-comment lines of code
        - average_cyclomatic_complexity: Average CCN
        - token_count: Total tokens
        - max_cyclomatic_complexity: Max CCN in any function
    """
    if not content or not content.strip():
        return {
            "nloc": 0,
            "average_cyclomatic_complexity": 0,
            "token_count": 0,
            "max_cyclomatic_complexity": 0
        }

    try:
        analysis = lizard.analyze_file.analyze_source_code(filename, content)
        
        max_ccn = 0
        if analysis.function_list:
            max_ccn = max(f.cyclomatic_complexity for f in analysis.function_list)
            
        return {
            "nloc": analysis.nloc,
            "average_cyclomatic_complexity": analysis.average_cyclomatic_complexity,
            "token_count": analysis.token_count,
            "max_cyclomatic_complexity": max_ccn
        }
    except Exception as e:
        # Fallback for parsing errors
        logger.error(f"Failed to calculate metrics for {filename}: {e}", exc_info=True)
        return {
            "nloc": len([l for l in content.splitlines() if l.strip()]),
            "average_cyclomatic_complexity": 0,
            "token_count": 0,
            "max_cyclomatic_complexity": 0,
            "error": str(e)
        }


def count_diff_lines(before_content: str, after_content: str) -> Tuple[int, int]:
    """
    Count added and removed lines by comparing before/after content.
    Uses unified diff to accurately count changes.
    
    Args:
        before_content: Content before the change
        after_content: Content after the change
        
    Returns:
        Tuple of (lines_added, lines_removed)
    """
    before_lines = before_content.splitlines(keepends=True) if before_content else []
    after_lines = after_content.splitlines(keepends=True) if after_content else []
    
    diff = difflib.unified_diff(before_lines, after_lines, lineterm='')
    
    lines_added = 0
    lines_removed = 0
    
    for line in diff:
        if line.startswith('+') and not line.startswith('+++'):
            lines_added += 1
        elif line.startswith('-') and not line.startswith('---'):
            lines_removed += 1
            
    return lines_added, lines_removed


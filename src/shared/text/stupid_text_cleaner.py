"""
Stupid Text Cleaner - Simple, aggressive text cleanup.

Pipeline:
1. Remove logs (stack traces, emoji logs, repeated lines)
2. Dedupe adjacent lines
3. Normalize whitespace
4. Apply 3-slice truncation if still over threshold

This replaces the complex text cleaning logic with a simpler, more predictable approach.
"""

import re
from typing import Any, List


# ============================================================================
# Text Coercion
# ============================================================================

def coerce_text(value: Any) -> str:
    """Normalize nested text structures (lists, dicts) into a clean string.
    
    Extracts text from various nested data structures commonly found in chat session data.
    Handles lists, dicts, and various text field names.
    
    Args:
        value: Can be None, str, list, dict, or other types
        
    Returns:
        Clean string representation, empty string if no text found
        
    Examples:
        coerce_text("hello") -> "hello"
        coerce_text(["a", "b"]) -> "a\\nb"
        coerce_text({"text": "hello"}) -> "hello"
        coerce_text({"value": "hello"}) -> "hello"
        coerce_text(None) -> ""
    """
    if value is None:
        return ""

    if isinstance(value, str):
        return value

    if isinstance(value, (list, tuple)):
        parts = [coerce_text(item).strip() for item in value]
        return "\n".join(part for part in parts if part)

    if isinstance(value, dict):
        for key in ("text", "value", "content"):
            if key in value:
                text = coerce_text(value[key]).strip()
                if text:
                    return text
        return ""

    return str(value)


# ============================================================================
# Constants
# ============================================================================

MAGIC_THRESHOLD = 2048  # Target output length in characters

# Distribution of budget across regions (must sum to 1.0)
HEAD_FRAC = 0.40
MID_FRAC = 0.20
TAIL_FRAC = 0.40

MARKER = "\n\n[..stripped..]\n\n"

# Log detection patterns
STACK_FRAME_RE = re.compile(
    r'(?:^|\s)(?:at\s+[\w.<>\-]+\s*\([^\)]*\)|[\w./\\-]+\.[A-Za-z0-9]{1,8}:\d+(?::\d+)?)'
)
EMOJI_START_RE = re.compile(r'^[\U0001F300-\U0001F9FF]')
REPEAT_MIN_LENGTH = 10  # Minimal length for repeated-line detection

def _compress_block(lines: List[str], label: str = "removed") -> List[str]:
    """Keep first 2 and last 2 lines, compress middle."""
    if len(lines) <= 4:
        return lines
    removed = len(lines) - 4
    marker = f"[... {removed} lines {label} ...]"
    return lines[:2] + [marker] + lines[-2:]


def remove_logs(text: str) -> str:
    """Remove stack traces, emoji logs, and repeated line blocks."""
    lines = text.split('\n')

    # -----------------------------------------------------------------
    # 1. Detect stack trace blocks
    # -----------------------------------------------------------------
    cleaned: List[str] = []
    block: List[str] = []

    def flush_stack():
        nonlocal cleaned, block
        if block:
            cleaned.extend(_compress_block(block, label="stack trace removed"))
            block = []

    for line in lines:
        stripped = line.strip()
        if STACK_FRAME_RE.search(stripped):
            block.append(line)
        else:
            flush_stack()
            cleaned.append(line)
    flush_stack()

    # -----------------------------------------------------------------
    # 2. Detect emoji-based log blocks
    # -----------------------------------------------------------------
    lines = cleaned
    cleaned = []
    block = []

    def flush_emoji():
        nonlocal cleaned, block
        if block:
            cleaned.extend(_compress_block(block, label="logs removed"))
            block = []

    for line in lines:
        stripped = line.strip()
        if EMOJI_START_RE.match(stripped):
            block.append(line)
        else:
            flush_emoji()
            cleaned.append(line)
    flush_emoji()

    # -----------------------------------------------------------------
    # 3. Detect repeated-line blocks (adjacent)
    # -----------------------------------------------------------------
    lines = cleaned
    cleaned = []
    block = []
    prev = None

    def flush_repeat():
        nonlocal cleaned, block
        if block:
            cleaned.extend(_compress_block(block, label="repeated content removed"))
            block = []

    for line in lines:
        stripped = line.strip()
        if stripped == prev and len(stripped) > REPEAT_MIN_LENGTH:
            block.append(line)
        else:
            flush_repeat()
            block = [line]
            prev = stripped
    flush_repeat()

    return "\n".join(cleaned)

def dedupe_adjacent_lines(text: str) -> str:
    """
    Remove *consecutive* duplicate lines from a text block.
    Keeps only the first instance of each repeated run.
    """
    if not text:
        return text

    lines = text.splitlines(keepends=False)
    result = []

    prev = None
    for line in lines:
        if line != prev:
            result.append(line)
        prev = line

    return "\n".join(result)


def normalize_whitespace(text: str) -> str:
    """Normalize line breaks and collapse excessive blank lines."""
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
    lines = [line.rstrip() for line in text.split('\n')]
    return '\n'.join(lines)


def collapse_blank_lines(text: str, max_blank: int = 1) -> str:
    """Collapse runs of blank lines to at most max_blank."""
    lines = text.split('\n')
    out: List[str] = []
    blanks = 0
    for line in lines:
        if line.strip() == "":
            blanks += 1
            if blanks <= max_blank:
                out.append("")
        else:
            blanks = 0
            out.append(line)
    return '\n'.join(out)

def three_slice_truncate(text: str) -> str:
    """
    Truncate text using 3-slice algorithm.
    
    Keeps:
    - First ~40% of budget from start
    - Middle ~20% of budget from center
    - Last ~40% of budget from end
    """
    L = len(text)
    
    # Short texts - keep as-is
    if L <= MAGIC_THRESHOLD:
        return text
    
    # Calculate slice lengths
    head_len = int(MAGIC_THRESHOLD * HEAD_FRAC)
    mid_len = int(MAGIC_THRESHOLD * MID_FRAC)
    tail_len = MAGIC_THRESHOLD - head_len - mid_len  # Absorb rounding
    
    # Compute positions
    head_text = text[:head_len]
    tail_text = text[L - tail_len:]
    middle_start = (L - mid_len) // 2
    mid_text = text[middle_start:middle_start + mid_len]
    
    # Try to clean up boundaries
    head_text = _trim_to_boundary(head_text, trim_end=True)
    mid_text = _trim_to_boundary(mid_text, trim_start=True, trim_end=True)
    tail_text = _trim_to_boundary(tail_text, trim_start=True)
    
    # Assemble with markers
    parts = []
    
    if head_text.strip():
        parts.append(head_text.strip())
    
    parts.append(MARKER.strip())
    
    if mid_text.strip():
        parts.append(mid_text.strip())
        parts.append(MARKER.strip())
    
    if tail_text.strip():
        parts.append(tail_text.strip())
    
    return '\n\n'.join(parts)


def _trim_to_boundary(text: str, trim_start: bool = False, trim_end: bool = False) -> str:
    """Try to trim text to natural boundaries (newline or sentence end)."""
    if not text:
        return text
    
    result = text
    
    if trim_end:
        search_region = result[-100:] if len(result) > 100 else result
        
        best_break = -1
        for sep in ['\n\n', '.\n', '. ', '!\n', '! ', '?\n', '? ', '\n']:
            pos = search_region.rfind(sep)
            if pos != -1:
                actual_pos = len(result) - len(search_region) + pos + len(sep)
                if actual_pos > len(result) * 0.7:
                    best_break = actual_pos
                    break
        
        if best_break > 0:
            result = result[:best_break].rstrip()
    
    if trim_start:
        search_region = result[:100] if len(result) > 100 else result
        
        best_start = -1
        for sep in ['\n\n', '\n', '. ', '! ', '? ']:
            pos = search_region.find(sep)
            if pos != -1 and pos < len(result) * 0.3:
                best_start = pos + len(sep)
                break
        
        if best_start > 0:
            result = result[best_start:].lstrip()
    
    return result

def stupid_clean(text: str) -> str:
    """
    Full cleanup pipeline:
    1. Remove logs (stack traces, emoji logs, repeated lines)
    2. Dedupe adjacent lines
    3. Normalize whitespace
    4. Apply 3-slice truncation if still over threshold
    """
    if not text:
        return ""
    
    # Stage 1: Remove logs
    text = remove_logs(text)
    
    # Stage 2: Whitespace cleanup
    text = dedupe_adjacent_lines(text)
    text = normalize_whitespace(text)
    text = collapse_blank_lines(text, max_blank=1)
    
    # Stage 3: Truncate if still too long
    text = three_slice_truncate(text)
    
    return text.strip()

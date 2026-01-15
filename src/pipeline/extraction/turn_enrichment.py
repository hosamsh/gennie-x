"""Converts raw Turns to enriched Turns with tokens, languages, metrics, and cleaned text."""
from __future__ import annotations

from typing import List, Union

from src.shared.models.turn import Turn, CodeEdit, EnrichedTurn, calculate_turn_metrics, calculate_response_times
from src.shared.code.code_metrics import calculate_metrics, count_diff_lines
from src.shared.code.language_utils import detect_languages_from_files
from src.shared.llm.token_utils import estimate_tokens, estimate_tool_tokens
from src.shared.llm.model_names import normalize_model_id
from src.shared.text.text_shrinker import TextShrinker
from src.shared.logging.logger import get_logger

logger = get_logger(__name__)

_text_shrinker = None

def _get_text_shrinker() -> TextShrinker:
    """Get or create the module-level TextShrinker instance."""
    global _text_shrinker
    if _text_shrinker is None:
        _text_shrinker = TextShrinker()
    return _text_shrinker


def enrich_code_edit(base: CodeEdit) -> CodeEdit:
    """Add lizard metrics (before, after, delta) to CodeEdit."""
    edit = CodeEdit(
        file_path=base.file_path,
        language=base.language,
        code_before=base.code_before,
        code_after=base.code_after,
        diff=base.diff,
        extra=dict(base.extra) if base.extra else {},
    )
    
    if 'delta_metrics' in edit.extra:
        return edit
    
    before_content = base.code_before or ""
    after_content = base.code_after or ""
    
    filename = base.file_path if base.file_path else f"code.{base.language}" if base.language else "code.py"
    
    before_metrics = calculate_metrics(before_content, filename) if before_content else {
        "nloc": 0, 
        "average_cyclomatic_complexity": 0, 
        "token_count": 0, 
        "max_cyclomatic_complexity": 0
    }
    after_metrics = calculate_metrics(after_content, filename) if after_content else {
        "nloc": 0, 
        "average_cyclomatic_complexity": 0, 
        "token_count": 0, 
        "max_cyclomatic_complexity": 0
    }
    
    lines_added, lines_removed = count_diff_lines(before_content, after_content)
    
    delta_metrics = {
        "nloc": after_metrics["nloc"] - before_metrics["nloc"],
        "lines_added": lines_added,
        "lines_removed": lines_removed,
        "cyclomatic_complexity": (
            after_metrics["average_cyclomatic_complexity"] 
            - before_metrics["average_cyclomatic_complexity"]
        ),
        "token_count": after_metrics["token_count"] - before_metrics["token_count"],
    }
    
    edit.extra["before_metrics"] = before_metrics
    edit.extra["after_metrics"] = after_metrics
    edit.extra["delta_metrics"] = delta_metrics
    
    return edit


def estimate_code_tokens(code_edits: List[CodeEdit]) -> int:
    """Estimate total tokens in code edits (uses code_after)."""
    total = 0
    for edit in code_edits:
        if edit.code_after:
            total += estimate_tokens(edit.code_after)
    return total


def _detect_languages_from_code_edits(code_edits: List[CodeEdit]) -> List[str]:
    """Detect programming languages from code edit file paths and content."""
    languages = set()
    
    file_paths = [edit.file_path for edit in code_edits if edit.file_path]
    if file_paths:
        detected = detect_languages_from_files(file_paths)
        languages.update(detected)
    
    for edit in code_edits:
        if edit.language and edit.language not in ('', 'unknown', 'text'):
            languages.add(edit.language)
    
    return sorted(languages)


def enrich_turn(base: Turn) -> EnrichedTurn:
    """Convert Turn to EnrichedTurn with tokens, languages, cleaned text, and code metrics."""
    enriched_edits = []
    for edit in base.code_edits:
        if isinstance(edit, CodeEdit):
            enriched_edits.append(enrich_code_edit(edit))
        elif isinstance(edit, dict):
            base_edit = CodeEdit.from_dict(edit)
            enriched_edits.append(enrich_code_edit(base_edit))
    
    languages = []
    if base.files:
        languages = detect_languages_from_files(base.files)
    if not languages and enriched_edits:
        languages = _detect_languages_from_code_edits(enriched_edits)
    primary_language = languages[0] if languages else None
    
    shrinker = _get_text_shrinker()
    cleaned_text = shrinker.shrink(base.original_text) if base.original_text else ""
    
    thinking_tokens = estimate_tokens(base.thinking_text) if base.thinking_text else 0
    
    turn = EnrichedTurn(
        session_id=base.session_id,
        turn=base.turn,
        role=base.role,
        original_text=base.original_text,
        cleaned_text=cleaned_text,
        workspace_id=base.workspace_id,
        workspace_name=base.workspace_name,
        workspace_folder=base.workspace_folder,
        session_name=base.session_name,
        agent_used=base.agent_used,
        request_id=base.request_id,
        merged_request_ids=list(base.merged_request_ids),
        timestamp_ms=base.timestamp_ms,
        timestamp_iso=base.timestamp_iso,
        ts=base.ts,
        files=list(base.files),
        tools=list(base.tools),
        extra=dict(base.extra) if base.extra else {},
        code_edits=enriched_edits,
        model_id=normalize_model_id(base.model_id) or base.model_id,
        languages=languages,
        primary_language=primary_language,
        thinking_text=base.thinking_text,
        thinking_duration_ms=base.thinking_duration_ms,
        original_text_tokens=estimate_tokens(base.original_text) if base.original_text else 0,
        cleaned_text_tokens=estimate_tokens(cleaned_text) if cleaned_text else 0,
        code_tokens=estimate_code_tokens(enriched_edits),
        tool_tokens=estimate_tool_tokens(base.tools) if base.tools else 0,
        thinking_tokens=thinking_tokens,
    )
    
    return turn


def enrich_turns(base_turns: List[Union[Turn, EnrichedTurn]], calculate_metrics: bool = True) -> List[EnrichedTurn]:
    """Enrich turns with tokens, languages, metrics; calculate response times."""
    if not base_turns:
        return []
    
    logger.progress(f"  Enriching {len(base_turns)} turns...")
    
    enriched: List[EnrichedTurn] = []
    for base in base_turns:
        if isinstance(base, EnrichedTurn):
            enriched.append(base)
        else:
            turn = enrich_turn(base)
            enriched.append(turn)
    
    logger.progress("  Adjusting response times...")
    calculate_response_times(enriched)
    
    logger.progress("  Calculating static code metrics...")
    if calculate_metrics:
        for turn in enriched:
            calculate_turn_metrics(turn)
    
    total_edits = sum(len(t.code_edits) for t in enriched)
    if total_edits > 0:
        logger.progress(f"    Enriched {total_edits} code edits with metrics")
    
    return enriched


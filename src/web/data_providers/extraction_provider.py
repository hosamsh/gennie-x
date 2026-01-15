"""
Extraction Data Provider - Provides extraction statistics and code metrics.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional
from src.web.services.extraction_service import generate_word_lists


class ExtractionDataProvider:
    """
    Provides extraction-related data for dashboard elements.
    
    Handles workspace info, code metrics, model usage, timelines,
    languages, and tool usage.
    """

    def __init__(self, db_connection: sqlite3.Connection, workspace_id: str):
        self.conn = db_connection
        self.workspace_id = workspace_id
        self._extraction_cache: Optional[Dict] = None
        self._code_metrics_cache: Optional[Dict] = None

    def get_extraction_stats(self) -> Dict[str, Any]:
        """Get extraction statistics for the workspace."""
        if self._extraction_cache:
            return self._extraction_cache

        cursor = self.conn.execute(
            """SELECT workspace_name, workspace_folder, agent_used, session_count, turn_count,
                      total_code_loc, total_doc_loc, extraction_duration_ms
               FROM workspace_info 
               WHERE workspace_id = ?
               ORDER BY updated_at DESC LIMIT 1""",
            (self.workspace_id,)
        )
        row = cursor.fetchone()

        if not row:
            return {
                "session_count": 0,
                "turn_count": 0,
                "sessions_with_code": 0,
                "extraction_duration_ms": 0,
                "total_visible_tokens": 0,
            }

        # Get token counts from turns table
        cursor = self.conn.execute(
            """SELECT SUM(CAST(original_text_tokens AS INTEGER)),
                      SUM(CAST(cleaned_text_tokens AS INTEGER)),
                      SUM(CAST(code_tokens AS INTEGER)),
                      SUM(CAST(tool_tokens AS INTEGER))
               FROM turns 
               WHERE workspace_id = ?""",
            (self.workspace_id,)
        )
        token_row = cursor.fetchone()
        total_visible_tokens = sum(x or 0 for x in token_row) if token_row else 0

        total_code_loc = row[5] or 0

        # Fallback: use total_lines_added as an approximation
        if total_code_loc == 0:
            cursor = self.conn.execute(
                """SELECT SUM(CAST(total_lines_added AS INTEGER)) FROM turns WHERE workspace_id = ?""",
                (self.workspace_id,)
            )
            fallback_row = cursor.fetchone()
            if fallback_row and fallback_row[0]:
                total_code_loc = fallback_row[0]

        self._extraction_cache = {
            "workspace_name": row[0],
            "workspace_folder": row[1],
            "agents": (row[2] or "").split("+") if row[2] else [],
            "session_count": row[3] or 0,
            "turn_count": row[4] or 0,
            "total_code_loc": total_code_loc,
            "total_doc_loc": row[6] or 0,
            "extraction_duration_ms": row[7] or 0,
            "total_visible_tokens": total_visible_tokens,
        }

        return self._extraction_cache

    def get_code_metrics(self) -> Dict[str, Any]:
        """Get code metrics for the workspace."""
        if self._code_metrics_cache:
            return self._code_metrics_cache

        cursor = self.conn.execute(
            """SELECT COUNT(DISTINCT session_id) as sessions_with_code,
                      SUM(lines_added) as total_lines_added,
                      SUM(lines_removed) as total_lines_removed
               FROM code_metrics 
               WHERE workspace_id = ?""",
            (self.workspace_id,)
        )
        metrics_row = cursor.fetchone()

        sessions_with_code = metrics_row[0] or 0
        total_lines_added = metrics_row[1] or 0
        total_lines_removed = metrics_row[2] or 0

        # Fallback to turns table
        if total_lines_added == 0 and total_lines_removed == 0:
            cursor = self.conn.execute(
                """SELECT COUNT(DISTINCT session_id) as sessions_with_code,
                          SUM(CAST(total_lines_added AS INTEGER)) as total_lines_added,
                          SUM(CAST(total_lines_removed AS INTEGER)) as total_lines_removed
                   FROM turns 
                   WHERE workspace_id = ? 
                     AND (total_lines_added > 0 OR total_lines_removed > 0)""",
                (self.workspace_id,)
            )
            fallback_row = cursor.fetchone()
            if fallback_row:
                sessions_with_code = fallback_row[0] or sessions_with_code
                total_lines_added = fallback_row[1] or total_lines_added
                total_lines_removed = fallback_row[2] or total_lines_removed

        extraction_stats = self.get_extraction_stats()
        total_code_loc = extraction_stats.get("total_code_loc", 0)
        total_doc_loc = extraction_stats.get("total_doc_loc", 0)

        # Calculate AI contribution percentage
        ai_contribution_pct = 0
        if total_lines_added > 0:
            if total_code_loc > 0:
                ai_contribution_pct = min(100.0, round((total_lines_added / total_code_loc) * 100, 1))
            else:
                ai_contribution_pct = 100.0

        self._code_metrics_cache = {
            "sessions_with_code": sessions_with_code,
            "total_lines_added": total_lines_added,
            "total_lines_removed": total_lines_removed,
            "total_code_loc": total_code_loc,
            "total_doc_loc": total_doc_loc,
            "ai_contribution_pct": ai_contribution_pct,
            "total_files_edited": 0,
        }

        return self._code_metrics_cache

    def get_model_usage(self, **kwargs) -> List[Dict[str, Any]]:
        """Get model usage distribution by lines of code."""
        cursor = self.conn.execute(
            """SELECT model_id, SUM(lines_added) as locs
               FROM code_metrics 
               WHERE workspace_id = ? AND model_id IS NOT NULL
               GROUP BY model_id
               ORDER BY locs DESC""",
            (self.workspace_id,)
        )
        model_usage = [{"model": row[0], "locs": row[1]} for row in cursor.fetchall()]

        # Fallback to turns table
        if not model_usage:
            cursor = self.conn.execute(
                """SELECT model_id, SUM(CAST(total_lines_added AS INTEGER)) as locs
                   FROM turns 
                   WHERE workspace_id = ? AND model_id IS NOT NULL AND total_lines_added > 0
                   GROUP BY model_id
                   ORDER BY locs DESC""",
                (self.workspace_id,)
            )
            model_usage = [{"model": row[0], "locs": row[1]} for row in cursor.fetchall()]

        return model_usage

    def get_ai_contribution_breakdown(self) -> List[Dict[str, Any]]:
        """Get AI contribution as a breakdown for doughnut chart.
        
        Returns empty list if there's no code data, so the chart won't be rendered.
        """
        code_metrics = self.get_code_metrics()
        ai_loc = code_metrics.get("total_lines_added", 0)
        total_loc = code_metrics.get("total_code_loc", 0)
        
        # Only return data if there's actual code in the workspace
        if total_loc == 0 and ai_loc == 0:
            return []
        
        other_loc = max(0, total_loc - ai_loc)

        return [
            {"label": "AI Generated", "value": ai_loc},
            {"label": "Other Code", "value": other_loc},
        ]

    def get_code_timeline(self) -> List[Dict[str, Any]]:
        """Get code contribution timeline."""
        cursor = self.conn.execute(
            """SELECT (SUBSTR(REPLACE(t.timestamp_iso, ' ', 'T'), 1, 13) || ':00') as date, 
                      SUM(cm.lines_added) as added,
                      SUM(cm.lines_removed) as removed
               FROM code_metrics cm
               JOIN turns t ON cm.request_id = t.request_id
               WHERE cm.workspace_id = ? AND t.timestamp_iso IS NOT NULL AND t.timestamp_iso != ''
               GROUP BY date
               ORDER BY date""",
            (self.workspace_id,)
        )
        return [{"date": row[0], "added": row[1] or 0, "removed": row[2] or 0} for row in cursor.fetchall()]

    def get_languages(self, **kwargs) -> List[Dict[str, Any]]:
        """Get languages used in the workspace."""
        cursor = self.conn.execute(
            """SELECT primary_language, COUNT(*) as change_count
               FROM turns
               WHERE workspace_id = ? AND primary_language IS NOT NULL AND primary_language != ''
               GROUP BY primary_language
               ORDER BY change_count DESC
               LIMIT 10""",
            (self.workspace_id,)
        )
        return [{"language": row[0], "change_count": row[1]} for row in cursor.fetchall()]

    def get_tool_usage(self, **kwargs) -> List[Dict[str, Any]]:
        """Get tool usage statistics."""
        cursor = self.conn.execute(
            """SELECT tools FROM turns WHERE workspace_id = ? AND tools IS NOT NULL AND tools != ''""",
            (self.workspace_id,)
        )

        tool_counts = {}
        for row in cursor.fetchall():
            try:
                tools_list = json.loads(row[0]) if isinstance(row[0], str) else row[0]
                if isinstance(tools_list, list):
                    for tool in tools_list:
                        tool_name = tool if isinstance(tool, str) else tool.get("name", "unknown")
                        tool_counts[tool_name] = tool_counts.get(tool_name, 0) + 1
            except (json.JSONDecodeError, TypeError, AttributeError):
                pass

        return [
            {"tool": name, "count": count}
            for name, count in sorted(tool_counts.items(), key=lambda x: x[1], reverse=True)
        ]

    def get_session_timeline(self) -> List[Dict[str, Any]]:
        """Get session creation timeline."""
        cursor = self.conn.execute(
            """SELECT DATE(first_timestamp) as date, COUNT(*) as session_count
               FROM (
                   SELECT session_id, MIN(timestamp_iso) as first_timestamp
                   FROM turns
                   WHERE workspace_id = ?
                   GROUP BY session_id
               )
               GROUP BY date
               ORDER BY date""",
            (self.workspace_id,)
        )
        return [{"date": row[0], "sessions": row[1]} for row in cursor.fetchall()]

    def get_word_cloud_terms(
        self,
        min_word_length: int = 4,
        top_models: int = 8,
        max_words: int = 300,
        exclude_patterns: Optional[List[str]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Get word frequency data for word cloud visualization (workspace-scoped).
        
        Returns groups (user, all assistants, per-model) with word frequency lists
        for both response text and thinking text.
        """
        import re
        from collections import Counter
        from typing import Any as AnyType
        
        # Common English stopwords
        _STOPWORDS = {
            "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
            "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
            "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
            "or", "an", "will", "my", "one", "all", "would", "there", "their",
            "is", "was", "are", "can", "if", "so", "up", "out", "about", "who",
            "get", "which", "go", "me", "when", "make", "than", "look", "write",
            "its", "see", "him", "two", "has", "like", "time", "no", "just", "way",
            # Add some common conversational fillers
            "ok", "okay", "yes", "yeah", "sure", "well", "now", "then", "let", "lets", "us"
        }
        
        def _tokenize(text: str) -> List[str]:
            """Tokenize text into lowercase words."""
            return re.findall(r'\b[a-z]{2,}\b', text.lower())
        
        def _safe_int(val: AnyType, default: int = 0) -> int:
            try:
                return int(val) if val is not None else default
            except (ValueError, TypeError):
                return default

        max_words_per_group = max_words
        
        exclude_patterns = exclude_patterns or []
        compiled_patterns: List[re.Pattern] = []
        for pattern in exclude_patterns:
            if pattern:
                try:
                    compiled_patterns.append(re.compile(pattern))
                except re.error:
                    pass

        # Get top assistant models by turn count in this workspace
        top_model_ids: List[str] = []
        try:
            cur = self.conn.execute(
                """
                SELECT COALESCE(model_id, '') as model_id, COUNT(*) as c
                FROM turns
                WHERE workspace_id = ?
                  AND role = 'assistant'
                  AND COALESCE(model_id, '') != ''
                GROUP BY COALESCE(model_id, '')
                ORDER BY c DESC
                LIMIT ?
                """,
                (self.workspace_id, top_models),
            )
            top_model_ids = [r[0] for r in cur.fetchall() if r and r[0]]
        except sqlite3.OperationalError:
            top_model_ids = []

         # Determine if thinking_text column exists
        has_thinking = False
        try:
            self.conn.execute("SELECT thinking_text FROM turns LIMIT 1")
            has_thinking = True
        except sqlite3.OperationalError:
            pass

        cols = "role, COALESCE(model_id, '') as model_id, text"
        if has_thinking:
            cols += ", thinking_text"
        else:
            cols += ", NULL as thinking_text"

        sql = f"SELECT {cols} FROM turns WHERE workspace_id = ? AND ((text IS NOT NULL AND text != '') OR (thinking_text IS NOT NULL AND thinking_text != ''))"  # nosec B608

        word_lists = generate_word_lists(
            self.conn,
            sql,
            params=(self.workspace_id,),
            top_model_ids=top_model_ids,
            min_word_length=min_word_length,
            max_words_per_group=max_words_per_group,
            exclude_patterns=[p.pattern for p in compiled_patterns] if compiled_patterns else None,
        )

        groups: List[Dict[str, str]] = [
            {"id": "user", "label": "User"},
            {"id": "assistant_all", "label": "Assistant (all models)"},
        ]

        for model_id in top_model_ids:
            # Format model name nicely
            label = model_id.replace("gpt-4o-", "GPT-4o ").replace("claude-", "Claude ").replace("-", " ").title()
            groups.append({"id": f"assistant_model::{model_id}", "label": f"Assistant: {label}"})

        return {"groups": groups, "default_group_id": "user", "word_lists": word_lists}

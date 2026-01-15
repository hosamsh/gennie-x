"""
Database search functions for turns.

Provides keyword (FTS5), semantic (embeddings), and hybrid search capabilities.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from src.shared.logging.logger import get_logger
from src.shared.config.config_loader import get_config

logger = get_logger(__name__)


def _build_role_filter(roles: Optional[List[str]]) -> Tuple[str, List[str]]:
    """Build SQL WHERE clause fragment for role filtering."""
    if not roles:
        return "", []
    role_values = [r.lower() for r in roles]
    placeholders = ",".join(["?"] * len(role_values))
    return f" AND LOWER(COALESCE(t.role, '')) IN ({placeholders})", role_values


def _normalize_bm25(score: Optional[float]) -> float:
    """Normalize BM25 score to 0-1 range (lower BM25 = better match)."""
    if score is None:
        return 0.0
    safe_score = max(0.0, float(score))
    return 1.0 / (1.0 + safe_score)


def _escape_fts_query(query: str) -> str:
    """Escape FTS query for safe execution."""
    escaped = query.replace('"', '""')
    return f"\"{escaped}\""


def _keyword_search_all(
    conn: sqlite3.Connection,
    query: str,
    roles: Optional[List[str]],
) -> List[Dict[str, Any]]:
    """Execute keyword search and return all results."""
    role_sql, role_params = _build_role_filter(roles)
    # nosec B608 - role_sql contains only parameterized IN clause
    sql = f"""
        SELECT t.id, t.session_id, t.turn, t.role,
               COALESCE(t.original_text, t.text, '') AS original_text,
               t.timestamp_iso, t.workspace_id, t.workspace_name, t.workspace_folder,
               t.session_name, t.agent_used,
               bm25(turns_fts) AS bm25_score
        FROM turns_fts
        JOIN turns t ON turns_fts.rowid = t.id
        WHERE turns_fts MATCH ?{role_sql}
        ORDER BY bm25_score ASC
    """
    params = [query] + role_params
    try:
        cursor = conn.execute(sql, params)
    except sqlite3.OperationalError as exc:
        if "no such table: turns_fts" in str(exc).lower():
            raise ValueError("Search index not initialized. Run --reindex.") from exc
        safe_query = _escape_fts_query(query)
        params = [safe_query] + role_params
        try:
            cursor = conn.execute(sql, params)
        except sqlite3.OperationalError as exc_retry:
            if "no such table: turns_fts" in str(exc_retry).lower():
                raise ValueError("Search index not initialized. Run --reindex.") from exc_retry
            raise

    results = []
    for row in cursor:
        results.append({
            "turn_id": row[0],
            "session_id": row[1],
            "turn": row[2],
            "role": row[3],
            "original_text": row[4],
            "timestamp_iso": row[5],
            "workspace_id": row[6],
            "workspace_name": row[7],
            "workspace_folder": row[8],
            "session_name": row[9],
            "agent_used": row[10],
            "score_keyword": _normalize_bm25(row[11]),
        })

    return results


def _keyword_search_page(
    conn: sqlite3.Connection,
    query: str,
    roles: Optional[List[str]],
    limit: int,
    offset: int,
) -> Tuple[List[Dict[str, Any]], int]:
    """Execute keyword search with pagination."""
    role_sql, role_params = _build_role_filter(roles)

    # nosec B608 - role_sql contains only parameterized IN clause
    count_sql = f"""
        SELECT COUNT(*)
        FROM turns_fts
        JOIN turns t ON turns_fts.rowid = t.id
        WHERE turns_fts MATCH ?{role_sql}
    """
    count_params = [query] + role_params
    try:
        total_count = conn.execute(count_sql, count_params).fetchone()[0] or 0
    except sqlite3.OperationalError as exc:
        if "no such table: turns_fts" in str(exc).lower():
            raise ValueError("Search index not initialized. Run --reindex.") from exc
        safe_query = _escape_fts_query(query)
        count_params = [safe_query] + role_params
        try:
            total_count = conn.execute(count_sql, count_params).fetchone()[0] or 0
        except sqlite3.OperationalError as exc_retry:
            if "no such table: turns_fts" in str(exc_retry).lower():
                raise ValueError("Search index not initialized. Run --reindex.") from exc_retry
            raise

    # nosec B608 - role_sql contains only parameterized IN clause
    sql = f"""
        SELECT t.id, t.session_id, t.turn, t.role,
               COALESCE(t.original_text, t.text, '') AS original_text,
               t.timestamp_iso, t.workspace_id, t.workspace_name, t.workspace_folder,
               t.session_name, t.agent_used,
               bm25(turns_fts) AS bm25_score
        FROM turns_fts
        JOIN turns t ON turns_fts.rowid = t.id
        WHERE turns_fts MATCH ?{role_sql}
        ORDER BY bm25_score ASC
        LIMIT ? OFFSET ?
    """
    params = [query] + role_params + [limit, offset]
    try:
        cursor = conn.execute(sql, params)
    except sqlite3.OperationalError as exc:
        if "no such table: turns_fts" in str(exc).lower():
            raise ValueError("Search index not initialized. Run --reindex.") from exc
        safe_query = _escape_fts_query(query)
        params = [safe_query] + role_params + [limit, offset]
        try:
            cursor = conn.execute(sql, params)
        except sqlite3.OperationalError as exc_retry:
            if "no such table: turns_fts" in str(exc_retry).lower():
                raise ValueError("Search index not initialized. Run --reindex.") from exc_retry
            raise

    results = []
    for row in cursor:
        results.append({
            "turn_id": row[0],
            "session_id": row[1],
            "turn": row[2],
            "role": row[3],
            "original_text": row[4],
            "timestamp_iso": row[5],
            "workspace_id": row[6],
            "workspace_name": row[7],
            "workspace_folder": row[8],
            "session_name": row[9],
            "agent_used": row[10],
            "score": _normalize_bm25(row[11]),
        })

    return results, total_count


def _semantic_search_all(
    conn: sqlite3.Connection,
    query: str,
    roles: Optional[List[str]],
    model_name: str,
    min_score: float,
) -> List[Dict[str, Any]]:
    """Execute semantic search using embeddings."""
    import numpy as np
    from src.shared.search.embeddings import deserialize_embedding, embed_texts

    role_sql, role_params = _build_role_filter(roles)

    # nosec B608 - role_sql contains only parameterized IN clause
    sql = f"""
        SELECT te.turn_id, te.embedding, te.dims,
               t.session_id, t.turn, t.role,
               COALESCE(t.original_text, t.text, '') AS original_text,
               t.timestamp_iso, t.workspace_id, t.workspace_name, t.workspace_folder,
               t.session_name, t.agent_used
        FROM turn_embeddings te
        JOIN turns t ON t.id = te.turn_id
        WHERE te.model = ?{role_sql}
        ORDER BY te.turn_id ASC
    """
    params = [model_name] + role_params
    try:
        cursor = conn.execute(sql, params)
    except sqlite3.OperationalError as exc:
        if "no such table: turn_embeddings" in str(exc).lower():
            raise ValueError("Semantic index not initialized. Run --reindex.") from exc
        raise

    query_vec = embed_texts([query], model_name)[0]

    results: List[Dict[str, Any]] = []
    vectors: List[np.ndarray] = []
    metas: List[Dict[str, Any]] = []

    def flush() -> None:
        if not vectors:
            return
        matrix = np.vstack(vectors)
        scores = matrix @ query_vec
        for idx, score in enumerate(scores):
            if score < min_score:
                continue
            meta = metas[idx]
            meta["score_semantic"] = float(score)
            results.append(meta)
        vectors.clear()
        metas.clear()

    for row in cursor:
        blob = row[1]
        dims = row[2]
        vec = deserialize_embedding(blob)
        if vec.size != dims:
            continue
        metas.append({
            "turn_id": row[0],
            "session_id": row[3],
            "turn": row[4],
            "role": row[5],
            "original_text": row[6],
            "timestamp_iso": row[7],
            "workspace_id": row[8],
            "workspace_name": row[9],
            "workspace_folder": row[10],
            "session_name": row[11],
            "agent_used": row[12],
        })
        vectors.append(vec)
        if len(vectors) >= 1024:
            flush()

    flush()
    results.sort(key=lambda r: r["score_semantic"], reverse=True)
    return results


def _rrf_merge(
    keyword_results: List[Dict[str, Any]],
    semantic_results: List[Dict[str, Any]],
    k: int,
) -> List[Dict[str, Any]]:
    """Merge keyword and semantic results using Reciprocal Rank Fusion."""
    scores: Dict[int, float] = {}
    merged: Dict[int, Dict[str, Any]] = {}

    for rank, result in enumerate(keyword_results, start=1):
        turn_id = result["turn_id"]
        scores[turn_id] = scores.get(turn_id, 0.0) + (1.0 / (k + rank))
        if turn_id not in merged:
            merged[turn_id] = dict(result)
        merged[turn_id]["score_keyword"] = result.get("score_keyword", result.get("score", 0.0))

    for rank, result in enumerate(semantic_results, start=1):
        turn_id = result["turn_id"]
        scores[turn_id] = scores.get(turn_id, 0.0) + (1.0 / (k + rank))
        if turn_id not in merged:
            merged[turn_id] = dict(result)
        merged[turn_id]["score_semantic"] = result.get("score_semantic", result.get("score", 0.0))

    if not scores:
        return []

    max_score = max(scores.values()) or 1.0
    merged_results: List[Dict[str, Any]] = []
    for turn_id, result in merged.items():
        result["score"] = min(1.0, scores[turn_id] / max_score)
        merged_results.append(result)

    merged_results.sort(key=lambda r: r["score"], reverse=True)
    return merged_results


def search_turns(
    conn: sqlite3.Connection,
    query: str,
    mode: Optional[str] = None,
    roles: Optional[List[str]] = None,
    page: int = 1,
    page_size: int = 20,
    min_score: Optional[float] = None,
    strict: bool = False,
) -> Dict[str, Any]:
    """Search turns by keyword, semantic, or hybrid mode.
    
    Args:
        conn: SQLite connection
        query: Search query string
        mode: Search mode - 'keyword', 'semantic', or 'hybrid' (default from config)
        roles: Optional list of roles to filter by (e.g., ['user', 'assistant'])
        page: Page number (1-indexed)
        page_size: Number of results per page
        min_score: Minimum semantic similarity score (0.0-1.0)
        strict: Use stricter semantic threshold
        
    Returns:
        Dict with query, mode, page, page_size, total_count, and results
    """
    if not query or not query.strip():
        raise ValueError("Search query cannot be empty.")

    config = get_config().search
    mode = (mode or config.default_mode).lower()

    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 1
    if page_size > config.max_page_size:
        page_size = config.max_page_size

    offset = (page - 1) * page_size
    min_score_value = min_score
    if min_score_value is None:
        min_score_value = config.semantic_strict_min_score if strict else config.semantic_min_score

    if mode == "keyword":
        results, total_count = _keyword_search_page(conn, query, roles, page_size, offset)
        return {
            "query": query,
            "mode": mode,
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "results": results,
        }

    if mode == "semantic":
        semantic_results = _semantic_search_all(
            conn,
            query,
            roles,
            config.semantic_model,
            float(min_score_value),
        )
        total_count = len(semantic_results)
        paged = semantic_results[offset:offset + page_size]
        for result in paged:
            result["score"] = result.get("score_semantic", 0.0)
        return {
            "query": query,
            "mode": mode,
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "results": paged,
        }

    if mode != "hybrid":
        raise ValueError(f"Unsupported search mode: {mode}")

    keyword_results = _keyword_search_all(conn, query, roles)
    semantic_results = _semantic_search_all(
        conn,
        query,
        roles,
        config.semantic_model,
        float(min_score_value),
    )

    merged = _rrf_merge(keyword_results, semantic_results, config.rrf_k)
    keyword_ids = {r["turn_id"] for r in keyword_results}
    semantic_ids = {r["turn_id"] for r in semantic_results}
    total_count = len(keyword_ids | semantic_ids)

    paged = merged[offset:offset + page_size]
    return {
        "query": query,
        "mode": mode,
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "results": paged,
    }

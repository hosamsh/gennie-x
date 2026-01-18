"""Backfill and maintenance for search indexes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional
import sqlite3

from src.shared.logging.logger import get_logger
from src.shared.search.embeddings import embed_texts, serialize_embedding, text_hash

logger = get_logger(__name__)


def generate_embeddings(
    conn: sqlite3.Connection,
    model_name: str,
    batch_size: int = 64,
    min_turn_id: Optional[int] = None,
    max_turn_id: Optional[int] = None,
    verbose: bool = True,
) -> dict[str, int]:
    """Generate embeddings for turns with unified logging and error handling.
    
    This is the unified entry point for embedding generation used by both
    extraction (incremental) and reindex (full rebuild) paths.
    
    Args:
        conn: Database connection
        model_name: Embedding model name
        batch_size: Batch size for embedding generation
        min_turn_id: Optional minimum turn ID (for incremental updates)
        max_turn_id: Optional maximum turn ID (for incremental updates)
        verbose: Whether to log progress messages
        
    Returns:
        Dict with 'total', 'updated', and 'skipped' counts
        
    Raises:
        Exception: If embedding generation fails
    """
    if verbose:
        if min_turn_id and max_turn_id:
            # Get actual count of turns with non-empty text in the range
            cursor = conn.cursor()
            where_clauses = ["COALESCE(t.original_text, t.text, '') != ''"]
            params: list[object] = []
            if min_turn_id is not None:
                where_clauses.append("t.id >= ?")
                params.append(min_turn_id)
            if max_turn_id is not None:
                where_clauses.append("t.id <= ?")
                params.append(max_turn_id)
            where_sql = " AND ".join(where_clauses)
            cursor.execute(  # nosec B608 - where_sql is built from hardcoded safe clauses
                f"SELECT COUNT(*) FROM turns t WHERE {where_sql}", params
            )
            count = cursor.fetchone()[0]
            logger.progress(f"[EMBED] Generating embeddings for turns {min_turn_id}-{max_turn_id} ({count} turns)...")
        else:
            logger.progress("[EMBED] Generating embeddings for all turns...")
    
    try:
        stats = backfill_turn_embeddings(
            conn,
            model_name=model_name,
            batch_size=batch_size,
            min_turn_id=min_turn_id,
            max_turn_id=max_turn_id,
        )
        
        if verbose:
            logger.progress(f"[OK] Embeddings: {stats.get('updated', 0)} created, {stats.get('skipped', 0)} skipped")
        
        return stats
        
    except Exception as embed_error:
        if verbose:
            logger.warning(f"[WARN] Embedding generation failed: {embed_error}")
            logger.progress("[TIP] Run --reindex to retry embedding generation")
        raise


def backfill_turn_embeddings(
    conn,
    model_name: str,
    batch_size: int = 64,
    min_turn_id: Optional[int] = None,
    max_turn_id: Optional[int] = None,
) -> dict[str, int]:
    """Backfill missing or stale embeddings for turns."""
    cursor = conn.cursor()

    where_clauses = ["COALESCE(t.original_text, t.text, '') != ''"]
    params: list[object] = [model_name]

    if min_turn_id is not None:
        where_clauses.append("t.id >= ?")
        params.append(min_turn_id)
    if max_turn_id is not None:
        where_clauses.append("t.id <= ?")
        params.append(max_turn_id)

    where_sql = " AND ".join(where_clauses)

    cursor.execute(  # nosec B608 - where_sql is built from hardcoded safe clauses
        f"""
        SELECT t.id, COALESCE(t.original_text, t.text, '') AS content, te.text_hash
        FROM turns t
        LEFT JOIN turn_embeddings te
            ON te.turn_id = t.id AND te.model = ?
        WHERE {where_sql}
        ORDER BY t.id
        """,
        params,
    )

    pending: list[tuple[int, str, str]] = []
    total = 0
    updated = 0
    skipped = 0

    def flush(batch: Iterable[tuple[int, str, str]]) -> int:
        batch_list = list(batch)
        if not batch_list:
            return 0

        texts = [item[1] for item in batch_list]
        embeddings = embed_texts(texts, model_name)
        dims = embeddings.shape[1]
        now_iso = datetime.now(timezone.utc).isoformat()

        rows = []
        for i, (turn_id, _, new_hash) in enumerate(batch_list):
            rows.append(
                (
                    turn_id,
                    model_name,
                    dims,
                    serialize_embedding(embeddings[i]),
                    new_hash,
                    now_iso,
                )
            )

        conn.executemany(
            """
            INSERT INTO turn_embeddings(turn_id, model, dims, embedding, text_hash, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(turn_id, model) DO UPDATE SET
                dims=excluded.dims,
                embedding=excluded.embedding,
                text_hash=excluded.text_hash,
                updated_at=excluded.updated_at
            """,
            rows,
        )
        conn.commit()
        return len(rows)

    for turn_id, content, existing_hash in cursor:
        total += 1
        content = content.strip()
        if not content:
            skipped += 1
            continue

        new_hash = text_hash(content)
        if existing_hash == new_hash:
            skipped += 1
            continue

        pending.append((turn_id, content, new_hash))
        if len(pending) >= batch_size:
            updated += flush(pending)
            pending.clear()

    if pending:
        updated += flush(pending)
        pending.clear()

    logger.info(
        "Embedding backfill complete: %d total, %d updated, %d skipped",
        total,
        updated,
        skipped,
    )
    return {"total": total, "updated": updated, "skipped": skipped}

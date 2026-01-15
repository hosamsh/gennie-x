"""
Search Endpoints - API endpoints for turn search.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from src.shared.database import db_search
from src.web.shared_state import connect_db

router = APIRouter(tags=["search"])


@router.get("/api/search")
async def search_turns(
    q: str = Query(..., description="Search query"),
    mode: str = Query("hybrid", description="Search mode: hybrid, keyword, semantic"),
    user_only: bool = Query(False, description="Search user turns only"),
    assistant_only: bool = Query(False, description="Search assistant turns only"),
    page: int = Query(1, ge=1, description="Results page number"),
    page_size: int = Query(20, ge=1, description="Results page size"),
    min_score: float | None = Query(None, ge=0.0, le=1.0, description="Minimum semantic similarity score"),
    strict: bool = Query(False, description="Use stricter semantic threshold"),
):
    if user_only and assistant_only:
        raise HTTPException(status_code=400, detail="Use only one of user_only or assistant_only.")

    roles = None
    if user_only:
        roles = ["user"]
    elif assistant_only:
        roles = ["assistant"]

    conn = connect_db()
    try:
        result = db_search.search_turns(
            conn,
            query=q,
            mode=mode,
            roles=roles,
            page=page,
            page_size=page_size,
            min_score=min_score,
            strict=strict,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()

    return result

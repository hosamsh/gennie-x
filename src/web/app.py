"""FastAPI app factory for the web UI.

Goal: keep `src/web/server.py` small while preserving the existing
`src.web.server:app` entrypoint.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse

from src.shared.logging.logger import get_logger

from src.web.routers import (
    agents,
    config,
    dashboards,
    extraction,
    runs,
    search,
    sessions,
    system,
    workspaces,
)

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup hook (placeholder for future initialization)
    yield


def _register_page_routes(app: FastAPI, static_dir: Path) -> None:
    async def _read_html_or_none(filename: str) -> str | None:
        html_path = static_dir / filename
        if not html_path.exists():
            return None
        return await run_in_threadpool(html_path.read_text, encoding="utf-8")

    @app.get("/", response_class=HTMLResponse)
    async def root() -> str:
        """Serve the system overview dashboard as the landing page."""
        system_html = await _read_html_or_none("pages/system/index.html")
        if system_html is not None:
            return system_html

        # Fallback to browse if system overview page doesn't exist
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta http-equiv=\"refresh\" content=\"0; url=/browse\">
            <title>Redirecting...</title>
        </head>
        <body>
            <p>Redirecting to <a href=\"/browse\">Browse</a>...</p>
        </body>
        </html>
        """

    @app.get("/browse", response_class=HTMLResponse)
    async def browse_page() -> str:
        browse_html = await _read_html_or_none("pages/browse/index.html")
        if browse_html is not None:
            return browse_html
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Browse Not Found</title></head>
        <body>
            <h1>Browse UI not found</h1>
            <p>Please ensure src/web/static/pages/browse/index.html exists.</p>
        </body>
        </html>
        """

    @app.get("/workspace/{workspace_id}", response_class=HTMLResponse)
    async def workspace_page_all_agents(workspace_id: str) -> str:
        """Serve the workspace detail page (extracts all agents)."""
        _ = workspace_id
        workspace_html = await _read_html_or_none("pages/workspace/index.html")
        if workspace_html is not None:
            return workspace_html
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Workspace Not Found</title></head>
        <body>
            <h1>Workspace UI not found</h1>
            <p>Please ensure src/web/static/pages/workspace/index.html exists.</p>
        </body>
        </html>
        """

    @app.get("/workspace/{workspace_id}/{_extra_path:path}", response_class=HTMLResponse)
    async def workspace_page_deep_link(workspace_id: str, _extra_path: str) -> str:
        """Serve the workspace detail page for any deep link under a workspace.

        This allows URLs like `/workspace/{id}/session/{session_id}` to be
        bookmarkable and refreshable without causing a server-side 404. The
        client-side application will parse the path and restore the correct
        state (session vs dashboard).
        """

        _ = (workspace_id, _extra_path)
        workspace_html = await _read_html_or_none("pages/workspace/index.html")
        if workspace_html is not None:
            return workspace_html
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Workspace Not Found</title></head>
        <body>
            <h1>Workspace UI not found</h1>
            <p>Please ensure src/web/static/pages/workspace/index.html exists.</p>
        </body>
        </html>
        """

    @app.get("/config", response_class=HTMLResponse)
    async def config_page() -> str:
        """Serve the configuration editor page."""
        config_html = await _read_html_or_none("pages/config/index.html")
        if config_html is not None:
            return config_html
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Config Not Found</title></head>
        <body>
            <h1>Config UI not found</h1>
            <p>Please ensure src/web/static/pages/config/index.html exists.</p>
        </body>
        </html>
        """

    @app.get("/advanced_search", response_class=HTMLResponse)
    async def search_page() -> str:
        """Serve the search page."""
        search_html = await _read_html_or_none("pages/search/index.html")
        if search_html is not None:
            return search_html
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Search Not Found</title></head>
        <body>
            <h1>Search UI not found</h1>
            <p>Please ensure src/web/static/pages/search/index.html exists.</p>
        </body>
        </html>
        """


def create_app() -> FastAPI:
    from src.__version__ import __version__
    
    app = FastAPI(
        title="Chat Extractor API",
        description="Web API for browsing and analyzing extracted chat data",
        version=__version__,
        lifespan=lifespan,
    )

    # CORS middleware for development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Static files
    web_dir = Path(__file__).parent
    static_dir = web_dir / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    _register_page_routes(app, static_dir)

    # Routers - modular API endpoints
    app.include_router(agents.router)
    app.include_router(workspaces.router)
    app.include_router(sessions.router)
    app.include_router(extraction.router)
    app.include_router(runs.router)
    app.include_router(dashboards.router)
    app.include_router(search.router)
    app.include_router(system.router)
    app.include_router(config.router)

    return app

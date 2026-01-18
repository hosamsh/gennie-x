"""Compatibility shim for the web app.

This module intentionally stays tiny.

The canonical app wiring lives in `src.web.app:create_app`, but the public
entrypoint `src.web.server:app` is preserved for `run_web.py` and external uses.
"""

from __future__ import annotations


from src.web.app import create_app

app = create_app()

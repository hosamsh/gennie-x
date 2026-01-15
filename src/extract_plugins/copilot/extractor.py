"""Copilot Chat Data Extractor."""
from __future__ import annotations

import json
import os
import platform
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from src.shared.models.turn import Turn
from src.shared.io.paths import normalize_path, decode_file_uri

from .edits import extract_edits


def get_workspace_storage() -> Path:
    """Get VS Code workspace storage path for current platform."""
    system = platform.system()
    if system == "Windows":
        return Path(os.environ["APPDATA"]) / "Code/User/workspaceStorage"
    elif system == "Darwin":
        return Path.home() / "Library/Application Support/Code/User/workspaceStorage"
    else:
        return Path.home() / ".config/Code/User/workspaceStorage"


@dataclass
class WorkspaceMeta:
    """Workspace metadata."""
    workspace_id: str
    workspace_name: str
    workspace_folder: str
    path: Path
    titles: dict[str, str]  # session_id -> title


def discover_workspaces(base: Path | None = None) -> list[WorkspaceMeta]:
    """Discover all workspaces with chat sessions."""
    base = base or get_workspace_storage()
    workspaces = []
    
    if not base.exists():
        return []
        
    for folder in base.iterdir():
        if not folder.is_dir():
            continue
        chat_dir = folder / "chatSessions"
        if not chat_dir.exists():
            continue
        
        # Check for non-empty sessions
        sessions = list(chat_dir.glob("*.json"))
        if not sessions:
            continue
        
        has_content = any(not _is_empty_session(s) for s in sessions)
        if not has_content:
            continue
        
        # Load metadata
        meta = _load_workspace_meta(folder)
        workspaces.append(meta)
    
    return workspaces


def _is_empty_session(path: Path) -> bool:
    """Quick check if session has no requests (read first 2KB)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            head = f.read(2048)
        return '"requests": []' in head or '"requests":[]' in head
    except:
        return True


def _load_workspace_meta(folder: Path) -> WorkspaceMeta:
    """Load workspace.json and session titles."""
    workspace_id = folder.name
    workspace_name = workspace_id
    workspace_folder = ""
    
    # Parse workspace.json
    ws_json = folder / "workspace.json"
    if ws_json.exists():
        try:
            data = json.loads(ws_json.read_text(encoding="utf-8"))
            uri = data.get("folder") or data.get("folderUri", "")
            if uri:
                workspace_folder = decode_file_uri(uri)
                workspace_name = Path(workspace_folder).name
        except (json.JSONDecodeError, OSError, KeyError):
            pass
    
    # Load session titles from state.vscdb
    titles = _load_session_titles(folder / "state.vscdb")
    
    return WorkspaceMeta(
        workspace_id=workspace_id,
        workspace_name=workspace_name,
        workspace_folder=workspace_folder,
        path=folder,
        titles=titles,
    )


def _load_session_titles(db_path: Path) -> dict[str, str]:
    """Query state.vscdb for session titles."""
    titles = {}
    if not db_path.exists():
        return titles
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.execute(
            "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'"
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            data = json.loads(row[0])
            for sid, info in data.get("entries", {}).items():
                if isinstance(info, dict) and "title" in info:
                    titles[sid] = info["title"]
    except (sqlite3.Error, json.JSONDecodeError, OSError):
        pass
    return titles


def extract_session(path: Path, meta: WorkspaceMeta) -> list[Turn]:
    """Extract all turns from a chat session file."""
    session_id = path.stem
    if _is_empty_session(path):
        return []
    
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    
    requests = data.get("requests", [])
    if not requests:
        return []
    
    # Get session name (priority: customTitle, db title, empty)
    session_name = data.get("customTitle", "") or meta.titles.get(session_id, "")
    
    turns = []
    file_mtime_ms = int(path.stat().st_mtime * 1000)
    
    for i, req in enumerate(requests):
        timestamp_ms = _parse_timestamp(req, file_mtime_ms)
        timestamp_iso = datetime.fromtimestamp(
            timestamp_ms / 1000, tz=timezone.utc
        ).isoformat()
        request_id = _find_field(req, ["requestId", "requestUUID", "clientRequestId", "conversationId", "sessionId"])
        model_id = _find_field(req, ["modelId", "model", "responseModel", "modelIdentifier"])
        
        # User turn
        user_text = _extract_user_text(req)
        user_files = _extract_user_files(req)
        turns.append(Turn(
            session_id=session_id,
            turn=i * 2,
            role="user",
            original_text=user_text,
            workspace_id=meta.workspace_id,
            workspace_name=meta.workspace_name,
            workspace_folder=meta.workspace_folder,
            session_name=session_name,
            agent_used="copilot",
            request_id=request_id,
            model_id=model_id,
            timestamp_ms=timestamp_ms,
            timestamp_iso=timestamp_iso,
            ts=str(timestamp_ms),
            files=user_files,
        ))
        
        # Assistant turn
        asst_text, tools, asst_files, thinking = _extract_assistant_response(req)
        response_time_ms = _extract_response_time(req)
        
        # Build extra dict with response time if available
        extra = {}
        if response_time_ms > 0:
            extra["response_time_ms"] = response_time_ms
        
        turns.append(Turn(
            session_id=session_id,
            turn=i * 2 + 1,
            role="assistant",
            original_text=asst_text,
            workspace_id=meta.workspace_id,
            workspace_name=meta.workspace_name,
            workspace_folder=meta.workspace_folder,
            session_name=session_name,
            agent_used="copilot",
            request_id=request_id,
            model_id=model_id,
            timestamp_ms=timestamp_ms,
            timestamp_iso=timestamp_iso,
            ts=str(timestamp_ms),
            files=asst_files,
            tools=tools,
            thinking_text=thinking,
            extra=extra,
        ))
    
    return turns


def _extract_response_time(req: dict) -> int:
    """Extract response time from result.timings.totalElapsed."""
    result = req.get("result", {})
    if isinstance(result, dict):
        timings = result.get("timings", {})
        if isinstance(timings, dict):
            total_elapsed = timings.get("totalElapsed")
            if isinstance(total_elapsed, (int, float)):
                return int(total_elapsed)
    return 0


def _parse_timestamp(req: dict, fallback_ms: int) -> int:
    """Extract timestamp with priority: timestamp > createdAt > fallback."""
    if "timestamp" in req:
        ts = req["timestamp"]
        if isinstance(ts, (int, float)):
            return int(ts)
        if isinstance(ts, str) and ts.isdigit():
            return int(ts)
    
    if "createdAt" in req:
        iso = req["createdAt"]
        try:
            if iso.endswith("Z"):
                iso = iso[:-1] + "+00:00"
            dt = datetime.fromisoformat(iso)
            return int(dt.timestamp() * 1000)
        except ValueError:
            pass
    
    return fallback_ms


def _find_field(obj: dict, field_names: list[str], visited: set | None = None) -> str:
    """Recursively search for the first matching field."""
    if visited is None:
        visited = set()
    
    obj_id = id(obj)
    if obj_id in visited:
        return ""
    visited.add(obj_id)
    
    # Check direct fields (case-insensitive)
    lower_names = [n.lower() for n in field_names]
    for key, val in obj.items():
        if key.lower() in lower_names and isinstance(val, (str, int)):
            return str(val)
    
    # Recurse into nested objects
    for val in obj.values():
        if isinstance(val, dict):
            result = _find_field(val, field_names, visited)
            if result:
                return result
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, dict):
                    result = _find_field(item, field_names, visited)
                    if result:
                        return result
    return ""


def _extract_user_text(req: dict) -> str:
    """Extract user message text."""
    msg = req.get("message", {})
    if isinstance(msg, dict):
        # Priority 1: message.text
        if msg.get("text"):
            return msg["text"]
        # Priority 2: message.parts[].text
        parts = msg.get("parts", [])
        if parts:
            return "\n".join(p.get("text", "") for p in parts if isinstance(p, dict))
    return ""


def _extract_user_files(req: dict) -> list[str]:
    """Extract context files attached by user."""
    files = []
    variables = req.get("variableData", {}).get("variables", [])
    for v in variables:
        if v.get("kind") == "file":
            path = v.get("value", {}).get("path", "")
            if path:
                files.append(normalize_path(path))
    return sorted(set(files))


def _extract_filename_from_ref(ref: dict) -> str:
    """Extract just the filename or symbol name from an inlineReference.
    
    The reference can be:
    1. A URI dict with fsPath/path (file reference)
    2. A symbol reference with 'name' and 'location' (function/class reference)
    
    For symbol references, we prioritize the 'name' field (e.g., "normalize_shape(shape)")
    over extracting from the location URI.
    """
    if not isinstance(ref, dict):
        return ""
    
    # Check for symbol name first (symbol references like functions/classes)
    # These have a 'name' field and optionally a 'location'
    name = ref.get("name", "")
    if name:
        return name
    
    # Try to get path from fsPath or path field (file references)
    path = ref.get("fsPath") or ref.get("path") or ""
    
    # If it's a symbol reference with location but no name, try to get the file
    if not path and "location" in ref:
        loc = ref.get("location", {})
        uri = loc.get("uri", {})
        if isinstance(uri, dict):
            path = uri.get("fsPath") or uri.get("path") or ""
    
    if path:
        # Extract just the filename
        return Path(path).name
    
    return ""


def _extract_assistant_response(req: dict) -> tuple[str, list[str], list[str], str]:
    """Extract assistant response text, tools used, files referenced, and thinking content.
    
    Returns:
        Tuple of (text, tools, files, thinking)
        - text: Regular response text with inlineReferences resolved
        - tools: List of tool names used
        - files: List of file paths referenced  
        - thinking: Concatenated thinking content from reasoning models
    """
    response = req.get("response", [])
    if not isinstance(response, list):
        return "", [], [], ""
    
    text_parts = []
    thinking_parts = []
    tools = set()
    files = set()
    
    # Track code block context to preserve fences around textEditGroup
    in_code_block_context = False
    pending_code_fence = None
    
    for item in response:
        if not isinstance(item, dict):
            continue
        
        kind = item.get("kind", "")
        
        # Handle thinking blocks separately
        if kind == "thinking":
            val = item.get("value", "")
            if isinstance(val, str) and val.strip():
                thinking_parts.append(val.strip())
            continue
        
        # Handle inline references - extract filename and add to text
        if kind == "inlineReference":
            ref = item.get("inlineReference", {})
            filename = _extract_filename_from_ref(ref)
            if filename:
                text_parts.append(f"`{filename}`")
            continue
        
        # Track codeblockUri - indicates a code block is starting
        if kind == "codeblockUri":
            in_code_block_context = True
            # If we have a pending code fence (opening), add it now
            if pending_code_fence:
                text_parts.append(pending_code_fence)
                pending_code_fence = None
            continue
        
        # Files and code content from textEditGroup
        if kind == "textEditGroup":
            uri = item.get("uri", {})
            if uri.get("path"):
                files.add(normalize_path(uri["path"]))
            
            # If we have a pending code fence (opening), add it before the code
            if pending_code_fence:
                text_parts.append(pending_code_fence)
                pending_code_fence = None
            
            # Extract actual code from edits array
            edits = item.get("edits", [])
            edit_texts = []
            for edit_group in edits:
                if isinstance(edit_group, list):
                    for edit in edit_group:
                        if isinstance(edit, dict) and edit.get("text"):
                            edit_text = edit["text"]
                            # Ensure each edit starts with a newline if it doesn't already
                            if edit_text and not edit_text.startswith("\n"):
                                edit_text = "\n" + edit_text
                            edit_texts.append(edit_text)
            
            if edit_texts:
                # Add the code content to text_parts
                code_content = "\n".join(edit_texts)
                text_parts.append(code_content)
                # After adding code, we expect a closing fence
                in_code_block_context = True
            continue
        
        # Regular text (no kind or other kinds with value)
        val = item.get("value", "")
        if isinstance(val, str) and val.strip():
            stripped = val.strip()
            is_code_fence = stripped == "```" or (stripped.startswith("```") and len(stripped) <= 15 and "\n" not in stripped)
            
            if is_code_fence:
                if in_code_block_context:
                    # We're in a code block context, preserve this fence (closing)
                    text_parts.append(val)
                    in_code_block_context = False
                else:
                    # Not in code block context yet, save as pending (opening)
                    pending_code_fence = val
            else:
                # Not a code fence, add normally
                text_parts.append(val)
        
        # Tools
        for key in ["toolId", "toolName"]:
            if item.get(key):
                tools.add(item[key])
        
        # Files from invocationMessage.uris
        inv = item.get("invocationMessage")
        if isinstance(inv, dict):
            for uri in inv.get("uris", []):
                if isinstance(uri, dict) and uri.get("path"):
                    files.add(normalize_path(uri["path"]))
    
    # Files from editedFileEvents
    for event in req.get("editedFileEvents", []):
        uri = event.get("uri", {})
        if uri.get("path"):
            files.add(normalize_path(uri["path"]))
    
    # Join text parts - use empty string joiner to preserve original spacing
    # since each part already has its own spacing
    text = "".join(text_parts)
    
    # Join thinking parts with double newline
    thinking = "\n\n".join(thinking_parts)
    
    return text, sorted(tools), sorted(files), thinking


def extract_workspace(meta: WorkspaceMeta) -> list[Turn]:
    """Extract all data from a single workspace, matching edits to turns."""
    turns = []
    
    chat_dir = meta.path / "chatSessions"
    edits_dir = meta.path / "chatEditingSessions"
    
    for session_file in chat_dir.glob("*.json"):
        session_turns = extract_session(session_file, meta)
        
        # Check for corresponding edit session
        edit_folder = edits_dir / session_file.stem
        if edit_folder.exists():
            session_edits = extract_edits(edit_folder)
            
            # Match edits to turns by request_id
            for edit in session_edits:
                req_id = edit.extra.get("request_id")
                if req_id:
                    # Find assistant turn with this request_id
                    for turn in session_turns:
                        if turn.role == "assistant" and turn.request_id == req_id:
                            turn.code_edits.append(edit)
                            break
                            
        turns.extend(session_turns)
    
    return turns

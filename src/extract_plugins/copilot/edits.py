"""Code edits extraction for Copilot chat editing sessions.

Handles extraction of file diffs from chatEditingSessions folders.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from src.shared.models.turn import CodeEdit
from src.shared.io.paths import decode_file_uri


EMPTY_HASH_PREFIX = "da39a3e"


def extract_edits(session_folder: Path) -> list[CodeEdit]:
    """Extract code edits from a chatEditingSessions folder."""
    state_path = session_folder / "state.json"
    contents_dir = session_folder / "contents"
    
    if not state_path.exists():
        return []
    
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except:
        return []
    
    edits = []
    
    # Build initial content map
    uri_to_initial = {}
    for item in state.get("initialFileContents", []):
        if isinstance(item, list) and len(item) >= 2:
            uri_to_initial[item[0]] = item[1]
    
    # Try fileBaselines first (granular per-request diffs)
    timeline = state.get("timeline", {})
    baselines = timeline.get("fileBaselines", [])
    
    if baselines:
        edits = _extract_from_baselines(baselines, state, contents_dir)
    
    # Fallback to recentSnapshot if no baseline edits found
    if not edits and state.get("recentSnapshot", {}).get("entries"):
        edits = _extract_from_snapshot(state, uri_to_initial, contents_dir)
        
    # Fallback to linearHistory if still no edits found
    if not edits and state.get("linearHistory"):
        edits = _extract_from_linear_history(state, contents_dir)
    
    return edits


def _extract_from_baselines(baselines: list, state: dict, contents_dir: Path) -> list[CodeEdit]:
    """Extract diffs using fileBaselines (Spec 7.3)."""
    # Group baselines by URI
    uri_baselines: dict[str, list[tuple[str, str, int]]] = {}  # uri -> [(request_id, hash, epoch)]
    
    for item in baselines:
        if not isinstance(item, list) or len(item) < 2:
            continue
        key, info = item[0], item[1]
        
        # Parse key: "uri::requestId"
        if "::" in key:
            uri = key.rsplit("::", 1)[0]
        else:
            continue
        
        if not isinstance(info, dict):
            continue
        
        request_id = info.get("requestId", "")
        epoch = info.get("epoch", 0)
        content_hash = info.get("content", "")
        
        if uri not in uri_baselines:
            uri_baselines[uri] = []
        uri_baselines[uri].append((request_id, content_hash, epoch))
    
    # Build final content map
    uri_to_final = {}
    for entry in state.get("recentSnapshot", {}).get("entries", []):
        if isinstance(entry, dict):
            uri_to_final[entry.get("resource", "")] = entry.get("currentHash", "")
    
    edits = []
    for uri, bl_list in uri_baselines.items():
        bl_list.sort(key=lambda x: x[2])  # Sort by epoch
        
        for i, (request_id, before_hash, _) in enumerate(bl_list):
            before = _read_content(before_hash, contents_dir)
            
            if i + 1 < len(bl_list):
                after_hash = bl_list[i + 1][1]
            else:
                after_hash = uri_to_final.get(uri, "")
            
            after = _read_content(after_hash, contents_dir)
            
            if before != after:
                file_path = decode_file_uri(uri)
                edits.append(CodeEdit(
                    file_path=file_path,
                    language=Path(file_path).suffix.lstrip("."),
                    code_before=before,
                    code_after=after,
                    extra={"request_id": request_id}
                ))
    
    return edits


def _extract_from_snapshot(state: dict, uri_to_initial: dict, contents_dir: Path) -> list[CodeEdit]:
    """Fallback: extract from recentSnapshot (Spec 7.5)."""
    edits = []
    
    for entry in state.get("recentSnapshot", {}).get("entries", []):
        if not isinstance(entry, dict):
            continue
        
        uri = entry.get("resource", "")
        initial_hash = uri_to_initial.get(uri, "")
        current_hash = entry.get("currentHash", "")
        
        if initial_hash == current_hash:
            continue
        
        request_id = _parse_telemetry_info(entry.get("telemetryInfo"))
        before = _read_content(initial_hash, contents_dir)
        after = _read_content(current_hash, contents_dir)
        
        if before != after:
            file_path = decode_file_uri(uri)
            edits.append(CodeEdit(
                file_path=file_path,
                language=Path(file_path).suffix.lstrip("."),
                code_before=before,
                code_after=after,
                extra={"request_id": request_id}
            ))
    
    return edits


def _extract_from_linear_history(state: dict, contents_dir: Path) -> list[CodeEdit]:
    """Fallback: extract from linearHistory (Spec 7.6)."""
    edits = []
    
    for item in state.get("linearHistory", []):
        if not isinstance(item, dict):
            continue
        
        request_id = item.get("requestId", "")
        
        for stop in item.get("stops", []):
            for entry in stop.get("entries", []):
                if not isinstance(entry, dict):
                    continue
                
                uri = entry.get("resource", "")
                original_hash = entry.get("originalHash", "")
                current_hash = entry.get("currentHash", "")
                
                if original_hash == current_hash:
                    continue
                
                before = _read_content(original_hash, contents_dir)
                after = _read_content(current_hash, contents_dir)
                
                if before != after:
                    file_path = decode_file_uri(uri)
                    edits.append(CodeEdit(
                        file_path=file_path,
                        language=Path(file_path).suffix.lstrip("."),
                        code_before=before,
                        code_after=after,
                        extra={"request_id": request_id}
                    ))
    
    return edits


def _read_content(hash_or_content: str, contents_dir: Path) -> str:
    """Read content by hash, or treat as literal if file doesn't exist."""
    if not hash_or_content:
        return ""
    
    # Empty file hash
    if hash_or_content.startswith(EMPTY_HASH_PREFIX):
        return ""
    
    # Try reading as file
    content_file = contents_dir / hash_or_content
    if content_file.exists():
        try:
            return content_file.read_text(encoding="utf-8")
        except:
            return ""
    
    # Treat as literal content
    return hash_or_content


def _parse_telemetry_info(info: Any) -> str:
    """Parse telemetryInfo which can be dict or string."""
    if isinstance(info, dict):
        return info.get("requestId", "")
    
    if isinstance(info, str):
        # Format: @{requestId=xxx; agentId=...}
        match = re.search(r"requestId=([^;}\s]+)", info)
        if match:
            return match.group(1)
    
    return ""

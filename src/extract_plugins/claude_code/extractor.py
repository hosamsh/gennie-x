
"""Claude Code Data Extractor."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from src.shared.models.turn import Turn, CodeEdit
from src.shared.models.workspace import WorkspaceInfo, WorkspaceActivity, ExtractedWorkspace
from src.shared.io.paths import normalize_path
from ..agent_extractor import AgentExtractor

logger = logging.getLogger(__name__)

# Default Claude directory
def get_claude_dir() -> Path:
    return Path.home() / ".claude"

def get_projects_dir() -> Path:
    return get_claude_dir() / "projects"

def get_history_file() -> Path:
    return get_claude_dir() / "history.jsonl"

def encode_project_path(project_path: str) -> str:
    """Reimplements the logic: projectPath.replace(/[:/\\.]/g, "-")"""
    if not project_path:
        return ""
    return re.sub(r'[:/\\.]', '-', project_path)

@dataclass
class ClaudeWorkspaceMeta:
    workspace_id: str
    workspace_name: str
    workspace_folder: str
    path: Path # Path to the project's jsonl files directory

class ClaudeCodeExtractor(AgentExtractor):
    AGENT_NAME = "claude_code"

    def _get_claude_dir(self) -> Path:
        """Get Claude directory from config or use default."""
        if self.config:
            claude_dir = self.config.get('claude_dir')
            if claude_dir:
                return Path(claude_dir)
        return get_claude_dir()

    def _get_projects_dir(self) -> Path:
        """Get projects directory from config or use default."""
        return self._get_claude_dir() / "projects"

    def _get_history_file(self) -> Path:
        """Get history file from config or use default."""
        return self._get_claude_dir() / "history.jsonl"

    def _session_has_content(self, session_file: Path) -> bool:
        """Check if a session file has actual conversation content (user/assistant messages).
        
        Session files may only contain metadata like file-history-snapshot which means
        the session was started but no actual conversation occurred.
        """
        try:
            content = session_file.read_text(encoding='utf-8')
            for line in content.strip().split('\n'):
                if not line.strip():
                    continue
                try:
                    msg = json.loads(line)
                    msg_type = msg.get('type')
                    if msg_type in ('user', 'assistant'):
                        return True
                except json.JSONDecodeError:
                    continue
            return False
        except Exception:
            return False

    def scan_workspaces(self) -> List[WorkspaceInfo]:
        """Scan ~/.claude/history.jsonl and projects dir."""
        workspaces = []
        projects_dir = self._get_projects_dir()
        history_file = self._get_history_file()

        if not history_file.exists():
            return []

        # Read history to find known workspaces
        known_projects = set()
        
        try:
            with open(history_file, 'r', encoding='utf-8') as f:
                for line in f:
                    if not line.strip():
                        continue
                    try:
                        entry = json.loads(line)
                        p_path = entry.get('project')
                        if p_path:
                            known_projects.add(p_path)
                    except (json.JSONDecodeError, KeyError):
                        continue
        except Exception as e:
            logger.error(f"Error reading history.jsonl: {e}")

        # Verify existence on disk and create WorkspaceInfo
        for p_path in known_projects:
            encoded = encode_project_path(p_path)
            ws_dir = projects_dir / encoded
            
            # Check if directory exists or if we have at least one session file that matches
            # Actually Claude Code stores files in `projects/encoded_path/` ??
            # Based on previous analysis: 
            # ~/.claude/projects/C--code-learn-interview/.jsonl files exist inside?
            # OR ~/.claude/projects/C--code-learn-interview.jsonl ?
            
            # Let's double check the storage logic I found earlier:
            # "projectsDir = join(claudeDir, "projects")"
            # "const projectPath = join(projectsDir, dir.name)" -> It is a directory.
            
            if ws_dir.exists() and ws_dir.is_dir():
                # Count sessions that have actual conversation content
                session_files = list(ws_dir.glob("*.jsonl"))
                valid_session_count = 0
                
                # Get last modified
                last_modified = 0
                for sf in session_files:
                    try:
                        mtime = sf.stat().st_mtime
                        if mtime > last_modified:
                            last_modified = mtime
                        # Check if session has real content (user/assistant messages)
                        if self._session_has_content(sf):
                            valid_session_count += 1
                    except OSError:
                        pass
                
                # Skip workspaces with no valid sessions
                if valid_session_count == 0:
                    logger.debug(f"Skipping workspace {encoded} - no sessions with content")
                    continue
                
                dt = datetime.fromtimestamp(last_modified, tz=timezone.utc) if last_modified > 0 else datetime.now(timezone.utc)

                workspaces.append(WorkspaceInfo(
                    workspace_id=encoded, # Use encoded path as ID
                    workspace_name=Path(p_path).name,
                    workspace_folder=p_path,
                    agents=[self.AGENT_NAME],
                    session_count=valid_session_count,
                ))
        
        return workspaces

    @classmethod
    def create(cls, workspace_id: str, **kwargs) -> "ClaudeCodeExtractor":
        return cls(workspace_id)

    def extract_sessions(self) -> ExtractedWorkspace:
        """Extract all turns from the workspace."""
        
        # We need to find the real path from the ID (which is the encoded path)
        # Note: In scan_workspaces we used encoded path as ID.
        encoded_path = self.workspace_id
        projects_dir = self._get_projects_dir()
        ws_dir = projects_dir / encoded_path
        
        all_turns: List[Turn] = []
        
        if not ws_dir.exists():
            logger.warning(f"Workspace directory not found: {ws_dir}")
            return ExtractedWorkspace(
                workspace_id=self.workspace_id,
                agent_name=self.AGENT_NAME,
                turns=[],
                session_count=0,
                code_metrics=[],
            )

        # Get original project path from history if possible, or infer?
        # We can try to decode or just look up in history.
        # For now, let's look up in history since we have the encoded ID.
        # But scanning history every time is inefficient. 
        # We will infer name from ID for now.
        
        # We need to find the "Project Path" (e.g. c:/code/...) 
        # Read from history.jsonl to find the actual folder path for this encoded workspace
        actual_folder_path = None
        history_file = self._get_history_file()
        if history_file.exists():
            try:
                with open(history_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            entry = json.loads(line)
                            p_path = entry.get('project')
                            if p_path and encode_project_path(p_path) == encoded_path:
                                actual_folder_path = p_path
                                break
                        except (json.JSONDecodeError, KeyError):
                            continue
            except Exception as e:
                logger.warning(f"Could not read history.jsonl for folder lookup: {e}")
        
        # Fallback: if we couldn't find the folder in history, use encoded path
        if not actual_folder_path:
            logger.warning(f"Could not find actual folder path for {encoded_path}, using encoded path")
            actual_folder_path = encoded_path
        
        session_files = list(ws_dir.glob("*.jsonl"))
        
        # First pass: load all sessions and extract fingerprints for deduplication
        # Claude Code sometimes creates multiple session files where one is a 
        # subset/checkpoint of another. We deduplicate by keeping only the 
        # largest session when one is a complete subset of another.
        loaded_sessions: dict[str, tuple[list[dict], set[tuple[str, str]]]] = {}
        
        for sf in session_files:
            session_id = sf.stem
            try:
                content = sf.read_text(encoding='utf-8')
                lines = content.strip().split('\n')
                
                messages = []
                for line in lines:
                    if not line.strip(): continue
                    try:
                        messages.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
                
                # Extract fingerprint: set of (timestamp, content_preview) for user messages
                fingerprint = self._extract_session_fingerprint(messages)
                loaded_sessions[session_id] = (messages, fingerprint)
                
            except Exception as e:
                logger.error(f"Error loading session {sf}: {e}")
        
        # Deduplicate: identify sessions that are subsets of others
        sessions_to_skip = self._find_subset_sessions(loaded_sessions)
        if sessions_to_skip:
            logger.info(f"Skipping {len(sessions_to_skip)} subset session(s): {sessions_to_skip}")
        
        # Second pass: convert non-duplicate sessions to turns
        for session_id, (messages, _) in loaded_sessions.items():
            if session_id in sessions_to_skip:
                continue
            try:
                # Convert messages to Turns
                session_turns = self._convert_session(session_id, messages, encoded_path, actual_folder_path)
                all_turns.extend(session_turns)
                
            except Exception as e:
                logger.error(f"Error extracting session {session_id}: {e}")

        # Sort all turns by timestamp
        all_turns.sort(key=lambda t: t.timestamp_ms or 0)

        # Fix turn numbers per session? 
        # The base `ExtractedWorkspace` expects a flat list.
        # But usually turn numbers are per session.
        # The logic in `convert_session` handles turn numbering.

        # Count unique sessions
        unique_sessions = set(t.session_id for t in all_turns)
        
        return ExtractedWorkspace(
            workspace_id=self.workspace_id,
            agent_name=self.AGENT_NAME,
            turns=all_turns,
            session_count=len(unique_sessions),
            code_metrics=[],
        )

    def _extract_session_fingerprint(self, messages: List[dict]) -> set[tuple[str, str]]:
        """Extract a fingerprint from session messages for deduplication.
        
        Returns a set of (timestamp, content_preview) tuples for user messages.
        This allows detecting when one session is a subset of another.
        """
        fingerprint: set[tuple[str, str]] = set()
        
        for msg in messages:
            if msg.get('type') != 'user':
                continue
            
            ts = msg.get('timestamp', '')
            content = msg.get('message', {}).get('content', '')
            
            # Extract text preview from content
            preview = ''
            if isinstance(content, str):
                preview = content[:200]
            elif isinstance(content, list):
                for block in content:
                    if block.get('type') == 'text':
                        preview = block.get('text', '')[:200]
                        break
            
            if ts or preview:  # Include if we have either
                fingerprint.add((ts, preview))
        
        return fingerprint
    
    def _find_subset_sessions(
        self, 
        loaded_sessions: dict[str, tuple[list[dict], set[tuple[str, str]]]]
    ) -> set[str]:
        """Find sessions that are complete subsets of other sessions.
        
        Returns session IDs that should be skipped (they are subsets of larger sessions).
        """
        sessions_to_skip: set[str] = set()
        session_ids = list(loaded_sessions.keys())
        
        for i in range(len(session_ids)):
            s1_id = session_ids[i]
            _, fp1 = loaded_sessions[s1_id]
            
            # Skip empty sessions
            if not fp1:
                sessions_to_skip.add(s1_id)
                continue
            
            for j in range(i + 1, len(session_ids)):
                s2_id = session_ids[j]
                _, fp2 = loaded_sessions[s2_id]
                
                if not fp2:
                    continue
                
                # Check if one is a subset of the other
                if fp1.issubset(fp2) and fp1 != fp2:
                    # s1 is a subset of s2, skip s1
                    sessions_to_skip.add(s1_id)
                    logger.debug(f"Session {s1_id[:8]}... is subset of {s2_id[:8]}...")
                elif fp2.issubset(fp1) and fp2 != fp1:
                    # s2 is a subset of s1, skip s2
                    sessions_to_skip.add(s2_id)
                    logger.debug(f"Session {s2_id[:8]}... is subset of {s1_id[:8]}...")
        
        return sessions_to_skip

    def _convert_session(self, session_id: str, messages: List[dict], workspace_encoded: str, workspace_folder: str) -> List[Turn]:
        """Convert raw Claude Code messages to aggregated turns.
        
        Claude Code stores each tool_use and tool_result as separate messages, which leads to:
        - Multiple consecutive assistant messages (one per tool call)
        - Multiple consecutive user messages (one per tool result)
        - Empty text when only tool blocks are present
        
        This method aggregates consecutive same-role messages into single turns,
        and filters out:
        - Messages with isMeta=True that are pure system messages (Caveat prefix, command prompts)
        - Messages containing <command-name> tags (these are /commands)
        - Messages containing only <local-command-stdout> (command output)
        - Tool-result-only user messages (they're responses to assistant tool calls)
        - System and file-history-snapshot messages
        
        It also cleans user messages by:
        - Removing "Caveat:..." prefixes
        - Removing <local-command-stdout>...</local-command-stdout> blocks
        """
        
        def is_command_message(text: str, raw_content, is_meta: bool) -> bool:
            """Check if a message is a command that should be filtered entirely."""
            if not text and not raw_content:
                return False
            raw_str = str(raw_content)
            
            # Messages with <command-name> tag are always commands
            if '<command-name>' in raw_str:
                return True
            
            # "Create a Task with subagent_type" is a command-generated message (triggers subagent)
            if 'Create a Task with subagent_type' in text:
                return True
                
            # Single-word commands (warmup, usage, etc.) - common slash commands
            text_stripped = text.strip().lower()
            if text_stripped in {'warmup', 'usage', 'help', 'init', 'login', 'status'}:
                return True
            
            return False
        
        def is_synthetic_or_error_message(msg: dict) -> bool:
            """Check if message is synthetic (system-generated) or an API error.
            
            These messages should be filtered as they're not part of the actual conversation:
            - isApiErrorMessage=True: API errors like 'Invalid API key'
            - model='<synthetic>': System-generated messages not from the LLM
            """
            if msg.get('isApiErrorMessage'):
                return True
            model = msg.get('message', {}).get('model', '')
            if model == '<synthetic>':
                return True
            return False
        
        def is_subagent_trigger(text: str) -> bool:
            """Check if this message triggers a subagent task."""
            return 'Create a Task with subagent_type' in text
        
        def extract_subagent_prompt(text: str) -> str:
            """Extract the prompt from a 'Create a Task with subagent_type' message."""
            match = re.search(r'the prompt "([^"]+)"', text)
            return match.group(1) if match else ""
        
        def clean_user_text(text: str) -> str:
            """Clean user message text by removing system prefixes, command output, and control chars."""
            if not text:
                return text
            
            # Remove control characters (backspace \x08, etc.) that may have been captured
            # from terminal input - these cause DB viewers to display as BLOB
            # Keep newline (\n), carriage return (\r), and tab (\t)
            text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
            
            # Remove the "Caveat:..." prefix if present
            caveat_pattern = r'^Caveat: The messages below were generated by the user while running local commands\. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to\.\s*'
            text = re.sub(caveat_pattern, '', text, flags=re.MULTILINE)
            
            # Remove <local-command-stdout>...</local-command-stdout> blocks
            text = re.sub(r'<local-command-stdout>.*?</local-command-stdout>\s*', '', text, flags=re.DOTALL)
            
            return text.strip()
        
        def is_subagent_prompt(text: str, prev_text: str) -> bool:
            """Check if this message is a prompt passed to a subagent (should be filtered)."""
            # If previous message was "Create a Task with subagent_type X and the prompt Y"
            # then this message might be that prompt Y repeated
            if prev_text and 'Create a Task with subagent_type' in prev_text:
                # Extract the prompt from previous message
                match = re.search(r'the prompt "([^"]+)"', prev_text)
                if match:
                    prompt = match.group(1)
                    # If current text starts with or equals the prompt, it's a duplicate
                    if text.strip().startswith(prompt[:50]):
                        return True
            return False
        
        # First pass: collect and aggregate messages, tracking command context
        aggregated = []
        current = None
        prev_was_command = False  # Track if previous user message was a command
        prev_text = ""  # Track previous message text for subagent prompt detection
        subagent_prompt = ""  # Track expected subagent prompt to filter
        in_subagent_context = False  # Track if we're inside a subagent task
        
        for msg in messages:
            m_type = msg.get('type')
            
            # Skip non-chat messages
            if m_type not in ('user', 'assistant'):
                continue
            
            # Get metadata
            is_meta = msg.get('isMeta', False)
            content_data = msg.get('message', {})
            raw_content = content_data.get('content')
            ts_iso = msg.get('timestamp', '')
            
            # Parse timestamp
            ts_ms = 0
            if ts_iso:
                try:
                    dt = datetime.fromisoformat(ts_iso.replace('Z', '+00:00'))
                    ts_ms = int(dt.timestamp() * 1000)
                except ValueError:
                    pass
            
            # Extract request/model info (available at top level for assistant messages)
            request_id = msg.get('requestId', '')
            model_id = content_data.get('model', '')
            
            # Extract content from this message
            text_parts = []
            tools = []
            files = []
            code_edits = []
            thinking = ""
            is_tool_result_only = False
            
            if isinstance(raw_content, str):
                text_parts.append(raw_content)
            elif isinstance(raw_content, list):
                has_text = False
                has_tool_result = False
                
                for block in raw_content:
                    b_type = block.get('type')
                    if b_type == 'text':
                        text = block.get('text', '')
                        if text.strip():
                            text_parts.append(text)
                            has_text = True
                    elif b_type == 'thinking':
                        thinking += block.get('thinking', '') + "\n"
                    elif b_type == 'tool_use':
                        t_name = block.get('name')
                        if t_name:
                            tools.append(t_name)
                        # Extract file paths and code edits
                        t_input = block.get('input', {})
                        for key in ('file_path', 'path', 'file'):
                            if key in t_input:
                                files.append(normalize_path(t_input[key]))
                        
                        # Extract code edits from Write and Edit tools
                        if t_name == 'Write' and 'file_path' in t_input:
                            fp = normalize_path(t_input['file_path'])
                            content = t_input.get('content', '')
                            lang = self._detect_language(fp)
                            code_edits.append(CodeEdit(
                                file_path=fp,
                                language=lang,
                                code_after=content,
                                extra={'tool': 'Write'}
                            ))
                        elif t_name == 'Edit' and 'file_path' in t_input:
                            fp = normalize_path(t_input['file_path'])
                            old_str = t_input.get('old_string', '')
                            new_str = t_input.get('new_string', '')
                            lang = self._detect_language(fp)
                            code_edits.append(CodeEdit(
                                file_path=fp,
                                language=lang,
                                code_before=old_str,
                                code_after=new_str,
                                diff=f"--- old\n+++ new\n@@ @@\n-{old_str}\n+{new_str}",
                                extra={'tool': 'Edit'}
                            ))
                    elif b_type == 'tool_result':
                        has_tool_result = True
                
                # User message with only tool_result blocks = response to assistant's tool calls
                if m_type == 'user' and has_tool_result and not has_text:
                    is_tool_result_only = True
            
            # Get the full text for analysis
            full_text = "\n".join(text_parts)
            
            # Check if this is a command message that should be filtered entirely
            if is_command_message(full_text, raw_content, is_meta):
                # Check if this triggers a subagent
                if is_subagent_trigger(full_text):
                    subagent_prompt = extract_subagent_prompt(full_text)
                    in_subagent_context = True
                prev_was_command = True
                prev_text = full_text
                continue
            
            # Check if this is a subagent prompt (the actual prompt following "Create a Task")
            if m_type == 'user' and in_subagent_context:
                # If this message matches (or starts with) the expected subagent prompt, filter it
                if subagent_prompt and full_text.strip().startswith(subagent_prompt[:50]):
                    # Still in subagent context
                    prev_was_command = True
                    prev_text = full_text
                    continue
            
            # Handle command response filtering for assistant messages
            if m_type == 'assistant':
                # Skip synthetic/error messages (isApiErrorMessage or model='<synthetic>')
                if is_synthetic_or_error_message(msg):
                    prev_was_command = False
                    prev_text = full_text
                    continue
                    
                if prev_was_command or in_subagent_context:
                    # If we're in subagent context and assistant uses Task tool, skip
                    if 'Task' in tools or in_subagent_context:
                        prev_was_command = False
                        prev_text = full_text
                        continue
                    prev_was_command = False
                    prev_text = full_text
                    continue
            
            # Reset command tracking and subagent context for non-command user messages
            if m_type == 'user':
                prev_was_command = False
                # Only reset subagent context if this is a genuine user message (not tool result)
                if not is_tool_result_only:
                    in_subagent_context = False
                    subagent_prompt = ""
            
            # Skip tool-result-only user messages
            if is_tool_result_only:
                prev_text = full_text
                continue
            
            # Clean user message text (remove Caveat prefix and local-command-stdout)
            if m_type == 'user':
                full_text = clean_user_text(full_text)
                text_parts = [full_text] if full_text else []
            
            # Skip if no content left after cleaning (but keep thinking-only messages for aggregation)
            if not full_text and not tools and not thinking:
                prev_text = full_text
                continue
            
            prev_text = full_text
            
            # Check if we should aggregate with current turn
            if current and current['role'] == m_type:
                # Same role - aggregate
                current['text_parts'].extend(text_parts)
                current['tools'].extend(tools)
                current['files'].extend(files)
                current['code_edits'].extend(code_edits)
                current['thinking'] += thinking
                # Keep the earliest timestamp
                if ts_ms > 0 and (current['ts_ms'] == 0 or ts_ms < current['ts_ms']):
                    current['ts_ms'] = ts_ms
                    current['ts_iso'] = ts_iso
                # Keep first non-empty model_id and request_id
                if model_id and not current.get('model_id'):
                    current['model_id'] = model_id
                if request_id and not current.get('request_id'):
                    current['request_id'] = request_id
            else:
                # Different role or first message - save current and start new
                if current:
                    aggregated.append(current)
                current = {
                    'role': m_type,
                    'text_parts': text_parts,
                    'tools': tools,
                    'files': files,
                    'code_edits': code_edits,
                    'thinking': thinking,
                    'ts_ms': ts_ms,
                    'ts_iso': ts_iso,
                    'model_id': model_id,
                    'request_id': request_id,
                }
        
        # Don't forget the last turn
        if current:
            aggregated.append(current)
        
        # Second pass: filter out empty turns and orphaned assistant turns at start
        # Also convert to Turn objects
        turns = []
        turn_idx = 0
        session_started = False  # Track if we've seen a user turn yet
        
        for agg in aggregated:
            text = "\n".join(agg['text_parts']).strip()
            tools = sorted(list(set(agg['tools'])))
            files = sorted(list(set(agg['files'])))
            code_edits = agg.get('code_edits', [])
            thinking = agg['thinking'].strip()
            model_id = agg.get('model_id', '')
            request_id = agg.get('request_id', '')
            
            # Skip turns with no meaningful content
            if not text and not tools:
                continue
            
            # Ensure session starts with a user turn
            # Skip any assistant turns before the first user turn
            if not session_started:
                if agg['role'] == 'assistant':
                    # Skip orphaned assistant turn at the start
                    continue
                else:
                    session_started = True
            
            turn = Turn(
                session_id=session_id,
                turn=turn_idx,
                role=agg['role'],
                original_text=text,
                workspace_id=workspace_encoded,
                workspace_name=workspace_encoded,
                workspace_folder=workspace_folder,  # Use actual folder path for cross-agent consolidation
                session_name=session_id,
                agent_used=self.AGENT_NAME,
                timestamp_ms=agg['ts_ms'],
                timestamp_iso=agg['ts_iso'],
                ts=str(agg['ts_ms']),
                files=files,
                tools=tools,
                code_edits=code_edits if agg['role'] == 'assistant' else [],
                thinking_text=thinking if agg['role'] == 'assistant' and thinking else None,
                model_id=model_id if agg['role'] == 'assistant' else "",
                request_id=request_id if agg['role'] == 'assistant' else "",
            )
            turns.append(turn)
            turn_idx += 1
        
        return turns

    def _detect_language(self, file_path: str) -> str:
        """Detect programming language from file extension."""
        ext_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescriptreact',
            '.jsx': 'javascriptreact',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.md': 'markdown',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.sql': 'sql',
            '.sh': 'shellscript',
            '.bash': 'shellscript',
            '.rs': 'rust',
            '.go': 'go',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.h': 'c',
            '.hpp': 'cpp',
            '.cs': 'csharp',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.r': 'r',
            '.xml': 'xml',
            '.toml': 'toml',
            '.ini': 'ini',
            '.cfg': 'ini',
            '.env': 'dotenv',
            '.gitignore': 'ignore',
        }
        ext = Path(file_path).suffix.lower()
        return ext_map.get(ext, 'plaintext')

    def get_latest_activity(self) -> Optional[WorkspaceActivity]:
        # Implementation skipped for brevity, safe to return None
        return None

    def cleanup(self) -> None:
        pass

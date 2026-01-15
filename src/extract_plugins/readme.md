# Agent Extractor Interface Contract

This document describes the interface that agent extractors must implement
to be auto-discovered and used by the extraction pipeline.

## Architecture Overview

Extractors follow a two-phase architecture:

1. **Extraction Phase** (this interface): Extractors return `Turn` objects with raw 
   data as found in the source. No computed fields (tokens, language detection, metrics).

2. **Enrichment Phase** (pipeline orchestrator): The orchestrator enriches `Turn` → `EnrichedTurn` 
   with computed fields like token counts, language detection, response times, and code metrics.

This separation keeps extractors focused on parsing source data only, making them simpler 
and ensuring computed fields are consistent across all agents.

## How to Add a New Agent (e.g., Windsurf)

### 1. Create the agent folder

```
src/extract/windsurf/
```

### 2. Create `agent.py` with the extractor class

```python
from typing import List, Optional
from pathlib import Path

from src.extract_plugins.agent_extractor import AgentExtractor
from src.shared.models.turn import Turn, CodeEdit
from src.shared.models.workspace import (
    WorkspaceInfo,
    WorkspaceActivity,
    ExtractedWorkspace,
)
from src.shared.config.models import ExtractConfig

class WindsurfExtractor(AgentExtractor):
    """Windsurf-specific extraction logic."""
    
    AGENT_NAME = "windsurf"
    
    def __init__(self, workspace_id: str):
        super().__init__(workspace_id)
        # Initialize any workspace-specific state
    
    @classmethod
    def create(cls, workspace_id: str, **kwargs) -> "WindsurfExtractor":
        """Factory method to create extractor instance.
        
        This is a REQUIRED abstract method from AgentExtractor.
        """
        return cls(workspace_id)
    
    def scan_workspaces(self) -> List[WorkspaceInfo]:
        """Scan storage and return list of workspaces with sessions.
        
        This is a REQUIRED abstract method from AgentExtractor.
        """
        # Get storage path from config
        storage_path = Path(self.config.get('workspace_storage', '/default/path'))
        
        workspaces = []
        for folder in storage_path.iterdir():
            if not folder.is_dir():
                continue
            
            # Check for sessions (adapt to your agent's storage)
            sessions = list(folder.glob("*.json"))  # Example
            if not sessions:
                continue
            
            workspaces.append(WorkspaceInfo(
                workspace_id=folder.name,
                workspace_name=folder.name,
                workspace_folder=str(folder),
                agents=[self.AGENT_NAME],
                session_count=len(sessions),
            ))
        
        return workspaces
    
    def extract_sessions(self) -> ExtractedWorkspace:
        """Extract all turns from the workspace.
        
        This is a REQUIRED abstract method from AgentExtractor.
        
        Implement your own extraction logic:
        - Find and iterate through sessions
        - Use parallel or sequential processing as appropriate
        - Extract raw turns (Turn) - NO token counting or metrics
        - Attach raw code edits (CodeEdit) - NO computed metrics
        """
        # Your extraction logic here
        all_turns: List[Turn] = []
        session_ids = set()
        
        # Example: build a raw turn (no tokens/metrics)
        turn = Turn(
            session_id="session123",
            turn=0,
            role="user",
            original_text="original text from source",
            workspace_id=self.workspace_id,
            workspace_name="My Workspace",
            workspace_folder="/path/to/workspace",
            agent_used=self.AGENT_NAME,
            model_id="gpt-4",  # Raw model ID from source
            timestamp_ms=1234567890000,
            files=["src/main.py"],
            code_edits=[
                CodeEdit(
                    file_path="src/main.py",
                    language="python",
                    code_after="new code",
                )
            ],
        )
        all_turns.append(turn)
        session_ids.add(turn.session_id)
        
        return ExtractedWorkspace(
            turns=all_turns,
            session_count=len(session_ids),
            agent_name=self.AGENT_NAME,
            workspace_id=self.workspace_id,
            code_metrics=[],
        )
    
    def get_latest_activity(self) -> Optional[WorkspaceActivity]:
        """Get quick stats from source files without full extraction.
        
        This is a REQUIRED abstract method from AgentExtractor.
        """
        # Quick scan logic here
        storage_path = Path(self.config.get('workspace_storage', '/default/path'))
        workspace_path = storage_path / self.workspace_id
        
        if not workspace_path.exists():
            return None
        
        sessions = list(workspace_path.glob("*.json"))  # Example
        
        # Quick estimate of turn count
        turn_count = 0
        for session_file in sessions:
            try:
                content = session_file.read_text()
                turn_count += content.count('"role"')  # Quick estimate
            except:
                pass
        
        return WorkspaceActivity(
            session_count=len(sessions),
            turn_count=turn_count,
            session_ids=[s.stem for s in sessions],
        )
    
    def cleanup(self) -> None:
        """Cleanup resources.
        
        This is a REQUIRED abstract method from AgentExtractor.
        """
        # For file-based extraction, nothing to cleanup
        pass
```

### 3. Add config section in `config/config.yaml`

```yaml
extract:
  windsurf:
    workspace_storage: "path/to/windsurf/workspaceStorage"
    # ... other agent-specific settings
```

### 4. Done!

The agent registry will auto-discover your extractor.

---

## Interface Details

### Required Class Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `AGENT_NAME` | `str` | Unique identifier for the agent (e.g., "windsurf", "copilot", "cursor"). Used for config lookup, logging, and registry keys. |

### Required Class Methods

These are **abstract methods** enforced by the `AgentExtractor` base class. Python's ABC will prevent instantiation if these are not implemented.

#### `@classmethod create(cls, workspace_id: str, **kwargs) -> "AgentExtractor"`
Factory method to create an extractor instance. The kwargs may include pre-built caches or database connections for efficiency.

**Must be decorated with `@classmethod` and `@abstractmethod`** (already done in base class).

### Required Instance Methods

#### `scan_workspaces() -> List[WorkspaceInfo]` (abstract)
Scan the agent's storage location and return a list of workspaces that have chat sessions. Called during workspace listing.

**Must implement this abstract method.**

Return `WorkspaceInfo` objects with:
- `workspace_id`: Unique identifier
- `workspace_name`: Display name
- `workspace_folder`: Path to workspace folder
- `agents`: List containing your agent name
- `session_count`: Number of extractable sessions

#### `extract_sessions() -> ExtractedWorkspace` (abstract)
Extract all turns from the workspace. This is the **main method** where you implement your extraction logic.

**Must implement this abstract method.**

Each agent decides its own:
- How to find sessions (files, database queries, etc.)
- Whether to use parallel or sequential processing
- How to iterate and extract turns
- How to post-process results

Return an `ExtractedWorkspace` with:
- `turns`: List of extracted `Turn` objects (raw, not enriched)
- `session_count`: Number of sessions extracted
- `agent_name`: Your agent's name (usually `self.AGENT_NAME`)
- `workspace_id`: The workspace identifier
- `code_metrics`: Optional list of `CodeMetric` objects (usually empty list)

#### `get_latest_activity() -> Optional[WorkspaceActivity]` (abstract)
Get quick stats from source files without full extraction. Used to detect changes since last extraction.

**Must implement this abstract method.**

Return `WorkspaceActivity` with:
- `session_count`: Number of sessions
- `turn_count`: Estimated turn count (can be approximate)
- `session_ids`: List of session identifiers

Return `None` if workspace not found or has no data.

#### `cleanup() -> None` (abstract)
Cleanup resources (e.g., close database connections, release file handles).

**Must implement this abstract method.**

For file-based extractors, this can be a simple `pass`.

#### `_load_config() -> ExtractConfig` (inherited, can override)
Load agent-specific configuration. Default implementation uses `AGENT_NAME` to load from config.yaml. Override only if special behavior needed.

### Optional Helper Methods

You can add helper methods as needed for your specific agent implementation. Common patterns include:
- `_get_workspace_meta()`: Retrieve workspace metadata
- `_discover_sessions()`: Find session files or database records
- `_extract_session()`: Extract turns from a single session
- `_build_turn()`: Construct Turn objects from source data

---

## Shared Utilities

### Path and File Utilities

```python
from src.shared.io.paths import normalize_path, decode_file_uri
```

### Text Utilities

```python
from src.shared.text import clean_text, clean_text_light, coerce_text
```

### Models

```python
# For extractors - build raw Turn objects
from src.shared.models.turn import Turn, CodeEdit
from src.shared.models.workspace import (
    WorkspaceInfo,
    WorkspaceActivity,
    ExtractedWorkspace,
)

# Base class and config
from src.extract_plugins.agent_extractor import AgentExtractor
from src.shared.config.models import ExtractConfig
```

### Enrichment (handled by orchestrator)

The orchestrator automatically enriches `Turn` → `EnrichedTurn` after extraction:

```python
# This happens in the pipeline - NOT in extractors
from src.shared.models.turn import EnrichedTurn

# After extraction, the orchestrator:
# 1. Calls extractor.extract_sessions() → ExtractedWorkspace with Turn objects
# 2. Enriches Turn → EnrichedTurn (tokens, metrics, language detection)
# 3. Stores enriched turns in database
```

## Examples

### Using the Registry

```python
from src.extract_plugins.agent_registry import get_extractor_class, list_registered_agents

# List all registered agents
agents = list_registered_agents()  # ['copilot', 'cursor', 'claude_code', ...]

# Get an extractor class
ExtractorClass = get_extractor_class('copilot')

# Create extractor instance
extractor = ExtractorClass.create(workspace_id='123abc')

# Scan for workspaces (on the instance)
workspaces = extractor.scan_workspaces()

# Check for new activity without full extraction
activity = extractor.get_latest_activity()
if activity:
    print(f"Workspace has {activity.session_count} sessions, ~{activity.turn_count} turns")

# Extract all turns (returns raw Turn objects)
result = extractor.extract_sessions()
print(f"Extracted {result.turn_count} turns from {result.session_count} sessions")

# Cleanup
extractor.cleanup()
```

### Implementation Examples

See `copilot/agent.py` for parallel extraction example.
See `cursor/agent.py` for sequential extraction example.

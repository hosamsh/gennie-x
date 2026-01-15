"""Auto-discovery registry for agent extractors via convention-over-configuration."""

import json
from pathlib import Path
from typing import Dict, Type, Optional, List, TypedDict

from src.shared.logging.logger import get_logger
from src.extract_plugins.agent_extractor import AgentExtractor

logger = get_logger(__name__)


class AgentMetadata(TypedDict, total=False):
    """Metadata for an agent plugin."""
    name: str
    display_name: str
    icon: str
    color: str
    description: str


_AGENT_REGISTRY: Dict[str, Type[AgentExtractor]] = {}
_AGENT_METADATA: Dict[str, AgentMetadata] = {}


def _discover_agents() -> None:
    """Auto-discover and register agent modules from extract_plugins subdirectories."""
    import importlib
    
    agents_dir = Path(__file__).parent
    
    for agent_dir in agents_dir.iterdir():
        # Skip non-directories, private dirs, and folders starting with "_"
        if not agent_dir.is_dir():
            continue
        if agent_dir.name.startswith("_"):
            continue
            
        # Check if this directory has a agent.py file
        agent_impl_file = agent_dir / "agent.py"
        if not agent_impl_file.exists():
            continue
        
        agent_name = agent_dir.name
        
        try:
            module = importlib.import_module(f".{agent_name}.agent", package=__package__)
            
            class_name = f"{agent_name.title()}Extractor"
            
            extractor_class = getattr(module, class_name, None)
            
            if not extractor_class:
                logger.warning(f"Agent {agent_name}: missing {class_name} class")
                continue
            if not issubclass(extractor_class, AgentExtractor):
                logger.warning(f"Agent {agent_name}: {class_name} must inherit from AgentExtractor")
                continue
            
            _AGENT_REGISTRY[agent_name] = extractor_class
            
            # Load metadata if available
            metadata_file = agent_dir / "metadata.json"
            if metadata_file.exists():
                try:
                    with open(metadata_file, 'r', encoding='utf-8') as f:
                        _AGENT_METADATA[agent_name] = json.load(f)
                except Exception as e:
                    logger.warning(f"Could not load metadata for {agent_name}: {e}")
            
            logger.debug(f"Auto-registered agent: {agent_name}")
            
        except ImportError as e:
            logger.warning(f"Could not load agent module {agent_name}.workspace: {e}")


def get_extractor_class(agent: str) -> Optional[Type[AgentExtractor]]:
    """Get extractor class for an agent."""
    _ensure_agents_loaded()
    return _AGENT_REGISTRY.get(agent)


def list_registered_agents() -> List[str]:
    """List all registered agent names."""
    _ensure_agents_loaded()
    return list(_AGENT_REGISTRY.keys())


def get_agent_metadata(agent: str) -> Optional[AgentMetadata]:
    """Get metadata for an agent."""
    _ensure_agents_loaded()
    return _AGENT_METADATA.get(agent)


def get_all_agent_metadata() -> Dict[str, AgentMetadata]:
    """Get metadata for all registered agents."""
    _ensure_agents_loaded()
    return dict(_AGENT_METADATA)


def get_agent_icon_path(agent: str) -> Optional[Path]:
    """Get the path to an agent's icon file if it exists."""
    _ensure_agents_loaded()
    
    agents_dir = Path(__file__).parent
    agent_dir = agents_dir / agent
    
    if not agent_dir.is_dir():
        return None
    
    metadata = _AGENT_METADATA.get(agent)
    if metadata and 'icon' in metadata:
        icon_path = agent_dir / metadata['icon']
        if icon_path.exists():
            return icon_path
    
    # Fallback: check for common icon filenames
    for icon_name in ['icon.svg', 'icon.png', 'logo.svg', 'logo.png']:
        icon_path = agent_dir / icon_name
        if icon_path.exists():
            return icon_path
    
    return None


# Lazy loading flag
_agents_loaded = False


def _ensure_agents_loaded() -> None:
    """Ensure agent modules have been imported (lazy loading)."""
    global _agents_loaded
    if not _agents_loaded:
        _discover_agents()
        _agents_loaded = True


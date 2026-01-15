# AI Coding Agent Chat Extractor

> **⚠️ 100% AI-Generated Project**: The entire codebase (except small parts of the configs/docs) was built entirely by AI coding agents. Zero human-written code. This is an experiment in end-to-end AI-driven development, so, expect alpha-quality with rough edges. Feedback is most welcome!

## 🔬 What is This?
This is a personal tool for extracting and navigating conversation data from various coding agents in one place. Supports GitHub Copilot, Cursor and Claude Code.

## 🚀 Quick Start

### Prerequisites

- Python 3.11 or higher
- [uv](https://github.com/astral-sh/uv)
- One or more of the supported AI coding agents installed (GitHub Copilot / Cursor / Claude Code)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/hosamsh/_chat-extractor-trunk0701.git chat-extractor
   cd chat-extractor
   ```

2. **Install dependencies**
   ```bash
   # CPU-only (default, works on all machines)
   uv sync
   
   # OR for GPU acceleration (NVIDIA GPUs only, ~10-100x faster embeddings)
   # If you have requirements-gpu.txt available
   uv pip install -r requirements-gpu.txt
   ```
   
   > **GPU Support**: The GPU version requires an NVIDIA GPU with CUDA support. Semantic search embeddings will automatically use GPU if available, significantly speeding up the `--reindex` command.

### Basic Usage

#### 1) Quick Start Using the Web Interface

Launch the web dashboard to explore your conversations visually:

```bash
uv run python run_web.py
# Opens at http://127.0.0.1:8000
```

The web interface lets you browse workspaces, extract chat sessions, view analytics, and explore conversations interactively without needing to use the CLI.

#### 2) Using the CLI

```bash
# Get help on all available commands
uv run python run_cli.py --help

# List all available workspaces
uv run python run_cli.py --list

# Extract specific workspace (requires workspace ID and output directory)
uv run python run_cli.py --extract <workspace-id> --run-dir data/<dir-name>

# Extract all workspaces for a specific agent
uv run python run_cli.py --extract --all --agent <copilot|cursor|claude_code> --run-dir data/<dir-name>

# Search through extracted conversations
uv run python run_cli.py --search "your search query" --run-dir data/<dir-name>
```

## 📝 Configuration

### Main Config (`config/config.yaml`)

- **Agent Settings**: Workspace paths for each agent
- **Extraction**: Text shrinking, output directories
- **Web**: Server port and run directory

You can also edit the configs through the web interface.

### Adding a New Agent

1. Create `src/extract_plugins/your_agent/`
2. Implement `agent.py` with `AgentExtractor` interface
3. Add `metadata.json` for display info
4. Add config section to `config/config.yaml`
5. Test extraction and enrichment

See [Agent Extractor Interface Docs](src/extract_plugins/readme.md)

## 🧪 Running Tests

This project uses **uv** for package management (not traditional venv). Always run commands via `uv run`:

```bash
# Run all tests
uv run pytest tests/

# Run only unit tests
uv run pytest tests/unit/

# Run only integration tests
uv run pytest tests/integration/

# Run specific test file
uv run pytest tests/unit/test_cli_search.py -v
```

> **Note**: Do not use `python -m pytest` or activate a `.venv` manually - use `uv run pytest` instead.

## 📋 Issues & Limitations
- Primarily tested on Windows paths
- Duplicate workspace entries may appear when Claude Code + other agents reference the same project
- Claude Code session names are GUIDs
- Left-side navigation may flicker briefly on page loads


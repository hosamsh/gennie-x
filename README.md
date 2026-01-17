# Gennie-X: AI Coding Agent Chat Extractor

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![uv](https://img.shields.io/badge/uv-package%20manager-blueviolet)](https://github.com/astral-sh/uv) 
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **⚠️ 100% AI-Generated Project**: This is an experiment in end-to-end AI-driven development, so expect alpha-quality with rough edges. The entire codebase was built by AI coding agents. Zero human-written code. Feedback most welcome!


## 🔬 What is This?

**Gennie‑X** extracts and indexes conversations from multiple AI coding assistants into a single, searchable local database. Use it to analyze agent interactions, run semantic search, and generate usage reports. Currently supported sources: GitHub Copilot, Cursor, and Claude Code.

### ✨ Features

- **Multi-Agent Support**: Extract conversations from GitHub Copilot, Cursor, and Claude Code
- **Web Dashboard**: Local web UI to browse workspaces, view analytics, and explore conversations
- **CLI Interface**: Equivalent command-line tools for automation and scripting
- **Semantic Search**: Search through your conversation history with AI-powered semantic search (Sentence Transformers embeddings + SQLite FTS5 keyword search)
- **Code Metrics Extraction**: Extracts code metrics (via `lizard` and related tooling) to summarize complexity and size across extracted code artifacts
- **Plugins**: extensible to support new AI coding agents


## 🚀 Quick Start

### Prerequisites

- Python 3.11 or higher
- [uv](https://github.com/astral-sh/uv) - Fast Python package manager
- One or more supported AI coding agents installed (GitHub Copilot / Cursor / Claude Code)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/hosamsh/gennie-x.git
   cd gennie-x
   ```

2. **Install dependencies**
   ```bash
   # CPU-only (default, works on all machines)
   uv sync
   ```

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

# Refresh an existing workspace (incremental sync; only new/changed turns)
uv run python run_cli.py --extract <workspace-id> --run-dir data/<dir-name>

# Refresh an existing workspace (full re-ingest; reprocess everything)
uv run python run_cli.py --extract <workspace-id> --run-dir data/<dir-name> --force-refresh

# Full reset (erase DB, then re-ingest)
rm -rf data/<dir-name>
uv run python run_cli.py --extract <workspace-id> --run-dir data/<dir-name>

# Search through extracted conversations
uv run python run_cli.py --search "your search query" --run-dir data/<dir-name>
```

## 📝 Configuration

### Main Config

- Location: config/config.yaml (loaded by default)
- Example: config/config.example.yaml (copy/compare for defaults)

**Sections:**
- **extract**: text shrinking + agent storage/output paths
- **web**: web UI run directory and port
- **search**: search mode, thresholds, embedding model + batch size, auto-embed
- **token_estimation**: token estimation heuristics
- **loc_counting**: rules for couting lines of code
- **logging**: log level

You can also edit the config via the web UI.


## ⚡ Optional GPU Acceleration

If you want faster embedding generation, you can enable GPU support:

1. Install a CUDA‑enabled PyTorch build (see requirements-gpu.txt for guidance).
2. Then install the rest of the dependencies.

To choose the right CUDA wheel: (1) check your NVIDIA driver/CUDA capability (e.g., from `nvidia-smi`), (2) pick the matching CUDA version on the PyTorch install page (e.g., cu118 or cu121), and (3) use that index URL in requirements-gpu.txt.

### Adding a New Agent

1. Create `src/extract_plugins/your_agent/`
2. Implement `agent.py` with `AgentExtractor` interface
3. Add `metadata.json` for display info
4. Add config section to `config/config.yaml`
5. Test extraction and enrichment

See [Agent Extractor Interface Docs](src/extract_plugins/readme.md)


## 🧪 Running Tests
see [Tests](tests/readme.md)


> **Note**: Do not use `python -m pytest` or activate a `.venv` manually - use `uv run pytest` instead.

## 📋 Issues & Limitations

- Primarily tested on Windows
- Duplicate workspace entries when edited by Claude Code + other vs-code based agents
- Claude Code session names are GUIDs
- Left-side navigation resize briefly on page loads


## 🤝 Contributing

TBD.

## 📄 License

You’re free to use, copy, modify, and redistribute this project.

---

## ⚠️ Note about Extraction Reliability

Gennie‑X reads agent‑specific local storage formats to reconstruct conversations. Those formats and field locations can change between agent releases, and there is no universal standard—so extraction is best‑effort and may require occasional updates to extractors. If you notice missing or misaligned data, please open an issue; contributions to improve extractor robustness are welcome.

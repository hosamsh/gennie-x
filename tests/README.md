# Tests

This directory contains all tests for the gennie-x project.

## Directory Structure

```
tests/
├── unit/                    # Fast, isolated unit tests
│   ├── conftest.py          # Shared fixtures (synthetic workspaces, CLI runner)
│   ├── test_cli_extract.py  # Extraction CLI tests
│   ├── test_cli_list.py     # List workspaces CLI tests
│   ├── test_cli_search.py   # Search/reindex CLI tests
│   ├── test_config_isolation.py  # Config system tests
│   ├── test_contracts.py    # Contract/boundary tests
│   ├── test_data_artifacts.py    # Database schema & data tests
│   └── test_web_api.py      # Web API endpoint tests
│
├── integration/             # Slower tests using real data
│   ├── conftest.py          # Integration test fixtures
│   ├── test_contracts_integration.py  # Integration contract tests
│   ├── test_extract.py      # Real workspace extraction
│   ├── test_list.py         # Real workspace listing
│   ├── test_refresh.py      # Force refresh tests
│   └── test_web_api.py      # Web API integration tests
│
└── README.md                # This file
```

## Running Tests

This project uses **uv** for dependency management and running commands.

### Prerequisites

```bash
# Sync dependencies (includes pytest from pyproject.toml)
uv sync
```

### Run All Unit Tests

```bash
# From project root
uv run pytest tests/unit/ -v
```

### Run All Integration Tests

```bash
uv run pytest tests/integration/ -v
```

### Run All Tests

```bash
uv run pytest tests/ -v
```

## Common Options

| Option | Description |
|--------|-------------|
| `-v` | Verbose output (show test names) |
| `-vv` | More verbose (show assertion details) |
| `-s` | Show print statements |
| `--tb=short` | Shorter tracebacks |
| `--tb=no` | No tracebacks (just pass/fail) |
| `-x` | Stop on first failure |
| `-k "pattern"` | Run tests matching pattern |

## Examples

### Run a specific test file

```bash
uv run pytest tests/unit/test_cli_extract.py -v
```

### Run a specific test class

```bash
uv run pytest tests/unit/test_contracts.py::TestCombinedTurnsView -v
```

### Run a specific test

```bash
uv run pytest tests/unit/test_cli_extract.py::test_extract_single_workspace_creates_database -v
```

### Run tests matching a pattern

```bash
# Run all tests with "search" in the name
uv run pytest tests/ -k "search" -v

# Run all tests with "extract" but not "refresh"
uv run pytest tests/ -k "extract and not refresh" -v
```

### Run tests with coverage

```bash
uv run pytest tests/unit/ --cov=src --cov-report=html
# Open htmlcov/index.html in browser
```

### Run tests in parallel (requires pytest-xdist)

```bash
uv add --dev pytest-xdist
uv run pytest tests/unit/ -n auto
```

## Test Categories

### Unit Tests (`tests/unit/`)

Fast tests that use **synthetic fixtures** (fake workspace data created in memory). These tests:
- Don't require real Copilot/Cursor workspace data
- Run in ~30-50 seconds total
- Are isolated and deterministic

### Integration Tests (`tests/integration/`)

Slower tests that use **real workspace data** from your machine. These tests:
- Require actual Copilot/Cursor workspaces to exist
- May be skipped if no workspaces are available
- Test end-to-end behavior

### Markers

Some tests are marked for filtering:

```bash
# Run only integration-marked tests
uv run pytest tests/ -m integration -v

# Skip integration tests
uv run pytest tests/ -m "not integration" -v
```

## Test Naming Conventions

Tests follow a naming pattern that maps to the test plan:

| Prefix | Category |
|--------|----------|
| `T0-*` | Tier 0: Test harness/fixtures |
| `T1-*` | Tier 1: Feature tests (CLI, API) |
| `T2-*` | Tier 2: Contract/boundary tests |
| `T3-*` | Tier 3: Data artifact tests |

## Fixtures

### Unit Test Fixtures (`tests/unit/conftest.py`)

| Fixture | Description |
|---------|-------------|
| `run_dir` | Temporary directory for test database |
| `copilot_workspace` | Synthetic Copilot workspace with chat sessions |
| `copilot_workspace_with_edits` | Workspace with code edits (for metrics tests) |
| `copilot_workspace_with_long_text` | Workspace with long text (for shrinking tests) |
| `cursor_workspace` | Synthetic Cursor workspace |
| `make_test_config` | Factory to create test config files |
| `cli_runner` | Function to run CLI commands |
| `web_client` | FastAPI TestClient for API tests |

### Integration Test Fixtures (`tests/integration/conftest.py`)

| Fixture | Description |
|---------|-------------|
| `run_dir` | Temporary directory for test runs |
| `copilot_workspace` | Same as unit test fixture |

## Troubleshooting

### Tests can't find modules

Make sure you're running from the project root:

```bash
cd c:\code\projects\gennie-x
uv run pytest tests/unit/ -v
```

### Integration tests are skipped

Integration tests require real workspace data. If skipped, it means no workspaces were found in your configured storage paths.

### Web API tests fail

Web API tests require FastAPI and its dependencies. They should already be installed via `uv sync`, but if needed:

```bash
uv add fastapi httpx
```

### Tests are slow

Unit tests should complete in under a minute. If slow:
- Use `-x` to stop on first failure
- Run specific test files instead of all tests
- Check if integration tests are accidentally running

## Writing New Tests

1. **Unit tests** go in `tests/unit/`
2. Use existing fixtures from `conftest.py`
3. Follow the `test_*` naming convention
4. Add docstrings with test IDs (e.g., `T1-4: ...`)

Example:

```python
def test_my_new_feature(cli_runner, make_test_config, copilot_workspace, run_dir):
    """T1-XX: Description of what this test verifies."""
    config_path = make_test_config(copilot_storage=copilot_workspace["storage_root"])
    
    result = cli_runner("--my-flag", "--run-dir", str(run_dir), config_path=config_path)
    
    assert result.returncode == 0
    # ... more assertions
```

"""Tests for search and reindex CLI functionality (Feature 3).

Tests:
- T1-8: Reindex creates FTS index
- T1-9: Keyword search returns results
- T1-10: Search JSON output
"""
import json
import sqlite3

from conftest import get_test_db_path


def test_reindex_creates_fts_index(cli_runner, make_test_config, copilot_workspace, run_dir):
    """T1-8: Verify --reindex creates keyword search index."""
    config_path = make_test_config(copilot_storage=copilot_workspace["storage_root"])
    
    # First extract workspace
    workspace_id = copilot_workspace["workspace_id"]
    result = cli_runner("--extract", workspace_id, "--run-dir", str(run_dir), config_path=config_path)
    assert result.returncode == 0
    
    # Run reindex
    result = cli_runner("--reindex", "--run-dir", str(run_dir), config_path=config_path)
    assert result.returncode == 0, f"Reindex failed: {result.stderr}"
    
    # Verify FTS table exists and has entries
    db_path = get_test_db_path(run_dir)
    conn = sqlite3.connect(str(db_path))
    
    # Check table exists
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='turns_fts'"
    )
    fts_table = cursor.fetchone()
    assert fts_table is not None, "FTS table not created"
    
    # Check FTS has entries
    cursor = conn.execute("SELECT COUNT(*) FROM turns_fts")
    fts_count = cursor.fetchone()[0]
    conn.close()
    
    assert fts_count > 0, "FTS table is empty"


def test_keyword_search_returns_results(cli_runner, make_test_config, copilot_workspace, run_dir):
    """T1-9: Verify --search with keyword mode returns matches."""
    config_path = make_test_config(copilot_storage=copilot_workspace["storage_root"])
    
    # Extract and reindex
    workspace_id = copilot_workspace["workspace_id"]
    cli_runner("--extract", workspace_id, "--run-dir", str(run_dir), config_path=config_path)
    cli_runner("--reindex", "--run-dir", str(run_dir), config_path=config_path)
    
    # Search for known text from fixture with JSON output for reliable parsing
    result = cli_runner("--search", "pytest testing", "--json", "--run-dir", str(run_dir), config_path=config_path)
    
    assert result.returncode == 0, f"Search failed: {result.stderr}"
    
    # Parse JSON and verify actual results exist
    data = _extract_json_from_output(result.stdout)
    assert "results" in data, "Response missing 'results' key"
    assert len(data["results"]) > 0, "Expected at least one search result for 'pytest testing'"
    
    # Verify at least one result contains the search term
    # Search results use 'original_text' as the main text field
    result_texts = [
        (r.get("original_text", "") + r.get("text", "") + r.get("snippet", "")).lower()
        for r in data["results"]
    ]
    assert any("pytest" in text for text in result_texts), (
        f"Search results should contain the searched term 'pytest'. "
        f"Got fields: {list(data['results'][0].keys()) if data['results'] else 'no results'}"
    )


def _extract_json_from_output(output: str) -> dict:
    """Extract JSON object from CLI output that may contain ANSI codes or log prefixes."""
    import re
    # Strip ANSI escape sequences
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    cleaned = ansi_escape.sub('', output)
    # Find JSON object (starts with { and ends with })
    match = re.search(r'\{[\s\S]*\}', cleaned)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON object found in output: {output[:200]}")


def test_search_json_output(cli_runner, make_test_config, copilot_workspace, run_dir):
    """T1-10: Verify --search --json produces valid JSON results."""
    config_path = make_test_config(copilot_storage=copilot_workspace["storage_root"])
    
    # Extract and reindex
    workspace_id = copilot_workspace["workspace_id"]
    cli_runner("--extract", workspace_id, "--run-dir", str(run_dir), config_path=config_path)
    cli_runner("--reindex", "--run-dir", str(run_dir), config_path=config_path)
    
    # Search with JSON output
    result = cli_runner("--search", "test", "--json", "--run-dir", str(run_dir), config_path=config_path)
    
    assert result.returncode == 0, f"Search failed: {result.stderr}"
    
    # Validate JSON structure (extract from output that may have ANSI prefixes)
    data = _extract_json_from_output(result.stdout)
    assert "results" in data
    assert isinstance(data["results"], list)

"""Test: List workspaces and verify workspace discovery works.

Note: This test dynamically discovers available workspaces rather than
relying on hardcoded IDs, making it portable across different environments.
"""

import pytest
import re
from tests.integration.conftest import run_cli_command


def strip_ansi_codes(text: str) -> str:
    """Remove ANSI escape codes from text."""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)


def test_list_workspaces():
    """Test: py run_cli.py --list
    
    Success criteria:
    - Command completes successfully
    - Lists at least 1 workspace
    """
    result = run_cli_command(["--list"])
    
    # Command should succeed
    assert result.returncode == 0, f"Command failed: {result.stderr}"
    
    # Strip ANSI codes from output
    output = strip_ansi_codes(result.stdout + result.stderr)
    
    # Verify output contains workspace information (table header or JSON)
    assert "ID" in output or "workspace_id" in output or "Workspace" in output, \
        f"Output doesn't appear to contain workspace information: {output[:200]}"
    
    # Count workspaces by looking for 32-character hex IDs (MD5 hashes)
    workspace_ids = re.findall(r'\b[a-f0-9]{32}\b', output)
    unique_ids = set(workspace_ids)
    
    assert len(unique_ids) >= 1, f"Expected at least 1 workspace, found none in output"
    print(f"✓ Found {len(unique_ids)} unique workspaces: {list(unique_ids)[:5]}")
    
    # Note: We no longer check for specific workspace IDs.
    # Integration tests should not depend on environment-specific data.
    # The assertion above verifies workspaces are discovered correctly.
    
    print(f"✓ List workspaces test passed")

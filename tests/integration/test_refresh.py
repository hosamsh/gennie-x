"""Test: Refresh workspace extraction and verify turn ID changes."""

import pytest
from tests.integration.conftest import (
    run_cli_command,
    get_project_root,
    query_db,
)


def get_workspace_with_turns(run_dir):
    """Find a workspace ID that has turns in the database.
    
    Returns the workspace_id with the most turns, or None if no workspaces have turns.
    """
    results = query_db(
        run_dir,
        """SELECT workspace_id, COUNT(*) as turn_count 
           FROM turns 
           GROUP BY workspace_id 
           HAVING turn_count > 0
           ORDER BY turn_count DESC
           LIMIT 1"""
    )
    if results:
        return results[0][0]  # Return the workspace_id
    return None


def test_refresh_workspace_force():
    """Test: py run_cli.py --extract <workspace> --run-dir data/int-test --force
    
    This test runs AFTER test_extract_two_workspaces.
    
    Before running the test:
    - Dynamically find a workspace that has turns in the database
    - Get the id range for turns from the existing database in the run folder
    - Note these ids as original_turn_ids
    
    Success criteria after running:
    - Total number of turns for this workspace should be the same
    - The ids themselves should be bigger in value because:
      * The operation deletes existing records
      * Recreates new ones
      * The id auto-increment increases
    """
    project_root = get_project_root()
    run_dir = project_root / "data" / "int-test"
    
    # Dynamically find a workspace with turns
    ws_id = get_workspace_with_turns(run_dir)
    
    if ws_id is None:
        pytest.skip("No workspace with turns found in database - run test_extract_two_workspaces first")
    
    print(f"Selected workspace for refresh test: {ws_id}")
    
    # Get the original turn IDs for the selected workspace
    original_turns = query_db(
        run_dir,
        "SELECT id FROM turns WHERE workspace_id = ? ORDER BY id",
        (ws_id,)
    )
    
    assert len(original_turns) > 0, f"No turns found for workspace {ws_id} in original extraction"
    original_ids = [row[0] for row in original_turns]
    original_count = len(original_ids)
    original_min_id = min(original_ids)
    original_max_id = max(original_ids)
    
    print(f"Original extraction for workspace {ws_id}:")
    print(f"  Count: {original_count}")
    print(f"  ID range: {original_min_id} - {original_max_id}")
    
    # Run extraction with --force for selected workspace only
    result = run_cli_command([
        "--extract",
        ws_id,
        "--run-dir",
        str(run_dir),
        "--force"
    ])
    
    assert result.returncode == 0, f"Force refresh command failed: {result.stderr}"
    print("✓ Force refresh extraction completed successfully")
    
    # Get the new turn IDs for the selected workspace
    refreshed_turns = query_db(
        run_dir,
        "SELECT id FROM turns WHERE workspace_id = ? ORDER BY id",
        (ws_id,)
    )
    
    refreshed_ids = [row[0] for row in refreshed_turns]
    refreshed_count = len(refreshed_ids)
    refreshed_min_id = min(refreshed_ids)
    refreshed_max_id = max(refreshed_ids)
    
    print(f"\nAfter force refresh for workspace {ws_id}:")
    print(f"  Count: {refreshed_count}")
    print(f"  ID range: {refreshed_min_id} - {refreshed_max_id}")
    
    # Verify count is the same
    assert refreshed_count == original_count, (
        f"Turn count changed after refresh: "
        f"original={original_count}, refreshed={refreshed_count}"
    )
    print(f"✓ Turn count remains the same: {refreshed_count}")
    
    # Verify new IDs are all higher (because old ones were deleted and new ones created)
    # Since deletion happens, the new IDs should start from where the old ones ended or higher
    assert all(new_id > original_max_id for new_id in refreshed_ids), (
        f"Expected all new IDs to be > {original_max_id}, "
        f"but got min={refreshed_min_id}, max={refreshed_max_id}"
    )
    print(f"✓ All new turn IDs are higher than original max ({original_max_id})")
    print(f"  New ID range: {refreshed_min_id} - {refreshed_max_id}")
    
    # Verify original IDs are no longer in database
    all_current_turns = query_db(
        run_dir,
        "SELECT id FROM turns WHERE workspace_id = ? ORDER BY id",
        (ws_id,)
    )
    current_ids = set(row[0] for row in all_current_turns)
    original_ids_set = set(original_ids)
    
    overlap = original_ids_set & current_ids
    assert len(overlap) == 0, (
        f"Original turn IDs should be deleted but found overlap: {overlap}"
    )
    print("✓ Original turn IDs are no longer in database (replaced successfully)")
    
    print("\n✅ All refresh test criteria passed!")

"""Configuration management service for the web UI."""

from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from src.shared.logging.logger import get_logger

logger = get_logger(__name__)


class ConfigService:
    """Service for managing YAML configuration files."""

    def __init__(self, config_path: str | Path = "config/config.yaml"):
        """Initialize the config service.

        Args:
            config_path: Path to the main configuration file
        """
        self.config_path = Path(config_path)
        self.backup_dir = self.config_path.parent / "backups"
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    def read_config(self) -> dict[str, Any]:
        """Read the current configuration file.

        Returns:
            Dictionary containing the configuration

        Raises:
            FileNotFoundError: If config file doesn't exist
            yaml.YAMLError: If config file is invalid YAML
        """
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)

        return config or {}

    def read_config_raw(self) -> str:
        """Read the raw YAML configuration as a string.

        Returns:
            Raw YAML content as string

        Raises:
            FileNotFoundError: If config file doesn't exist
        """
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path, "r", encoding="utf-8") as f:
            return f.read()

    def write_config(self, config_yaml: str, create_backup: bool = True) -> dict[str, Any]:
        """Write new configuration to the file.

        Args:
            config_yaml: YAML configuration as string
            create_backup: Whether to create a backup before writing

        Returns:
            Dictionary containing the parsed configuration

        Raises:
            yaml.YAMLError: If the YAML is invalid
            IOError: If file operations fail
        """
        # Validate YAML first
        try:
            parsed_config = yaml.safe_load(config_yaml)
        except yaml.YAMLError as e:
            raise ValueError(f"Invalid YAML: {e}")

        # Create backup if requested
        if create_backup and self.config_path.exists():
            self._create_backup()

        # Write new configuration
        with open(self.config_path, "w", encoding="utf-8") as f:
            f.write(config_yaml)

        logger.info(f"Configuration updated: {self.config_path}")
        return parsed_config or {}

    def validate_yaml(self, config_yaml: str) -> tuple[bool, str | None, dict[str, Any] | None]:
        """Validate YAML configuration without writing it.

        Args:
            config_yaml: YAML configuration as string

        Returns:
            Tuple of (is_valid, error_message, parsed_config)
        """
        try:
            parsed_config = yaml.safe_load(config_yaml)
            return True, None, parsed_config
        except yaml.YAMLError as e:
            return False, str(e), None

    def _create_backup(self) -> Path:
        """Create a timestamped backup of the current config.

        Returns:
            Path to the backup file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = self.backup_dir / f"config_{timestamp}.yaml"

        shutil.copy2(self.config_path, backup_path)
        logger.info(f"Created config backup: {backup_path}")

        return backup_path

    def list_backups(self) -> list[dict[str, Any]]:
        """List all available configuration backups.

        Returns:
            List of backup information dictionaries
        """
        backups = []

        if not self.backup_dir.exists():
            return backups

        for backup_file in sorted(self.backup_dir.glob("config_*.yaml"), reverse=True):
            stat = backup_file.stat()
            backups.append({
                "filename": backup_file.name,
                "path": str(backup_file),
                "size": stat.st_size,
                "created": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })

        return backups

    def restore_backup(self, backup_filename: str) -> dict[str, Any]:
        """Restore a configuration from a backup.

        Args:
            backup_filename: Name of the backup file to restore

        Returns:
            Dictionary containing the restored configuration

        Raises:
            FileNotFoundError: If backup file doesn't exist
        """
        backup_path = self.backup_dir / backup_filename

        if not backup_path.exists():
            raise FileNotFoundError(f"Backup file not found: {backup_filename}")

        # Create a backup of current config before restoring
        if self.config_path.exists():
            self._create_backup()

        # Restore the backup
        shutil.copy2(backup_path, self.config_path)
        logger.info(f"Restored config from backup: {backup_filename}")

        return self.read_config()

    def get_config_info(self) -> dict[str, Any]:
        """Get information about the configuration file.

        Returns:
            Dictionary with config file metadata
        """
        if not self.config_path.exists():
            return {
                "exists": False,
                "path": str(self.config_path),
            }

        stat = self.config_path.stat()
        return {
            "exists": True,
            "path": str(self.config_path),
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "backup_count": len(list(self.backup_dir.glob("config_*.yaml"))) if self.backup_dir.exists() else 0,
        }

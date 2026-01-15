"""Configuration management API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.shared.logging.logger import get_logger
from src.web.services.config_service import ConfigService

logger = get_logger(__name__)
router = APIRouter(prefix="/api/config", tags=["config"])


# Initialize service
config_service = ConfigService()


# Request/Response models
class ConfigUpdateRequest(BaseModel):
    """Request model for updating configuration."""

    yaml_content: str
    create_backup: bool = True


class ConfigValidateRequest(BaseModel):
    """Request model for validating configuration."""

    yaml_content: str


class BackupRestoreRequest(BaseModel):
    """Request model for restoring a backup."""

    backup_filename: str


@router.get("/")
async def get_config() -> dict[str, Any]:
    """Get the current configuration as parsed YAML.

    Returns:
        Current configuration dictionary

    Raises:
        HTTPException: If config file cannot be read
    """
    try:
        config = config_service.read_config()
        return {"success": True, "config": config}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error reading config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read config: {e}")


@router.get("/raw")
async def get_config_raw() -> dict[str, Any]:
    """Get the current configuration as raw YAML text.

    Returns:
        Raw YAML content

    Raises:
        HTTPException: If config file cannot be read
    """
    try:
        yaml_content = config_service.read_config_raw()
        return {"success": True, "yaml": yaml_content}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error reading raw config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read config: {e}")


@router.get("/info")
async def get_config_info() -> dict[str, Any]:
    """Get metadata about the configuration file.

    Returns:
        Configuration file metadata
    """
    try:
        info = config_service.get_config_info()
        return {"success": True, "info": info}
    except Exception as e:
        logger.error(f"Error getting config info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get config info: {e}")


@router.post("/update")
async def update_config(request: ConfigUpdateRequest) -> dict[str, Any]:
    """Update the configuration file.

    Args:
        request: Configuration update request

    Returns:
        Success message and parsed configuration

    Raises:
        HTTPException: If update fails
    """
    try:
        parsed_config = config_service.write_config(
            request.yaml_content,
            create_backup=request.create_backup
        )
        return {
            "success": True,
            "message": "Configuration updated successfully",
            "config": parsed_config,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update config: {e}")


@router.post("/validate")
async def validate_config(request: ConfigValidateRequest) -> dict[str, Any]:
    """Validate YAML configuration without saving.

    Args:
        request: Configuration validation request

    Returns:
        Validation result
    """
    try:
        is_valid, error_msg, parsed_config = config_service.validate_yaml(request.yaml_content)

        return {
            "success": True,
            "valid": is_valid,
            "error": error_msg,
            "parsed": parsed_config if is_valid else None,
        }
    except Exception as e:
        logger.error(f"Error validating config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to validate config: {e}")


@router.get("/backups")
async def list_backups() -> dict[str, Any]:
    """List all available configuration backups.

    Returns:
        List of backup files with metadata
    """
    try:
        backups = config_service.list_backups()
        return {"success": True, "backups": backups}
    except Exception as e:
        logger.error(f"Error listing backups: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list backups: {e}")


@router.post("/restore")
async def restore_backup(request: BackupRestoreRequest) -> dict[str, Any]:
    """Restore configuration from a backup.

    Args:
        request: Backup restore request

    Returns:
        Restored configuration

    Raises:
        HTTPException: If restore fails
    """
    try:
        config = config_service.restore_backup(request.backup_filename)
        return {
            "success": True,
            "message": f"Configuration restored from {request.backup_filename}",
            "config": config,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error restoring backup: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to restore backup: {e}")

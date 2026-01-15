"""
Database validation utilities for dynamic SQL construction.

Prevents SQL injection by validating that table and column names are safe identifiers.
"""

import re

# Pattern for safe SQL identifiers: alphanumeric and underscores only, must start with letter or underscore
SAFE_IDENTIFIER_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


def validate_table_name(table: str) -> None:
    """Validate that a table/view name is a safe SQL identifier.
    
    Prevents SQL injection by ensuring the name contains only alphanumeric 
    characters and underscores.
    
    Args:
        table: Table or view name to validate
        
    Raises:
        ValueError: If table name is invalid or potentially unsafe
    """
    if not table:
        raise ValueError("Table name cannot be empty")
    
    if not SAFE_IDENTIFIER_PATTERN.match(table):
        raise ValueError(
            f"Invalid table name: '{table}'. "
            f"Must contain only letters, numbers, and underscores, and start with a letter or underscore."
        )


def validate_column_name(column: str) -> None:
    """Validate that a column name is a safe SQL identifier.
    
    Prevents SQL injection by ensuring the name contains only alphanumeric 
    characters and underscores.
    
    Args:
        column: Column name to validate
        
    Raises:
        ValueError: If column name is invalid or potentially unsafe
    """
    if not column:
        raise ValueError("Column name cannot be empty")
    
    if not SAFE_IDENTIFIER_PATTERN.match(column):
        raise ValueError(
            f"Invalid column name: '{column}'. "
            f"Must contain only letters, numbers, and underscores, and start with a letter or underscore."
        )


def validate_column_names(columns: list[str]) -> None:
    """Validate that all column names in a list are safe SQL identifiers.
    
    Args:
        columns: List of column names to validate
        
    Raises:
        ValueError: If any column name is invalid
    """
    for column in columns:
        validate_column_name(column)


def is_valid_table_name(table: str) -> bool:
    """Check if a table name is a safe SQL identifier without raising an exception.
    
    Args:
        table: Table name to check
        
    Returns:
        True if valid, False otherwise
    """
    try:
        validate_table_name(table)
        return True
    except ValueError:
        return False


def is_valid_column_name(column: str) -> bool:
    """Check if a column name is a safe SQL identifier without raising an exception.
    
    Args:
        column: Column name to check
        
    Returns:
        True if valid, False otherwise
    """
    try:
        validate_column_name(column)
        return True
    except ValueError:
        return False

"""
Language detection utilities.
"""
from collections import Counter
from pathlib import Path
from typing import List, Optional

# Mapping of file extensions to programming languages
_EXTENSION_TO_LANGUAGE = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.cs': 'csharp',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sh': 'shell',
    '.bash': 'shell',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.xml': 'xml',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.r': 'r',
    '.R': 'r',
    '.dart': 'dart',
    '.lua': 'lua',
    '.vim': 'vim',
    '.el': 'elisp',
    '.clj': 'clojure',
    '.ex': 'elixir',
    '.erl': 'erlang',
    '.fs': 'fsharp',
    '.vue': 'vue',
    '.svelte': 'svelte',
}

def detect_language_from_path(file_path: str) -> Optional[str]:
    """Detect programming language from file extension.
    
    Args:
        file_path: Path to a file
        
    Returns:
        Language name (lowercase) or None if not recognized
    """
    if not file_path:
        return None
    
    try:
        ext = Path(file_path).suffix.lower()
        return _EXTENSION_TO_LANGUAGE.get(ext)
    except (ValueError, OSError):
        # Invalid path format or OS-level path error
        return None

def detect_languages_from_files(file_paths: List[str]) -> List[str]:
    """Detect all unique languages from a list of file paths.
    
    Args:
        file_paths: List of file paths
        
    Returns:
        Sorted list of unique language names, most common first
    """
    if not file_paths:
        return []
    
    # Count languages
    language_counts = Counter()
    for path in file_paths:
        lang = detect_language_from_path(path)
        if lang:
            language_counts[lang] += 1
    
    # Return sorted by frequency (most common first), then alphabetically
    return [lang for lang, _ in language_counts.most_common()]


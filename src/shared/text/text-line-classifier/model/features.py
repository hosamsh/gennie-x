"""
Feature extraction for line classification.

"""

import math
from collections import Counter
from typing import Dict, List

import numpy as np

# Pre-compiled lookup tables for character classification
_PUNCTUATION_SET = frozenset('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')


def compute_entropy(s: str) -> float:
    """Compute Shannon entropy of a string."""
    if not s:
        return 0.0
    freq = Counter(s)
    length = len(s)
    return -sum((count / length) * math.log2(count / length) for count in freq.values())


def compute_digit_ratio(s: str) -> float:
    """Ratio of digit characters."""
    if not s:
        return 0.0
    return sum(1 for c in s if c.isdigit()) / len(s)


def compute_punctuation_ratio(s: str) -> float:
    """Ratio of punctuation characters."""
    if not s:
        return 0.0
    return sum(1 for c in s if c in _PUNCTUATION_SET) / len(s)


def compute_leading_whitespace_ratio(s: str) -> float:
    """Ratio of leading whitespace to total length."""
    if not s:
        return 0.0
    stripped = s.lstrip()
    return (len(s) - len(stripped)) / len(s)


def compute_repetition_ratio(s: str) -> float:
    """Ratio of repeated consecutive characters."""
    if len(s) <= 1:
        return 0.0
    repeats = sum(1 for i in range(1, len(s)) if s[i] == s[i-1])
    return repeats / (len(s) - 1)


def compute_avg_word_length(s: str) -> float:
    """Average length of words."""
    words = s.split()
    if not words:
        return 0.0
    return sum(len(w) for w in words) / len(words)


def compute_long_token_ratio(s: str, threshold: int = 8) -> float:
    """Ratio of words longer than threshold."""
    words = s.split()
    if not words:
        return 0.0
    return sum(1 for w in words if len(w) > threshold) / len(words)


def compute_shape_entropy(s: str) -> float:
    """Compute entropy of shape pattern (A=letter, D=digit, S=symbol, _=space)."""
    if not s:
        return 0.0
    shape = ''.join(
        'A' if c.isalpha() else 'D' if c.isdigit() else '_' if c.isspace() else 'S'
        for c in s
    )
    return compute_entropy(shape)


def compute_shape_symbol_ratio(s: str) -> float:
    """Ratio of symbols in the shape pattern."""
    if not s:
        return 0.0
    symbols = sum(1 for c in s if not c.isalnum() and not c.isspace())
    return symbols / len(s)


def extract_features(text: str) -> Dict[str, float]:
    """Extract all features from a text line."""
    return {
        'entropy': compute_entropy(text),
        'digit_ratio': compute_digit_ratio(text),
        'punctuation_ratio': compute_punctuation_ratio(text),
        'leading_whitespace_ratio': compute_leading_whitespace_ratio(text),
        'repetition_ratio': compute_repetition_ratio(text),
        'avg_word_length': compute_avg_word_length(text),
        'long_token_ratio': compute_long_token_ratio(text),
        'shape_entropy': compute_shape_entropy(text),
        'shape_symbol_ratio': compute_shape_symbol_ratio(text),
    }


def features_to_vector(features: Dict[str, float]) -> List[float]:
    """Convert features dict to ordered list for model input."""
    return [
        features['entropy'],
        features['digit_ratio'],
        features['punctuation_ratio'],
        features['leading_whitespace_ratio'],
        features['repetition_ratio'],
        features['avg_word_length'],
        features['long_token_ratio'],
        features['shape_entropy'],
        features['shape_symbol_ratio'],
    ]


FEATURE_NAMES = [
    'entropy', 'digit_ratio', 'punctuation_ratio', 'leading_whitespace_ratio',
    'repetition_ratio', 'avg_word_length', 'long_token_ratio', 
    'shape_entropy', 'shape_symbol_ratio'
]


def _extract_single_line_features_optimized(s: str) -> tuple:
    """
    Extract all features from a single line in ONE PASS through the string.
    Returns tuple of 9 features in order matching FEATURE_NAMES.
    """
    length = len(s)
    if length == 0:
        return (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    
    # Single pass counters
    digit_count = 0
    punct_count = 0
    alpha_count = 0
    space_count = 0
    symbol_count = 0
    repeat_count = 0
    
    # For entropy calculation
    char_freq: Dict[str, int] = {}
    shape_freq: Dict[str, int] = {}
    
    prev_char = None
    
    for c in s:
        # Character frequency for entropy
        char_freq[c] = char_freq.get(c, 0) + 1
        
        # Classify character
        if c.isdigit():
            digit_count += 1
            shape_char = 'D'
        elif c.isalpha():
            alpha_count += 1
            shape_char = 'A'
        elif c.isspace():
            space_count += 1
            shape_char = '_'
        else:
            symbol_count += 1
            shape_char = 'S'
            if c in _PUNCTUATION_SET:
                punct_count += 1
        
        # Shape frequency for shape entropy
        shape_freq[shape_char] = shape_freq.get(shape_char, 0) + 1
        
        # Repetition count
        if prev_char is not None and c == prev_char:
            repeat_count += 1
        prev_char = c
    
    # Compute entropy from frequencies
    entropy = 0.0
    for count in char_freq.values():
        p = count / length
        entropy -= p * math.log2(p)
    
    # Compute shape entropy
    shape_entropy = 0.0
    for count in shape_freq.values():
        p = count / length
        shape_entropy -= p * math.log2(p)
    
    # Leading whitespace
    stripped = s.lstrip()
    leading_ws_ratio = (length - len(stripped)) / length
    
    # Word-based features
    words = s.split()
    if words:
        total_word_len = sum(len(w) for w in words)
        avg_word_len = total_word_len / len(words)
        long_token_count = sum(1 for w in words if len(w) > 8)
        long_token_ratio = long_token_count / len(words)
    else:
        avg_word_len = 0.0
        long_token_ratio = 0.0
    
    # Compute ratios
    digit_ratio = digit_count / length
    punct_ratio = punct_count / length
    repetition_ratio = repeat_count / (length - 1) if length > 1 else 0.0
    shape_symbol_ratio = symbol_count / length
    
    return (
        entropy,
        digit_ratio,
        punct_ratio,
        leading_ws_ratio,
        repetition_ratio,
        avg_word_len,
        long_token_ratio,
        shape_entropy,
        shape_symbol_ratio,
    )


def extract_features_batch(texts: List[str]) -> np.ndarray:
    """
    Extract features for multiple text lines at once.
    
    This is significantly faster than calling extract_features() in a loop
    because it uses optimized single-pass feature extraction.
    
    Args:
        texts: List of text lines
        
    Returns:
        numpy array of shape (len(texts), 9) with features
    """
    n = len(texts)
    if n == 0:
        return np.empty((0, 9), dtype=np.float32)
    
    # Pre-allocate result array
    result = np.empty((n, 9), dtype=np.float32)
    
    # Extract features for each line using optimized single-pass function
    for i, text in enumerate(texts):
        result[i] = _extract_single_line_features_optimized(text)
    
    return result

"""
Feature extraction for line classification.
"""

import math
from collections import Counter
from typing import Dict, List


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
    punctuation = set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')
    return sum(1 for c in s if c in punctuation) / len(s)


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

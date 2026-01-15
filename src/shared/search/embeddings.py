"""Local embedding helpers for semantic search."""

from __future__ import annotations

import hashlib
from typing import Iterable

import numpy as np

_MODEL_CACHE = {}


def _get_device() -> str:
    """Determine the best available device (cuda/mps/cpu)."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"  # Apple Silicon GPU
    except ImportError:
        pass
    return "cpu"


def _get_model(model_name: str):
    if model_name not in _MODEL_CACHE:
        from sentence_transformers import SentenceTransformer
        
        device = _get_device()
        _MODEL_CACHE[model_name] = SentenceTransformer(model_name, device=device)
    return _MODEL_CACHE[model_name]


def embed_texts(texts: Iterable[str], model_name: str) -> np.ndarray:
    """Generate normalized embeddings for a list of texts."""
    model = _get_model(model_name)
    embeddings = model.encode(
        list(texts),
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    return embeddings.astype(np.float32, copy=False)


def text_hash(text: str) -> str:
    """Return a stable hash for text content."""
    normalized = text.strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def serialize_embedding(vector: np.ndarray) -> bytes:
    """Serialize a float32 vector to bytes."""
    return vector.astype(np.float32, copy=False).tobytes()


def deserialize_embedding(blob: bytes) -> np.ndarray:
    """Deserialize a float32 vector from bytes."""
    return np.frombuffer(blob, dtype=np.float32)

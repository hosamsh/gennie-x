"""Dataclass mixin for serialization/deserialization."""
from __future__ import annotations

from dataclasses import asdict, fields
from typing import Any, Dict, Type, TypeVar, cast

T = TypeVar("T", bound="DataclassIO")


class DataclassIO:
    """Mixin for dataclasses to provide standard to_dict/from_dict methods.

    Designed to be usable by dataclasses but tolerant when mixed into non-dataclass
    types (for type-checker friendliness and runtime safety).
    """

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, merging 'extra' fields if present.

        Falls back to __dict__ when the object is not a dataclass instance.
        """
        if hasattr(self, "__dataclass_fields__"):
            data = asdict(cast(Any, self))
        else:
            data = dict(getattr(self, "__dict__", {}))

        if hasattr(self, "extra") and isinstance(self.extra, dict):
            extra = data.pop("extra", {}) or {}
            data.update(extra)
        return data

    @classmethod
    def from_dict(cls: Type[T], data: Dict[str, Any] | None = None, *args: Any, **kwargs: Any) -> T:
        """Create from dictionary, handling unknown fields.

        Accepts additional positional/keyword args to allow subclasses to define
        extended classmethod signatures without causing type-checker incompatibility.
        """
        # Normalize incoming data
        if data is None:
            # If subclass passed data via kwargs, try to find a dict-like arg
            data = kwargs.pop("data", kwargs.pop("payload", {})) or {}

        if not isinstance(data, dict):
            raise ValueError(f"Expected dict for {cls.__name__}, got {type(data)}")

        # Try to obtain dataclass fields; if not a dataclass, fall back to annotations
        try:
            known_fields = {f.name for f in fields(cast(Any, cls))}
        except Exception:
            known_fields = set(getattr(cls, "__annotations__", {}).keys())

        has_extra = "extra" in known_fields

        init_args: Dict[str, Any] = {}
        extra_args: Dict[str, Any] = {}

        for k, v in data.items():
            if k in known_fields:
                init_args[k] = v
            elif has_extra:
                extra_args[k] = v

        if has_extra:
            if "extra" in init_args and isinstance(init_args["extra"], dict):
                extra_args.update(init_args["extra"])
            init_args["extra"] = extra_args

        return cls(**init_args)


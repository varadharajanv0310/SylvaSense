"""
Content cache with staleness, and the offline replay mode the later batches
depend on.

Replay is not a convenience. If the estimator batches can only be tested with
a live network, they will be tested rarely and inconsistently, and regressions
will be invisible. Everything after data access must pass with SYLVA_OFFLINE=1.
"""

from __future__ import annotations

import hashlib
import json
import pickle
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .config import settings


class OfflineMiss(RuntimeError):
    """Asked for something not in the cache while offline."""


@dataclass
class CacheEntry:
    value: Any
    fetched_at: datetime
    meta: dict[str, Any]

    def age_days(self, now: datetime | None = None) -> float:
        now = now or datetime.now(timezone.utc)
        ref = self.fetched_at
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        return (now - ref).total_seconds() / 86400.0

    @property
    def stale(self) -> bool:
        return self.age_days() > settings.stale_after_days


def _key(namespace: str, parts: dict[str, Any]) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str).encode()
    return f"{namespace}-{hashlib.sha1(raw).hexdigest()[:20]}"


class Cache:
    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(root or settings.cache_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key: str) -> Path:
        return self.root / f"{key}.pkl"

    def get(self, key: str) -> CacheEntry | None:
        p = self.path(key)
        if not p.exists():
            return None
        try:
            with p.open("rb") as fh:
                return pickle.load(fh)
        except Exception:
            # a corrupt entry is a cache miss, never an outage
            p.unlink(missing_ok=True)
            return None

    def put(self, key: str, value: Any, meta: dict[str, Any] | None = None) -> CacheEntry:
        entry = CacheEntry(
            value=value, fetched_at=datetime.now(timezone.utc), meta=meta or {}
        )
        with self.path(key).open("wb") as fh:
            pickle.dump(entry, fh)
        return entry

    def forget(self, namespace: str, parts: dict[str, Any]) -> bool:
        """Drop one entry so the next fetch recomputes it. True if one existed."""
        p = self.path(_key(namespace, parts))
        existed = p.exists()
        p.unlink(missing_ok=True)
        return existed

    def fetch(
        self,
        namespace: str,
        parts: dict[str, Any],
        producer: Callable[[], Any],
        *,
        meta: dict[str, Any] | None = None,
    ) -> CacheEntry:
        """
        Return a cached entry or produce one. In offline mode a miss raises
        rather than silently returning nothing, so replay gaps are loud.
        """
        key = _key(namespace, parts)
        hit = self.get(key)
        if hit is not None:
            return hit
        if settings.offline:
            raise OfflineMiss(f"{namespace} not cached for {parts!r}")
        return self.put(key, producer(), meta=meta)


cache = Cache()

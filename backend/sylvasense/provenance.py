"""
Core types. Everything the backend emits is an Observation, and an Observation
always knows where it came from.

The rule this module exists to enforce: a number without provenance is not a
measurement, it is a decoration. Nothing downstream is allowed to hand back a
bare float.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any


class Availability(str, Enum):
    """Why a source did or did not contribute to an answer."""

    OK = "ok"
    #: ran, but on thinner input than it wants (few scenes, heavy cloud, stale cache)
    DEGRADED = "degraded"
    #: could not run at all — missing credentials, outside coverage, upstream down
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class SourceStatus:
    source_id: str
    availability: Availability
    reason: str = ""
    #: machine-readable so callers can branch (e.g. "no_credentials", "out_of_coverage")
    code: str = ""

    @property
    def usable(self) -> bool:
        return self.availability is not Availability.UNAVAILABLE

    def as_dict(self) -> dict[str, Any]:
        return {
            "source": self.source_id,
            "availability": self.availability.value,
            "code": self.code,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class Uncertainty:
    """
    An interval with a stated meaning. `method` matters as much as the numbers:
    a propagated allometric error and a conformal interval are not the same
    claim and must never be averaged together silently.
    """

    low: float
    high: float
    #: e.g. 0.9 for a 90% interval
    level: float = 0.9
    #: "conformal" | "propagated" | "ensemble_spread" | "reported_by_source"
    method: str = "reported_by_source"

    @property
    def width(self) -> float:
        return self.high - self.low

    def relative_to(self, value: float) -> float | None:
        """Half-width as a fraction of the estimate, for triage thresholds."""
        if value is None or value == 0 or math.isnan(value):
            return None
        return (self.width / 2) / abs(value)

    def as_dict(self) -> dict[str, Any]:
        return {
            "low": self.low,
            "high": self.high,
            "level": self.level,
            "method": self.method,
        }


@dataclass
class Observation:
    """One value, and everything needed to defend it."""

    key: str
    value: Any
    unit: str | None = None
    source: str = ""
    sensor: str | None = None
    #: acquisition window the value describes, not when we computed it
    acquired_from: date | None = None
    acquired_to: date | None = None
    method: str = ""
    version: str = "0.1.0"
    uncertainty: Uncertainty | None = None
    #: 0..1, how much weight the fusion layer should give this
    confidence: float | None = None
    #: permanent, always-true qualifications of what this value means. These are
    #: reported to the caller but are NOT evidence that this run went badly.
    caveats: list[str] = field(default_factory=list)
    #: problems specific to *this* run — few scenes, heavy cloud, stale cache.
    #: These are what promote a source to DEGRADED.
    degradations: list[str] = field(default_factory=list)
    #: when the underlying bytes were fetched; drives staleness reporting
    fetched_at: datetime | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def stale_days(self, now: datetime | None = None) -> float | None:
        if self.fetched_at is None:
            return None
        now = now or datetime.now(timezone.utc)
        ref = self.fetched_at
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        return (now - ref).total_seconds() / 86400.0

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "key": self.key,
            "value": self.value,
            "unit": self.unit,
            "provenance": {
                "source": self.source,
                "sensor": self.sensor,
                "acquired": _window(self.acquired_from, self.acquired_to),
                "method": self.method,
                "version": self.version,
                "fetched_at": self.fetched_at.isoformat() if self.fetched_at else None,
                "stale_days": _round(self.stale_days()),
            },
        }
        if self.uncertainty is not None:
            out["uncertainty"] = self.uncertainty.as_dict()
        if self.confidence is not None:
            out["confidence"] = round(self.confidence, 4)
        if self.caveats:
            out["caveats"] = list(self.caveats)
        if self.degradations:
            out["degradations"] = list(self.degradations)
        if self.extra:
            out["extra"] = self.extra
        return out


def _window(a: date | None, b: date | None) -> dict[str, str | None] | None:
    if a is None and b is None:
        return None
    return {
        "from": a.isoformat() if a else None,
        "to": b.isoformat() if b else None,
    }


def _round(x: float | None, places: int = 2) -> float | None:
    return None if x is None else round(x, places)


@dataclass
class Evidence:
    """
    Everything several independent sources say about one place, plus an honest
    account of which ones could not speak. Agreement is computed, never assumed.
    """

    observations: list[Observation] = field(default_factory=list)
    statuses: list[SourceStatus] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def add(self, obs: Observation | None) -> None:
        if obs is not None:
            self.observations.append(obs)

    def record(self, status: SourceStatus) -> None:
        self.statuses.append(status)

    def by_key(self, key: str) -> list[Observation]:
        return [o for o in self.observations if o.key == key]

    def keys(self) -> list[str]:
        seen: list[str] = []
        for o in self.observations:
            if o.key not in seen:
                seen.append(o.key)
        return seen

    @property
    def unavailable(self) -> list[SourceStatus]:
        return [s for s in self.statuses if not s.usable]

    @property
    def degraded(self) -> list[SourceStatus]:
        return [s for s in self.statuses if s.availability is Availability.DEGRADED]

    def as_dict(self) -> dict[str, Any]:
        return {
            "observations": [o.as_dict() for o in self.observations],
            "sources": [s.as_dict() for s in self.statuses],
            "notes": list(self.notes),
        }

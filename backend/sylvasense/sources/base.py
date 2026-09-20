"""
The source contract.

Every source answers three questions: can you run here, what do you say, and
why not if not. A source that cannot run returns UNAVAILABLE with a machine-
readable code — it never raises into the caller and never silently returns
nothing. Degrading the confidence instead of dropping the answer is the whole
robustness strategy, and it has to be enforced at this boundary.
"""

from __future__ import annotations

import traceback
from abc import ABC, abstractmethod
from datetime import date

import structlog

from ..aoi import AOI
from ..cache import OfflineMiss
from ..provenance import Availability, Observation, SourceStatus

log = structlog.get_logger(__name__)


class Source(ABC):
    """One independent line of evidence."""

    id: str = "unnamed"
    #: human-readable, shown in the API's source list
    title: str = ""
    #: what this source is allowed to speak about
    provides: tuple[str, ...] = ()
    #: set when the source needs credentials it may not have
    requires_credential: str | None = None

    @abstractmethod
    def observe(self, aoi: AOI, start: date, end: date) -> list[Observation]:
        """Produce observations, or an empty list if there is nothing to say."""

    def preflight(self, aoi: AOI) -> SourceStatus | None:
        """
        Return a blocking status before doing any work — missing credentials,
        outside coverage. None means clear to proceed.
        """
        return None

    # -- called by the assembler; do not override ---------------------------

    def run(self, aoi: AOI, start: date, end: date) -> tuple[list[Observation], SourceStatus]:
        blocked = self.preflight(aoi)
        if blocked is not None:
            return [], blocked
        try:
            obs = self.observe(aoi, start, end)
        except OfflineMiss as exc:
            return [], self.unavailable("offline_miss", str(exc))
        except Exception as exc:  # a broken source must not break the answer
            log.warning(
                "source_failed", source=self.id, error=str(exc),
                trace=traceback.format_exc(limit=3),
            )
            return [], self.unavailable("error", f"{type(exc).__name__}: {exc}")

        if not obs:
            return [], self.unavailable("no_data", "source returned no observations")

        # a caveat is a permanent property of the measurement, not a fault;
        # only run-specific degradations may change the status
        degraded = [d for o in obs for d in o.degradations]
        if degraded:
            return obs, SourceStatus(
                self.id, Availability.DEGRADED, "; ".join(sorted(set(degraded))[:3]),
                "thin_input",
            )
        return obs, SourceStatus(self.id, Availability.OK)

    # -- helpers ------------------------------------------------------------

    def unavailable(self, code: str, reason: str) -> SourceStatus:
        return SourceStatus(self.id, Availability.UNAVAILABLE, reason, code)

    def missing_credential(self) -> SourceStatus:
        return self.unavailable(
            "no_credentials",
            f"{self.id} needs {self.requires_credential}; configure it to enable this layer",
        )


class SourceRegistry:
    def __init__(self) -> None:
        self._sources: dict[str, Source] = {}

    def register(self, source: Source) -> Source:
        self._sources[source.id] = source
        return source

    def get(self, source_id: str) -> Source | None:
        return self._sources.get(source_id)

    def all(self) -> list[Source]:
        return list(self._sources.values())

    def providing(self, key: str) -> list[Source]:
        return [s for s in self._sources.values() if key in s.provides]


registry = SourceRegistry()

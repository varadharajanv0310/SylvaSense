"""
Gates for batches 1 and 2. These run without network — that is the point.

The most important test here is not any single assertion, it is that a broken
source cannot break the answer. Everything else in the robustness story rests
on that boundary holding.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from sylvasense import forest
from sylvasense.aoi import GOLDEN_AOIS, GOLDEN_BY_ID, AOI, FixtureState
from sylvasense.evidence import assemble, confidence
from sylvasense.provenance import Availability, Observation, Uncertainty
from sylvasense.sources.base import Source


# ---------------------------------------------------------------- provenance


def test_observation_carries_provenance():
    obs = Observation(
        key="x", value=1.0, source="s", method="m",
        acquired_from=date(2024, 1, 1), acquired_to=date(2024, 2, 1),
    )
    d = obs.as_dict()
    assert d["provenance"]["source"] == "s"
    assert d["provenance"]["method"] == "m"
    assert d["provenance"]["acquired"]["from"] == "2024-01-01"


def test_uncertainty_relative_width():
    u = Uncertainty(low=80, high=120, level=0.9, method="conformal")
    assert u.width == 40
    assert u.relative_to(100) == pytest.approx(0.2)
    assert u.relative_to(0) is None


def test_staleness_is_reported():
    old = datetime.now(timezone.utc) - timedelta(days=30)
    obs = Observation(key="x", value=1, fetched_at=old)
    assert obs.stale_days() == pytest.approx(30, abs=0.1)


# ------------------------------------------------- caveat vs degradation


class _Caveated(Source):
    id = "caveated"
    provides = ("x",)

    def observe(self, aoi, start, end):
        return [Observation(key="x", value=1, source=self.id,
                            caveats=["this is a permanent property"])]


class _Degraded(Source):
    id = "degraded"
    provides = ("x",)

    def observe(self, aoi, start, end):
        return [Observation(key="x", value=1, source=self.id,
                            degradations=["only 2 scenes this run"])]


def test_caveat_does_not_degrade_but_degradation_does():
    """
    A permanent qualification is not a fault. Conflating the two makes every
    healthy run look sick and destroys the confidence signal.
    """
    aoi = GOLDEN_AOIS[0]
    _, ok = _Caveated().run(aoi, date(2024, 1, 1), date(2024, 2, 1))
    _, bad = _Degraded().run(aoi, date(2024, 1, 1), date(2024, 2, 1))
    assert ok.availability is Availability.OK
    assert bad.availability is Availability.DEGRADED


# ------------------------------------------------------- failure isolation


class _Exploding(Source):
    id = "exploding"
    provides = ("x",)

    def observe(self, aoi, start, end):
        raise RuntimeError("upstream is on fire")


class _Silent(Source):
    id = "silent"
    provides = ("x",)

    def observe(self, aoi, start, end):
        return []


class _Working(Source):
    id = "working"
    provides = ("tree_cover_fraction_2020",)

    def observe(self, aoi, start, end):
        return [Observation(key="tree_cover_fraction_2020", value=0.91,
                            source=self.id, method="test")]


def test_a_broken_source_cannot_break_the_answer():
    ev = assemble(
        GOLDEN_AOIS[0],
        start=date(2024, 1, 1), end=date(2024, 2, 1),
        sources=[_Exploding(), _Silent(), _Working()],
    )
    assert any(o.key == "tree_cover_fraction_2020" for o in ev.observations)
    codes = {s.source_id: s.code for s in ev.statuses}
    assert codes["exploding"] == "error"
    assert codes["silent"] == "no_data"
    assert len(ev.unavailable) == 2


def test_confidence_falls_as_sources_drop_out():
    args = dict(start=date(2024, 1, 1), end=date(2024, 2, 1))
    full = confidence(assemble(GOLDEN_AOIS[0], sources=[_Working(), _Working()], **args))
    partial = confidence(assemble(GOLDEN_AOIS[0], sources=[_Working(), _Exploding()], **args))
    assert partial["score"] < full["score"]
    assert partial["limits"]


def test_missing_credential_is_explained_not_hidden():
    class _Gated(Source):
        id = "gated"
        requires_credential = "SYLVA_SOMETHING"

        def preflight(self, aoi):
            return self.missing_credential()

        def observe(self, aoi, start, end):
            return []

    _, status = _Gated().run(GOLDEN_AOIS[0], date(2024, 1, 1), date(2024, 2, 1))
    assert status.code == "no_credentials"
    assert "SYLVA_SOMETHING" in status.reason


# ------------------------------------------------------------------ forest


def test_definitions_actually_differ():
    assert forest.get("eudr").baseline == date(2020, 12, 31)
    assert forest.get("fao").baseline is None
    assert forest.get("monitoring").min_area_ha < forest.get("fao").min_area_ha


def test_disagreement_is_reported_not_averaged():
    note = forest.disagreement_note({"a": 0.40, "b": 0.85})
    assert note and "disagree" in note
    assert forest.disagreement_note({"a": 0.80, "b": 0.84}) is None


def test_unknown_profile_falls_back_to_fao():
    assert forest.get("nonsense").id == "fao"


# -------------------------------------------------------------------- aoi


def test_gedi_coverage_boundary_is_enforced():
    tropical = AOI.from_bbox(-63.0, -9.5, -62.9, -9.4, id="t", name="t")
    arctic = AOI.from_bbox(20.0, 68.0, 20.1, 68.1, id="a", name="a")
    assert tropical.gedi_covered
    assert not arctic.gedi_covered


def test_only_verified_fixtures_are_marked_confirmed():
    """
    A fixture may not be used as a gate until it has been checked against data.
    Confirmed ones must carry the evidence that confirmed them.
    """
    for a in GOLDEN_AOIS:
        if a.state is FixtureState.CONFIRMED:
            assert a.observed, f"{a.id} is confirmed but records no evidence"
            assert "method" in a.observed, f"{a.id} does not say how it was confirmed"
        else:
            assert a.state is FixtureState.CANDIDATE


def test_the_intact_fixtures_are_actually_intact():
    """The false-positive floor is worthless if the ground is not closed forest."""
    for fid in ("intact", "intact-deep"):
        a = GOLDEN_BY_ID[fid]
        assert a.state is FixtureState.CONFIRMED
        covers = [
            a.observed[k]
            for k in ("tree_cover_fraction_2020", "alos_forest_fraction", "iolulc_tree_fraction")
        ]
        assert min(covers) >= 0.90, f"{fid} weakest layer {min(covers):.0%}"
        assert max(covers) - min(covers) <= 0.10


def test_aoi_key_is_stable_and_geometry_derived():
    a = AOI.from_bbox(-63.0, -9.5, -62.9, -9.4, id="x", name="x")
    b = AOI.from_bbox(-63.0, -9.5, -62.9, -9.4, id="different-id", name="y")
    assert a.key() == b.key()

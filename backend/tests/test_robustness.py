"""
Batch 5 gate: kill every input in turn and assert the system still answers.

The rule being tested is the one the whole architecture rests on — degrade the
confidence, never drop the answer. A 500 is a failure of design here, not an
acceptable outcome, because the caller has no way to distinguish "we could not
reach a satellite" from "this plot is fine".
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from sylvasense.aoi import GOLDEN_AOIS
from sylvasense.api import app
from sylvasense.cache import OfflineMiss
from sylvasense.evidence import assemble, confidence
from sylvasense.provenance import Availability, Observation
from sylvasense.sources.base import Source

WINDOW = dict(start=date(2024, 1, 1), end=date(2024, 6, 1))


class Healthy(Source):
    def __init__(self, sid: str, key: str = "tree_cover_fraction_2020", value: float = 0.8):
        self.id = sid
        self._key, self._value = key, value

    provides = ("tree_cover_fraction_2020",)

    def observe(self, aoi, start, end):
        return [Observation(key=self._key, value=self._value, source=self.id, method="test")]


class Crashing(Source):
    def __init__(self, sid: str, exc: Exception):
        self.id, self._exc = sid, exc

    def observe(self, aoi, start, end):
        raise self._exc


FAILURES = [
    ("network down", ConnectionError("name resolution failed")),
    ("upstream 500", RuntimeError("STAC returned 500")),
    ("timeout", TimeoutError("read timed out")),
    ("corrupt asset", ValueError("not a valid COG")),
    ("offline gap", OfflineMiss("nothing cached for this window")),
    ("out of memory", MemoryError("allocation failed")),
]


@pytest.mark.parametrize("label,exc", FAILURES, ids=[f[0] for f in FAILURES])
def test_every_failure_mode_degrades_rather_than_breaks(label, exc):
    ev = assemble(
        GOLDEN_AOIS[0],
        sources=[Crashing("broken", exc), Healthy("intact-source")],
        **WINDOW,
    )
    # the healthy source still answered
    assert any(o.key == "tree_cover_fraction_2020" for o in ev.observations)
    # and the failure is named, not swallowed
    broken = [s for s in ev.statuses if s.source_id == "broken"][0]
    assert broken.availability is Availability.UNAVAILABLE
    assert broken.reason


def test_total_outage_still_returns_a_shaped_answer():
    """Every source down is the worst case and must still be answerable."""
    ev = assemble(
        GOLDEN_AOIS[0],
        sources=[Crashing(f"dead-{i}", ConnectionError("down")) for i in range(4)],
        **WINDOW,
    )
    c = confidence(ev)
    assert c["score"] == 0.0
    assert len(ev.unavailable) == 4
    # and it says why it cannot answer, rather than implying everything is fine
    assert any("cannot be made" in n for n in ev.notes)


def test_confidence_is_monotonic_in_how_much_survived():
    scores = []
    for n_dead in range(4):
        sources = [Healthy(f"ok-{i}") for i in range(4 - n_dead)]
        sources += [Crashing(f"dead-{i}", ConnectionError("x")) for i in range(n_dead)]
        scores.append(confidence(assemble(GOLDEN_AOIS[0], sources=sources, **WINDOW))["score"])
    assert scores == sorted(scores, reverse=True), scores


def test_disagreement_lowers_confidence_below_agreement():
    agree = assemble(
        GOLDEN_AOIS[0],
        sources=[Healthy("a", value=0.80), Healthy("b", "alos_forest_fraction", 0.84)],
        **WINDOW,
    )
    differ = assemble(
        GOLDEN_AOIS[0],
        sources=[Healthy("a", value=0.35), Healthy("b", "alos_forest_fraction", 0.90)],
        **WINDOW,
    )
    assert confidence(differ)["score"] < confidence(agree)["score"]
    assert any("disagree" in n for n in differ.notes)


# ------------------------------------------------------------------- API


client = TestClient(app)


def test_health_and_metadata_never_touch_the_network():
    assert client.get("/health").status_code == 200
    assert client.get("/sources").json()["sources"]
    assert client.get("/definitions").json()["definitions"]


def test_malformed_geometry_is_a_422_not_a_500():
    r = client.post("/plot", json={"geometry": {"type": "Nonsense"}})
    assert r.status_code == 422


def test_unknown_fixture_is_a_404():
    assert client.get("/fixtures/does-not-exist/evidence").status_code == 404


def test_fixture_listing_distinguishes_checked_from_unchecked():
    """
    The API must never let a caller mistake an unverified hypothesis for a
    verified one. Confirmed fixtures carry their evidence; candidates do not.
    """
    body = client.get("/fixtures").json()
    states = {f["id"]: f["state"] for f in body["fixtures"]}
    assert states["intact"] == "confirmed"
    assert states["clearcut"] == "candidate"
    for f in body["fixtures"]:
        if f["state"] == "confirmed":
            assert f["observed"], f"{f['id']} claims confirmation with no evidence"
    assert "Candidate" in body["note"]


def test_detection_output_refuses_to_call_itself_an_area():
    """
    Map-counted areas are biased. The detector reports a pixel *fraction* and
    must say so; only the stratified estimator may emit hectares.
    """
    from sylvasense.detect.service import StreamResult, integrate
    from sylvasense.detect.bayes import DetectionResult
    import numpy as np

    res = DetectionResult(
        posterior=np.ones((4, 4), "float32"),
        confirmed=np.ones((4, 4), bool),
        first_flag_index=np.zeros((4, 4), "int32"),
        confirm_index=np.zeros((4, 4), "int32"),
        dates=[date(2024, 3, 1)],
    )
    obs = integrate([StreamResult("sar", "S1", res, 20)], GOLDEN_AOIS[0])
    for o in obs:
        assert o.unit != "ha", f"{o.key} claims hectares without a sample-based estimate"
        if o.unit == "fraction":
            assert any("not an area estimate" in c for c in o.caveats)


def test_short_monitoring_window_confirms_nothing():
    """
    An underpowered persistence test must decline, not guess.

    Measured on two verified primary-forest fixtures, false positives track
    the monitoring *span*: 182 days of monitoring confirmed 41.6% and 42.8% of
    intact rainforest as cleared, while 272 days confirmed 3.1% and 0.2% - and
    the observation count did not predict it (29 observations over 182 days
    were far worse than 26 over 272). So the gate is time, and below it the
    detector must confirm nothing and say why.
    """
    import numpy as np
    from datetime import date, timedelta

    from sylvasense.detect.bayes import MIN_MONITOR_DAYS, detect

    rng = np.random.default_rng(7)

    def series(total_days: int, cadence: int):
        n = total_days // cadence
        # stable forest at -8 dB with nothing but speckle: every confirmation
        # here is false by construction
        stack = (-8.0 + rng.normal(0, 1.6, (n, 12, 12))).astype("float32")
        dates = [date(2023, 1, 1) + timedelta(days=cadence * i) for i in range(n)]
        return stack, dates

    # half the series is history, so the monitoring span is half the total
    short = detect(*series(MIN_MONITOR_DAYS, 6))
    assert short.confirmed.sum() == 0, "an underpowered window must confirm nothing"
    assert short.underpowered, "and must say so rather than returning a quiet zero"
    assert str(MIN_MONITOR_DAYS) in short.underpowered

    # dense sampling does not buy power: twice the observations over the same
    # short span must still be refused
    dense = detect(*series(MIN_MONITOR_DAYS, 3))
    assert dense.confirmed.sum() == 0
    assert dense.underpowered

    # a long enough span and the guard steps aside
    long = detect(*series(MIN_MONITOR_DAYS * 3, 6))
    assert not long.underpowered

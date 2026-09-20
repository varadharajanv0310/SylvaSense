"""
Sample-based area estimation — Olofsson et al. (2014) good practice.

This module exists because counting map pixels is biased, and the bias is not
small. A map that misses 20% of small clearings and hallucinates a few large
ones does not average out: the error is systematic and points in whichever
direction the classifier leans. Reporting a pixel count as an area is the most
common fatal mistake in this field and it is invisible without a reference
sample.

What good practice requires:

  * a probability sample with known inclusion probabilities (stratified random,
    strata = map classes)
  * a reference classification of each sample unit from a better source
  * a stratified estimator that adjusts the mapped proportions using the
    confusion between map and reference
  * a confidence interval reported alongside every area

The estimator below implements equations 9-12 of the paper. Nothing else in
the codebase is allowed to publish an area figure.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Mapping, Sequence

import numpy as np


@dataclass(frozen=True)
class Stratum:
    """One map class, and how much of the map it covers."""

    label: str
    #: population units (pixels) mapped to this class
    n_units: int
    #: reference labels of the sampled units drawn from this stratum
    sample: Sequence[str]

    @property
    def n_sample(self) -> int:
        return len(self.sample)


@dataclass
class AreaEstimate:
    label: str
    #: bias-adjusted proportion of the total area
    proportion: float
    standard_error: float
    #: what the map alone would have claimed, for comparison
    mapped_proportion: float
    total_area_ha: float
    confidence_level: float = 0.95

    @property
    def area_ha(self) -> float:
        return self.proportion * self.total_area_ha

    @property
    def margin(self) -> float:
        z = 1.959963985 if abs(self.confidence_level - 0.95) < 1e-6 else _z(self.confidence_level)
        return z * self.standard_error

    @property
    def area_ci_ha(self) -> tuple[float, float]:
        m = self.margin * self.total_area_ha
        return (max(0.0, self.area_ha - m), self.area_ha + m)

    @property
    def mapped_area_ha(self) -> float:
        return self.mapped_proportion * self.total_area_ha

    @property
    def bias_ha(self) -> float:
        """How wrong simply counting pixels would have been."""
        return self.mapped_area_ha - self.area_ha

    def as_dict(self) -> dict:
        lo, hi = self.area_ci_ha
        return {
            "class": self.label,
            "area_ha": round(self.area_ha, 2),
            "confidence_interval_ha": [round(lo, 2), round(hi, 2)],
            "confidence_level": self.confidence_level,
            "proportion": round(self.proportion, 6),
            "standard_error": round(self.standard_error, 6),
            "map_counted_area_ha": round(self.mapped_area_ha, 2),
            "map_bias_ha": round(self.bias_ha, 2),
            "method": "stratified estimator, Olofsson et al. 2014 eq. 9-12",
        }


@dataclass
class Assessment:
    """Full accuracy and area report for one map."""

    estimates: dict[str, AreaEstimate]
    overall_accuracy: float
    overall_accuracy_se: float
    users_accuracy: dict[str, float] = field(default_factory=dict)
    producers_accuracy: dict[str, float] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "overall_accuracy": round(self.overall_accuracy, 4),
            "overall_accuracy_se": round(self.overall_accuracy_se, 4),
            "users_accuracy": {k: round(v, 4) for k, v in self.users_accuracy.items()},
            "producers_accuracy": {k: round(v, 4) for k, v in self.producers_accuracy.items()},
            "areas": [e.as_dict() for e in self.estimates.values()],
            "warnings": list(self.warnings),
        }


def _z(level: float) -> float:
    """Two-sided normal quantile, good enough for the usual levels."""
    table = {0.80: 1.281552, 0.90: 1.644854, 0.95: 1.959964, 0.99: 2.575829}
    if level in table:
        return table[level]
    # Acklam-style rough inverse for anything else
    p = (1 + level) / 2
    return math.sqrt(2) * _erfinv(2 * p - 1)


def _erfinv(x: float) -> float:
    a = 0.147
    ln = math.log(1 - x * x)
    t1 = 2 / (math.pi * a) + ln / 2
    return math.copysign(math.sqrt(math.sqrt(t1 * t1 - ln / a) - t1), x)


def estimate(
    strata: Sequence[Stratum],
    total_area_ha: float,
    *,
    confidence_level: float = 0.95,
    classes: Sequence[str] | None = None,
) -> Assessment:
    """
    Stratified area and accuracy estimation.

    `strata` are the map classes with their population sizes and the reference
    labels of the units sampled from each. The reference labels are the truth
    for those units; the map class is the stratum they were drawn from.
    """
    if not strata:
        raise ValueError("no strata supplied")

    thin = [s.label for s in strata if s.n_sample < 2]
    if thin:
        raise ValueError(
            f"strata {thin} have fewer than 2 sample units; the variance "
            "estimator is undefined there"
        )

    labels = list(classes) if classes else sorted(
        {ref for s in strata for ref in s.sample} | {s.label for s in strata}
    )
    n_total = sum(s.n_units for s in strata)
    weights = {s.label: s.n_units / n_total for s in strata}

    warnings: list[str] = []
    for s in strata:
        if s.n_sample < 20:
            warnings.append(
                f"stratum '{s.label}' has only {s.n_sample} sample units; the "
                "interval is wide and the normal approximation is optimistic"
            )

    # p_hat[h][j] = share of stratum h whose reference class is j
    p_hat: dict[str, dict[str, float]] = {}
    for s in strata:
        counts = {j: 0 for j in labels}
        for ref in s.sample:
            counts[ref] = counts.get(ref, 0) + 1
        p_hat[s.label] = {j: counts[j] / s.n_sample for j in labels}

    estimates: dict[str, AreaEstimate] = {}
    for j in labels:
        # eq 9: area proportion of class j
        prop = sum(weights[s.label] * p_hat[s.label][j] for s in strata)
        # eq 10: standard error of that proportion
        var = 0.0
        for s in strata:
            w = weights[s.label]
            p = p_hat[s.label][j]
            var += (w ** 2) * p * (1 - p) / (s.n_sample - 1)
        estimates[j] = AreaEstimate(
            label=j,
            proportion=prop,
            standard_error=math.sqrt(var),
            mapped_proportion=weights.get(j, 0.0),
            total_area_ha=total_area_ha,
            confidence_level=confidence_level,
        )

    # overall accuracy: the weighted share of the map that is right
    overall = sum(weights[s.label] * p_hat[s.label].get(s.label, 0.0) for s in strata)
    o_var = 0.0
    for s in strata:
        w = weights[s.label]
        p = p_hat[s.label].get(s.label, 0.0)
        o_var += (w ** 2) * p * (1 - p) / (s.n_sample - 1)

    users = {s.label: p_hat[s.label].get(s.label, 0.0) for s in strata}
    producers: dict[str, float] = {}
    for j in labels:
        num = next(
            (weights[s.label] * p_hat[s.label][j] for s in strata if s.label == j), 0.0
        )
        den = estimates[j].proportion
        producers[j] = num / den if den > 0 else float("nan")

    return Assessment(
        estimates=estimates,
        overall_accuracy=overall,
        overall_accuracy_se=math.sqrt(o_var),
        users_accuracy=users,
        producers_accuracy=producers,
        warnings=warnings,
    )


def allocate_sample(
    strata_sizes: Mapping[str, int],
    total_sample: int,
    *,
    rare_classes: Sequence[str] = (),
    min_per_stratum: int = 50,
) -> dict[str, int]:
    """
    Sample allocation. Proportional allocation starves the rare class that is
    usually the entire point — deforestation is a small fraction of any
    landscape — so rare strata get a floor, as the paper recommends.
    """
    if total_sample < min_per_stratum * len(strata_sizes):
        raise ValueError(
            f"total sample {total_sample} cannot give {min_per_stratum} units to "
            f"each of {len(strata_sizes)} strata"
        )
    alloc = {k: min_per_stratum for k in strata_sizes}
    for k in rare_classes:
        if k in alloc:
            alloc[k] = max(alloc[k], min_per_stratum)

    remaining = total_sample - sum(alloc.values())
    common = {k: v for k, v in strata_sizes.items() if k not in rare_classes}
    pool = sum(common.values()) or 1
    for k, size in common.items():
        alloc[k] += int(remaining * size / pool)

    drift = total_sample - sum(alloc.values())
    if drift and common:
        biggest = max(common, key=common.get)
        alloc[biggest] += drift
    return alloc


def draw_sample(
    mask: np.ndarray, n: int, *, seed: int = 0
) -> list[tuple[int, int]]:
    """
    Simple random sample of pixel positions within one stratum, with known
    inclusion probability n/N — the condition that makes the estimator valid.
    """
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return []
    rng = np.random.default_rng(seed)
    take = min(n, ys.size)
    idx = rng.choice(ys.size, size=take, replace=False)
    return [(int(ys[i]), int(xs[i])) for i in idx]

"use client";

import { useEffect, useState } from "react";

/**
 * Real measurements for the flagship, from the SylvaSense backend.
 *
 * The scroll was written against invented constants — 164.2 Mg/ha, a canopy
 * curve that was a straight line with a slope of 18.4. This hook replaces the
 * ones that can be replaced with figures the backend actually measured, and
 * leaves the rest alone.
 *
 * Three rules it follows, because the narrative must never break:
 *
 * 1. **It never blocks.** The flagship renders immediately with its existing
 *    constants and swaps in real numbers when they arrive. A backend that is
 *    down, slow or absent costs nothing.
 * 2. **It never invents.** Every field here maps to one observation the
 *    backend returned. Anything missing stays null and the component keeps its
 *    own fallback, labelled as illustrative — which it then honestly is.
 * 3. **It says where it came from.** `live` distinguishes a running API from
 *    the frozen capture, and the method notes name the sensor either way.
 */

const API = "http://127.0.0.1:8000";
const SNAPSHOT = "/sylvasense-report.json";
/** The API is local; if it cannot answer in this long it is not running. */
const PING_MS = 1200;
/** A warm report is instant, but the first one after a restart is not. */
const REPORT_MS = 8000;

/** The flagship tells one place's story. Machadinho is the fishbone frontier. */
export const FLAGSHIP_SITE = "clearcut";

export type FieldData = {
  live: boolean;
  generated: string | null;
  site: { id: string; name: string; centroid: number[]; state: string } | null;
  window: { start: string; end: string } | null;
  /** aboveground biomass over the plot, Mg/ha, with its conformal bounds */
  biomass: {
    mean: number;
    carbon: number;
    low: number;
    high: number;
    level: number;
    /** false when the interval failed its calibration check */
    calibrated: boolean;
  } | null;
  /** ESA WorldCover 2020 tree-cover fraction — the EUDR baseline year */
  cover2020: number | null;
  /** fraction of the plot confirmed disturbed within the analysis window */
  confirmed: number | null;
  /** crossed the threshold but persistence unverified */
  provisional: number | null;
  scenes: { sar: number | null; optical: number | null };
  /** GEDI footprints behind the biomass calibration */
  footprints: number | null;
  sources: number | null;
};

const EMPTY: FieldData = {
  live: false,
  generated: null,
  site: null,
  window: null,
  biomass: null,
  cover2020: null,
  confirmed: null,
  provisional: null,
  scenes: { sar: null, optical: null },
  footprints: null,
  sources: null,
};

type Obs = { key: string; value: unknown };

function numberOf(rows: Obs[] | undefined, key: string): number | null {
  const hit = rows?.find((o) => o.key === key);
  return typeof hit?.value === "number" ? hit.value : null;
}

/* The report shape is documented by the API; only the fields used here are
   named, and every one of them is read defensively because a block is allowed
   to fail on its own without taking the rest of the report with it. */
type Report = {
  fixture?: { id: string; name: string; centroid: number[]; state: string };
  window?: { start: string; end: string };
  generated?: string;
  evidence?: { observations?: Obs[]; sources?: unknown[] };
  disturbance?: Obs[];
  biomass?: {
    available?: boolean;
    usable?: boolean;
    aoi?: {
      agbd_mean: number;
      agbd_low: number;
      agbd_high: number;
      carbon_mean: number;
      level: number;
    };
    fit?: { gedi_footprints?: number };
  };
};

function shape(report: Report, live: boolean): FieldData {
  const obs = report.evidence?.observations;
  const stock = report.biomass?.available ? report.biomass.aoi : undefined;
  return {
    live,
    generated: report.generated ?? null,
    site: report.fixture ?? null,
    window: report.window ?? null,
    biomass: stock
      ? {
          mean: stock.agbd_mean,
          carbon: stock.carbon_mean,
          low: stock.agbd_low,
          high: stock.agbd_high,
          level: stock.level,
          calibrated: report.biomass?.usable !== false,
        }
      : null,
    cover2020: numberOf(obs, "tree_cover_fraction_2020"),
    confirmed:
      numberOf(report.disturbance, "alert_integrated_confirmed_fraction") ??
      numberOf(report.disturbance, "alert_sar_confirmed_fraction"),
    provisional: numberOf(report.disturbance, "alert_sar_provisional_fraction"),
    scenes: {
      sar: numberOf(obs, "sar_scene_count"),
      optical: numberOf(obs, "optical_scene_count"),
    },
    footprints: report.biomass?.fit?.gedi_footprints ?? null,
    sources: report.evidence?.sources?.length ?? null,
  };
}

async function withTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function useFieldData(site: string = FLAGSHIP_SITE): FieldData {
  const [data, setData] = useState<FieldData>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // the running instrument, if there is one
      try {
        const ping = await withTimeout(`${API}/health`, PING_MS);
        if (ping.ok) {
          const r = await withTimeout(`${API}/report/${site}`, REPORT_MS);
          if (r.ok) {
            const body = (await r.json()) as Report;
            if (!cancelled) setData(shape(body, true));
            return;
          }
        }
      } catch {
        /* not running, or too slow to matter — fall through */
      }

      // the frozen capture, which is the normal path for a deployed build
      try {
        const r = await fetch(SNAPSHOT);
        if (!r.ok) return;
        const body = (await r.json()) as { generated?: string; sites?: Report[] };
        const hit = body.sites?.find((s) => s.fixture?.id === site);
        if (hit && !cancelled) {
          setData({ ...shape(hit, false), generated: body.generated ?? null });
        }
      } catch {
        /* no data at all: the flagship keeps its own constants and says so */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [site]);

  return data;
}

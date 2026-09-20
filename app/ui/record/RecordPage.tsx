"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./record.css";

/**
 * The wordmark, pointing home to the flagship.
 *
 * The shared `Brand` component links to /concepts, which is the exploratory
 * selector rather than the product. This page is the last chapter of the
 * flagship, so its mark returns there.
 */
function Mark() {
  return (
    <Link className="brand" href="/" aria-label="SylvaSense">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M5 25V8l11 7 11-7v17L16 18Z" />
        <path d="M5 8l11 7V3M16 18v11" />
      </svg>
      <span>
        SylvaSense<span className="brand-dot">&#174;</span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Shapes returned by GET /report/{fixture}. Only the fields this page
 * reads are declared; the payload carries considerably more, and the
 * raw link at the foot of each site is there so nothing is hidden by
 * the fact that this component chose not to render it.
 * ------------------------------------------------------------------ */

type Uncertainty = {
  low: number | null;
  high: number | null;
  level: number;
  method: string;
};

type Observation = {
  key: string;
  value: number | string | null;
  unit?: string | null;
  provenance: {
    source: string;
    sensor?: string | null;
    acquired?: { from?: string | null; to?: string | null };
    method?: string;
    version?: string;
  };
  uncertainty?: Uncertainty | null;
  caveats?: string[];
  degradations?: string[];
};

type SourceStatus = {
  source: string;
  availability: string;
  code?: string;
  reason?: string;
};

type Stock = {
  agbd_mean: number;
  agbd_low: number;
  agbd_high: number;
  carbon_mean: number;
  cells: number;
  level: number;
};

type Site = {
  fixture: {
    id: string;
    name: string;
    state: string;
    purpose?: string;
    hypothesis?: string;
    bbox: number[];
    centroid: number[];
  };
  window: { start: string; end: string };
  evidence?: {
    confidence?: { score: number; basis: string; limits: string[] };
    observations?: Observation[];
    sources?: SourceStatus[];
    definition?: { id: string; label: string; baseline: string | null };
  };
  disturbance?: Observation[];
  biomass?: {
    available: boolean;
    reason?: string;
    aoi?: Stock;
    region?: Stock;
    usable?: boolean;
    fit?: {
      r2: number;
      rmse_mg_ha: number;
      bias_mg_ha: number;
      gedi_footprints: number;
      grid_cells_with_footprints: number;
      grid_resolution_m: number;
      ranks_cells: boolean;
      caveats: string[];
      coverage: {
        nominal: number;
        empirical: number;
        n: number;
        mean_width: number;
        passes: boolean;
      };
      feature_importance: Record<string, number>;
      predictor_sources: Record<string, { scenes: number }>;
    };
  };
};

type Payload = { generated: string; note?: string; sites: Site[] };

const API = "http://127.0.0.1:8000";
const SNAPSHOT = "/sylvasense-report.json";
/** Long enough for a warm cache, short enough not to strand the page. */
const LIVE_TIMEOUT_MS = 2500;
/**
 * Budget for the whole live fetch.
 *
 * A warm report answers in well under a second; a cold one takes minutes,
 * because it re-runs the detector and re-fits the biomass model. Without a
 * deadline the page sits on "Reading..." for the length of the slowest cold
 * report, which looks exactly like a hang. Past this we take whatever has
 * arrived, and if that is nothing we serve the capture instead.
 */
const LIVE_BUDGET_MS = 12000;

const FIXTURES = [
  "clearcut",
  "intact",
  "intact-deep",
  "cloudy",
  "degradation",
  "burn",
];

/* ------------------------------------------------------------------ */

const num = (v: unknown, digits = 1) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("en-GB", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

const pct = (v: unknown, digits = 0) =>
  typeof v === "number" && Number.isFinite(v)
    ? `${(v * 100).toFixed(digits)}%`
    : "—";

const label = (key: string) =>
  key.replace(/_/g, " ").replace(/\b(sar|gedi|agbd|ndvi|rtc)\b/gi, (m) =>
    m.toUpperCase(),
  );

/** A backend exception is data for the reader, not a stack trace to paste. */
const cleanReason = (raw?: string) => {
  if (!raw) return "The backend did not say why.";
  const body = raw.replace(/^[A-Za-z]*(Error|Exception):\s*/, "");
  if (/quality GEDI footprints/.test(body))
    return (
      "GEDI crossed this region but none of its footprints passed the quality " +
      "filter — degraded passes, or beam sensitivity too low to see the " +
      "ground through the canopy. With nothing to calibrate against there is " +
      "no estimate, and an uncalibrated number would be worse than none."
    );
  return body.charAt(0).toUpperCase() + body.slice(1);
};

const coord = (lon: number, lat: number) =>
  `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"}, ` +
  `${Math.abs(lon).toFixed(3)}° ${lon < 0 ? "W" : "E"}`;

type Verdict = { line: string; sub?: string; tone: "clear" | "change" | "thin" };

/**
 * The one sentence a reader should take from a site.
 *
 * "Nothing confirmed" and "nothing happened" are different claims, and the
 * detector now distinguishes them: a crossing it could not verify becomes
 * provisional rather than an alert. A page that collapsed the two would undo
 * the only interesting thing the backend does.
 */
function verdict(site: Site): Verdict {
  const obs = site.disturbance ?? [];
  const pick = (k: string) => obs.find((o) => o.key === k);
  const conf =
    pick("alert_integrated_confirmed_fraction") ??
    pick("alert_sar_confirmed_fraction");
  const prov = pick("alert_sar_provisional_fraction");
  const underpowered = obs.find((o) => o.degradations?.length)?.degradations?.[0];

  if (!conf || typeof conf.value !== "number")
    return { line: "Detection did not return a verdict", tone: "thin" };

  const c = conf.value;
  const p = typeof prov?.value === "number" ? prov.value : null;

  if (underpowered)
    return {
      line: "Nothing confirmed — the window is too short to be sure",
      sub:
        (p !== null ? `${pct(p)} of pixels crossed the threshold, ` : "") +
        "but persistence could not be verified, so none of it is called a detection.",
      tone: "thin",
    };

  if (c < 0.01)
    return {
      line: "No disturbance confirmed in the window",
      sub:
        p !== null && p > 0.01
          ? `${pct(p)} of pixels crossed and did not hold — on stable forest that is speckle.`
          : undefined,
      tone: "clear",
    };

  return {
    line: `${pct(c)} of the plot confirmed as disturbed`,
    sub:
      p !== null && p > 0.01
        ? `A further ${pct(p)} crossed without confirming.`
        : undefined,
    tone: "change",
  };
}

/* ------------------------------------------------------------------ */

export default function RecordPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [active, setActive] = useState(0);
  const [openObs, setOpenObs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Try the instrument first. It is the point of the page, but it is a
    // Python process on someone's laptop and the deployed app will never
    // reach it, so the frozen capture is the expected path rather than an
    // error path — and the page says which one it is showing.
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);
      const ping = await fetch(`${API}/health`, { signal: ctl.signal });
      clearTimeout(t);
      if (ping.ok) {
        // ask the backend which fixtures it has rather than assuming; adding
        // one there should show up here without a front-end change
        const ids: string[] = await fetch(`${API}/fixtures`)
          .then((r) => (r.ok ? (r.json() as Promise<{ fixtures?: { id: string }[] }>) : null))
          .then((j) => j?.fixtures?.map((f) => f.id) ?? FIXTURES)
          .catch(() => FIXTURES);
        const deadline = new AbortController();
        const budget = setTimeout(() => deadline.abort(), LIVE_BUDGET_MS);
        const sites = await Promise.all(
          ids.map((id) =>
            fetch(`${API}/report/${id}`, { signal: deadline.signal })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        );
        clearTimeout(budget);
        const ok = sites.filter(Boolean) as Site[];
        // A partial live answer is still a live answer, but if the API only
        // managed a couple of cold sites the capture is the better page.
        if (ok.length && ok.length < ids.length / 2) {
          const cap = await fetch(SNAPSHOT)
            .then((r) => (r.ok ? (r.json() as Promise<Payload>) : null))
            .catch(() => null);
          if (cap?.sites?.length) {
            setError(null);
            setPayload(cap);
            setLive(false);
            return;
          }
        }
        if (ok.length) {
          setError(null);
          setPayload({ generated: new Date().toISOString().slice(0, 10), sites: ok });
          setLive(true);
          return;
        }
      }
    } catch {
      /* fall through to the capture */
    }
    try {
      const r = await fetch(SNAPSHOT);
      if (!r.ok) throw new Error(`snapshot ${r.status}`);
      const body = (await r.json()) as Payload;
      setError(null);
      setPayload(body);
      setLive(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLive(false);
    }
  }, []);

  useEffect(() => {
    // The rule cannot see that every setState in `load` happens after an
    // await, so none of them is the synchronous cascading render it guards
    // against. Fetching on mount is the point of the page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sites = useMemo(() => payload?.sites ?? [], [payload]);
  const site = sites[Math.min(active, Math.max(sites.length - 1, 0))];

  const sensors = useMemo(() => {
    const set = new Set<string>();
    sites.forEach((s) =>
      (s.evidence?.observations ?? []).forEach((o) => {
        if (o.provenance?.sensor) set.add(o.provenance.sensor);
      }),
    );
    return Array.from(set);
  }, [sites]);

  return (
    <main className="rec">
      <header className="rec-head">
        <Mark />
        <span className="meta rec-head-mid">THE RECORD</span>
        <span className="meta rec-stamp" data-live={live ? "yes" : "no"}>
          <i />
          {live === null
            ? "CONNECTING"
            : live
              ? "LIVE — READING NOW"
              : `CAPTURED ${payload?.generated ?? "—"}`}
        </span>
      </header>

      <section className="rec-hero">
        <p className="eyebrow">
          <i className="tiny-line" />
          FIELD RECORD / RONDÔNIA, BRAZIL
        </p>
        <h1>
          The story ends here.
          <br />
          <em>The instrument does not.</em>
        </h1>
        <p className="rec-lede">
          Everything before this was illustration — a way of feeling what a
          forest is worth. What follows is measured. Six places on the
          Rondônia frontier, read by satellite over the last year, with every
          number carrying the sensor that produced it, the window it covers,
          and the width of its own doubt.
        </p>
        <dl className="rec-facts">
          <div>
            <dt>Sites</dt>
            <dd>{sites.length || "—"}</dd>
          </div>
          <div>
            <dt>Independent sensors</dt>
            <dd>{sensors.length || "—"}</dd>
          </div>
          <div>
            <dt>Grid</dt>
            <dd>
              {site?.biomass?.fit?.grid_resolution_m
                ? `${site.biomass.fit.grid_resolution_m} m`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Definition</dt>
            <dd>{site?.evidence?.definition?.label ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {error && (
        <p className="rec-error">
          Could not reach the API or the captured record ({error}). Start the
          backend with <code>uvicorn sylvasense.api:app</code>, or rebuild the
          capture with <code>scripts/build_snapshot.py</code>.
        </p>
      )}

      {!payload && !error && <p className="rec-loading">Reading…</p>}

      {site && (
        <section className="rec-body">
          <nav className="rec-rail" aria-label="Sites">
            {sites.map((s, i) => {
              const v = verdict(s);
              return (
                <button
                  key={s.fixture.id}
                  className={i === active ? "is-active" : ""}
                  onClick={() => {
                    setActive(i);
                    setOpenObs(null);
                  }}
                  aria-current={i === active}
                >
                  <span className="rec-rail-n">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="rec-rail-name">{s.fixture.name}</span>
                  <span className={`rec-dot rec-dot-${v.tone}`} aria-hidden />
                </button>
              );
            })}
          </nav>

          <article className="rec-detail">
            <p className="eyebrow rec-state" data-state={site.fixture.state}>
              {site.fixture.state === "confirmed"
                ? "CONFIRMED FIXTURE"
                : "CANDIDATE — HYPOTHESIS NOT YET VERIFIED"}
            </p>
            <h2>{site.fixture.name}</h2>
            <p className="meta rec-coord">
              {coord(site.fixture.centroid[0], site.fixture.centroid[1])}
              <span className="slash">/</span>
              {site.window.start} → {site.window.end}
            </p>
            {site.fixture.purpose && (
              <p className="rec-purpose">{site.fixture.purpose}</p>
            )}

            {/* ---- the headline quantity ---- */}
            <div
              className="rec-headline"
              data-uncalibrated={
                site.biomass?.available && site.biomass.usable === false
                  ? "yes"
                  : undefined
              }
            >
              {site.biomass?.available && site.biomass.aoi ? (
                <>
                  <div className="rec-big">
                    <b>{num(site.biomass.aoi.agbd_mean)}</b>
                    <small>Mg / ha</small>
                  </div>
                  <div className="rec-interval">
                    <span className="meta">
                      {pct(site.biomass.aoi.level)} INTERVAL
                    </span>
                    <strong>
                      {num(site.biomass.aoi.agbd_low)} –{" "}
                      {num(site.biomass.aoi.agbd_high)}
                    </strong>
                    <span className="meta">
                      {num(site.biomass.aoi.carbon_mean)} MgC/ha above ground
                    </span>
                  </div>
                  <IntervalBar stock={site.biomass.aoi} />
                  {site.biomass.usable === false && (
                    // The gate failed, so this interval does not carry its
                    // stated coverage. Showing the number without saying so
                    // would be the exact failure the gate exists to catch.
                    <p className="rec-uncalibrated">
                      This interval did not pass its calibration check
                      {site.biomass.fit
                        ? ` — it covered ${pct(
                            site.biomass.fit.coverage.empirical,
                            1,
                          )} of held-out footprints against a nominal ${pct(
                            site.biomass.fit.coverage.nominal,
                          )}`
                        : ""}
                      . Read the estimate, not the bounds.
                    </p>
                  )}
                </>
              ) : (
                <p className="rec-absent">
                  <b>No biomass estimate here.</b>{" "}
                  {cleanReason(site.biomass?.reason)}
                </p>
              )}
            </div>

            {/* ---- disturbance ---- */}
            <Block title="Change" aside={site.window.start + " → " + site.window.end}>
              {(() => {
                const v = verdict(site);
                return (
                  <>
                    <p className={`rec-verdict rec-verdict-${v.tone}`}>{v.line}</p>
                    {v.sub && <p className="rec-verdict-sub">{v.sub}</p>}
                  </>
                );
              })()}
              <ObsTable
                rows={(site.disturbance ?? []).filter(
                  (o) => typeof o.value === "number" || typeof o.value === "string",
                )}
                open={openObs}
                onToggle={setOpenObs}
              />
            </Block>

            {/* ---- convergence ---- */}
            <Block
              title="Convergence"
              aside={
                site.evidence?.confidence
                  ? `${pct(site.evidence.confidence.score)} · ${site.evidence.confidence.basis}`
                  : undefined
              }
            >
              <ObsTable
                rows={site.evidence?.observations ?? []}
                open={openObs}
                onToggle={setOpenObs}
              />
              <div className="rec-sources">
                {(site.evidence?.sources ?? []).map((s) => (
                  <span key={s.source} data-av={s.availability}>
                    <i />
                    {s.source}
                    {s.reason ? <em> — {s.reason}</em> : null}
                  </span>
                ))}
              </div>
            </Block>

            {/* ---- how the model was checked ---- */}
            {site.biomass?.fit && <FitBlock fit={site.biomass.fit} />}
          </article>
        </section>
      )}

      <section className="rec-limits">
        <p className="eyebrow">
          <i className="tiny-line" />
          WHAT THIS CANNOT DO
        </p>
        <div className="rec-limits-grid">
          {[
            [
              "It is not a compliance determination.",
              "These are evidence layers. A regulation asks whether a specific parcel was forest on a specific date and whether it was cleared after; that question needs a legal boundary and an auditor, not a satellite.",
            ],
            [
              "Recall has not been measured.",
              "Specificity has: on verified primary forest the detector raises false alarms on 0–3.1% of pixels. How much real clearing it misses is unknown, because a fixture that tests it has not been found yet.",
            ],
            [
              "C-band saturates.",
              "Sentinel-1 stops responding to biomass above roughly 100–150 Mg/ha, which is below most of this landscape. Above that the estimate leans on optical and terrain cues, and the interval widens to admit it.",
            ],
            [
              "GEDI is a sample, not a map.",
              "Its beams are 600 m apart. Every biomass figure here is a model fitted to those footprints and applied between them — calibrated, interval-checked, but interpolated.",
            ],
          ].map(([h, b]) => (
            <div key={h}>
              <h3>{h}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="rec-foot">
        <Link href="/">← Return to the forest</Link>
        <span className="meta">
          SylvaSense · evidence, not verdicts · ORION PS-03
        </span>
        <a href={`${API}/docs`} target="_blank" rel="noreferrer">
          The API behind this ↗
        </a>
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Block({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rec-block">
      <header>
        <h3>{title}</h3>
        {aside && <span className="meta">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/** A value, its interval, and — on click — the provenance behind it. */
function ObsTable({
  rows,
  open,
  onToggle,
}: {
  rows: Observation[];
  open: string | null;
  onToggle: (k: string | null) => void;
}) {
  if (!rows.length) return <p className="rec-absent">Nothing returned.</p>;
  return (
    <ul className="rec-obs">
      {rows.map((o) => {
        const isOpen = open === o.key;
        const u = o.uncertainty;
        return (
          <li key={o.key} className={isOpen ? "is-open" : ""}>
            <button onClick={() => onToggle(isOpen ? null : o.key)}>
              <span className="rec-obs-k">{label(o.key)}</span>
              <span className="rec-obs-v">
                {typeof o.value === "number" ? num(o.value, 2) : String(o.value ?? "—")}
                {o.unit ? <small> {o.unit}</small> : null}
              </span>
              <span className="rec-obs-u">
                {u && u.low != null && u.high != null
                  ? `${num(u.low, 1)} – ${num(u.high, 1)}`
                  : ""}
              </span>
              <span className="rec-obs-s">{o.provenance?.source}</span>
              <i aria-hidden>{isOpen ? "−" : "+"}</i>
            </button>
            {isOpen && (
              <div className="rec-obs-detail">
                <dl>
                  <div>
                    <dt>Sensor</dt>
                    <dd>{o.provenance?.sensor ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Window</dt>
                    <dd>
                      {o.provenance?.acquired?.from ?? "—"} →{" "}
                      {o.provenance?.acquired?.to ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Method</dt>
                    <dd>{o.provenance?.method ?? "—"}</dd>
                  </div>
                  {u && (
                    <div>
                      <dt>Interval</dt>
                      <dd>
                        {pct(u.level)} · {u.method}
                      </dd>
                    </div>
                  )}
                </dl>
                {!!o.caveats?.length && (
                  <ul className="rec-caveats">
                    {o.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                {!!o.degradations?.length && (
                  <ul className="rec-caveats rec-degraded">
                    {o.degradations.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The model's own report card — coverage first, because it is the gate. */
function FitBlock({
  fit,
}: {
  fit: NonNullable<NonNullable<Site["biomass"]>["fit"]>;
}) {
  const c = fit.coverage;
  return (
    <Block
      title="How this was checked"
      aside={`${fit.gedi_footprints.toLocaleString()} GEDI footprints across ${fit.grid_cells_with_footprints.toLocaleString()} cells`}
    >
      <div className="rec-gate" data-pass={c.passes ? "yes" : "no"}>
        <span className="meta">CALIBRATION GATE</span>
        <strong>
          {pct(c.empirical, 1)} of held-out footprints fell inside the{" "}
          {pct(c.nominal)} interval
        </strong>
        <span className="meta">
          {c.n} shots on spatial blocks the model never saw · mean width{" "}
          {num(c.mean_width, 0)} Mg/ha · {c.passes ? "PASSES" : "FAILS"}
        </span>
      </div>
      <dl className="rec-fit">
        <div>
          <dt>R² (held out)</dt>
          <dd>{num(fit.r2, 3)}</dd>
        </div>
        <div>
          <dt>RMSE</dt>
          <dd>{num(fit.rmse_mg_ha, 0)} Mg/ha</dd>
        </div>
        <div>
          <dt>Bias</dt>
          <dd>{num(fit.bias_mg_ha, 1)} Mg/ha</dd>
        </div>
        <div>
          <dt>Ranks cells</dt>
          <dd>{fit.ranks_cells ? "yes" : "no"}</dd>
        </div>
      </dl>
      <div className="rec-importance">
        {Object.entries(fit.feature_importance ?? {}).map(([k, v]) => (
          <div key={k}>
            <span className="meta">{k}</span>
            <i style={{ "--w": `${Math.max(v * 100, 1)}%` } as React.CSSProperties} />
            <span className="meta">{pct(v)}</span>
          </div>
        ))}
      </div>
      {!!fit.caveats?.length && (
        <ul className="rec-caveats">
          {fit.caveats.map((c2) => (
            <li key={c2}>{c2}</li>
          ))}
        </ul>
      )}
    </Block>
  );
}

/** Where the estimate sits inside its own interval, drawn to scale. */
function IntervalBar({ stock }: { stock: Stock }) {
  const span = Math.max(stock.agbd_high - stock.agbd_low, 1);
  const pad = span * 0.35;
  const lo = Math.max(0, stock.agbd_low - pad);
  const hi = stock.agbd_high + pad;
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="rec-bar" aria-hidden>
      <i
        className="rec-bar-span"
        style={
          {
            left: `${at(stock.agbd_low)}%`,
            width: `${at(stock.agbd_high) - at(stock.agbd_low)}%`,
          } as React.CSSProperties
        }
      />
      <i className="rec-bar-mark" style={{ left: `${at(stock.agbd_mean)}%` }} />
    </div>
  );
}

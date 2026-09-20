"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import "../record/record.css";
import "./console.css";

/* ------------------------------------------------------------------ *
 * The console: run the instrument on an area you choose.
 *
 * /record shows six pre-computed sites. This runs the backend live on any
 * polygon, which means it is honest about the thing a demo usually hides —
 * a cold analysis reads Sentinel scenes and GEDI granules over the wire and
 * takes minutes. So the page never pretends to be instant. It states the
 * cost before you commit, counts the seconds while it works, and streams
 * each block in as it lands rather than blocking on the slowest one.
 * ------------------------------------------------------------------ */

const API = "http://127.0.0.1:8000";

type Obs = {
  key: string;
  value: number | string | null;
  unit?: string | null;
  provenance?: {
    source?: string;
    sensor?: string | null;
    acquired?: { from?: string | null; to?: string | null };
    method?: string;
  };
  uncertainty?: { low: number | null; high: number | null; level: number; method: string } | null;
  caveats?: string[];
  degradations?: string[];
};

type Stock = {
  agbd_mean: number;
  agbd_low: number;
  agbd_high: number;
  carbon_mean: number;
  level: number;
};

type Evidence = {
  aoi?: { bbox: number[]; centroid: number[] };
  definition?: { id: string; label: string; baseline: string | null };
  confidence?: { score: number; basis: string; limits: string[] };
  observations?: Obs[];
  sources?: { source: string; availability: string; reason?: string }[];
};

type Biomass = {
  available: boolean;
  reason?: string;
  usable?: boolean;
  aoi?: Stock;
  fit?: {
    r2: number;
    gedi_footprints: number;
    ranks_cells: boolean;
    caveats: string[];
    coverage: { nominal: number; empirical: number; n: number; passes: boolean };
  };
};

type Site = { id: string; name: string; state: string; centroid: number[]; bbox: number[] };
type Footprint = {
  kind: "raster" | "geojson";
  filename: string;
  geometry: unknown;
  bbox: number[];
  centroid: number[];
  area_km2: number;
  gedi_covered: boolean;
  raster?: { crs: string; width: number; height: number; bands: number; pixel_m: number | null; dtype: string };
  note?: string;
};
type Phase = "idle" | "running" | "done" | "error";

const num = (v: unknown, d = 1) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";
const pct = (v: unknown, d = 0) =>
  typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "—";
const label = (k: string) =>
  k.replace(/_/g, " ").replace(/\b(sar|gedi|agbd|ndvi|rtc|vh|vv)\b/gi, (m) => m.toUpperCase());

/** A square of `km` on a side around a point, as GeoJSON. */
function boxAround(lon: number, lat: number, km: number) {
  const dLat = km / 2 / 110.574;
  const dLon = km / 2 / (111.32 * Math.cos((lat * Math.PI) / 180));
  const w = lon - dLon, e = lon + dLon, s = lat - dLat, n = lat + dLat;
  return {
    type: "Polygon",
    coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
  };
}

export default function ConsolePage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);

  const [mode, setMode] = useState<"site" | "point" | "file">("site");
  const [siteId, setSiteId] = useState("clearcut");
  const [lon, setLon] = useState("-63.92");
  const [lat, setLat] = useState("-11.02");
  const [size, setSize] = useState("6");
  const [profile, setProfile] = useState("fao");
  const [days, setDays] = useState("730");

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [disturbance, setDisturbance] = useState<Obs[] | null>(null);
  const [biomass, setBiomass] = useState<Biomass | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [upload, setUpload] = useState<Footprint | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.ok)
      .then((ok) => setOnline(ok))
      .catch(() => setOnline(false));
    fetch(`${API}/fixtures`)
      .then((r) => (r.ok ? (r.json() as Promise<{ fixtures: Site[] }>) : null))
      .then((j) => j && setSites(j.fixtures))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const geometry = useCallback((): unknown => {
    if (mode === "file") return upload?.geometry ?? null;
    if (mode === "site") {
      const s = sites.find((x) => x.id === siteId);
      if (!s) return null;
      const [w, so, e, n] = s.bbox;
      return { type: "Polygon", coordinates: [[[w, so], [e, so], [e, n], [w, n], [w, so]]] };
    }
    const L = Number(lon), A = Number(lat), K = Number(size);
    if (!Number.isFinite(L) || !Number.isFinite(A) || !(K > 0)) return null;
    if (Math.abs(A) > 51.6) setNote("Beyond 51.6° GEDI does not sample; biomass will decline.");
    return boxAround(L, A, K);
  }, [mode, siteId, sites, lon, lat, size, upload]);

  const run = async () => {
    const geom = geometry();
    if (!geom) {
      setNote("That area could not be read. Check the coordinates.");
      return;
    }
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;

    setPhase("running");
    setElapsed(0);
    setNote("");
    setEvidence(null);
    setDisturbance(null);
    setBiomass(null);
    setOpenRow(null);

    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - Number(days) * 864e5).toISOString().slice(0, 10);
    const post = <T,>(path: string, body: unknown): Promise<T> =>
      fetch(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      }).then((r) =>
        r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${path} ${r.status}`)),
      );

    // each block lands on its own; a slow biomass fit must not hold back the
    // evidence table that is already finished
    const jobs = [
      post<Evidence>("/plot", { geometry: geom, start, end, profile }).then(setEvidence),
      post<{ observations?: Obs[] } | Obs[]>("/disturbance", {
        geometry: geom,
        start,
        end,
      }).then((d) => setDisturbance(Array.isArray(d) ? d : (d.observations ?? []))),
      post<Biomass>("/biomass", { geometry: geom }).then(setBiomass),
    ];

    const settled = await Promise.allSettled(jobs);
    if (ctl.signal.aborted) return;
    const failed = settled.filter((s) => s.status === "rejected").length;
    setPhase(failed === settled.length ? "error" : "done");
    if (failed && failed < settled.length)
      setNote(`${failed} of 3 requests failed; what arrived is shown.`);
    if (failed === settled.length) setNote("The backend did not answer. Is it running?");
  };

  const takeFile = async (f: File) => {
    setUploading(true);
    setNote("");
    setUpload(null);
    try {
      const body = new FormData();
      body.append("file", f);
      const r = await fetch(`${API}/footprint`, { method: "POST", body });
      const j = (await r.json()) as Footprint & { detail?: string };
      // FastAPI puts the refusal reason in `detail`, and those reasons are
      // written for a reader ("this image carries no coordinate system")
      if (!r.ok) throw new Error(j.detail ?? `upload failed (${r.status})`);
      setUpload(j);
      if (!j.gedi_covered)
        setNote("Outside GEDI coverage (±51.6°): biomass will decline here.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const stop = () => {
    abort.current?.abort();
    setPhase("idle");
    setNote("Cancelled.");
  };

  const verdict = () => {
    const obs = disturbance ?? [];
    const conf = obs.find((o) => o.key === "alert_integrated_confirmed_fraction")
      ?? obs.find((o) => o.key === "alert_sar_confirmed_fraction");
    const prov = obs.find((o) => o.key === "alert_sar_provisional_fraction");
    const under = obs.find((o) => o.degradations?.length)?.degradations?.[0];
    if (!conf || typeof conf.value !== "number") return null;
    if (under)
      return { tone: "thin", line: "Nothing confirmed — the window is too short to be sure" };
    if (conf.value < 0.01)
      return {
        tone: "clear",
        line: "No disturbance confirmed in the window",
        sub: typeof prov?.value === "number" && prov.value > 0.01
          ? `${pct(prov.value)} crossed and did not hold — on stable forest that is speckle.`
          : undefined,
      };
    return { tone: "change", line: `${pct(conf.value)} of the area confirmed as disturbed` };
  };

  const v = verdict();
  const stock = biomass?.available ? biomass.aoi : undefined;

  return (
    <main className="rec con">
      <header className="rec-head">
        <Link className="brand" href="/" aria-label="SylvaSense">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M5 25V8l11 7 11-7v17L16 18Z" />
            <path d="M5 8l11 7V3M16 18v11" />
          </svg>
          <span>SylvaSense<span className="brand-dot">&#174;</span></span>
        </Link>
        <span className="meta rec-head-mid">THE CONSOLE</span>
        <span className="meta rec-stamp" data-live={online ? "yes" : "no"}>
          <i />
          {online === null ? "CONNECTING" : online ? "INSTRUMENT ONLINE" : "BACKEND UNREACHABLE"}
        </span>
      </header>

      <section className="con-top">
        <div>
          <p className="eyebrow">
            <i className="tiny-line" />
            RUN THE INSTRUMENT
          </p>
          <h1>
            Choose an area.
            <br />
            <em>Get the evidence.</em>
          </h1>
          <p className="rec-lede">
            This is the instrument itself, not a recording. Point it at one of
            the verified sites for an answer already on disk, or at ground it
            has never seen and watch it read the archive.
          </p>
          <dl className="rec-facts con-facts">
            <div>
              <dt>Independent sources</dt>
              <dd>7</dd>
            </div>
            <div>
              <dt>Verified sites</dt>
              <dd>{sites.length || "—"}</dd>
            </div>
            <div>
              <dt>Grid</dt>
              <dd>100 m</dd>
            </div>
            <div>
              <dt>Interval</dt>
              <dd>90%</dd>
            </div>
          </dl>
        </div>

        <form
          className="con-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (phase !== "running") void run();
          }}
        >
          <div className="con-modes" role="group" aria-label="Area source">
            <button type="button" aria-pressed={mode === "site"} onClick={() => setMode("site")}>
              Verified site
            </button>
            <button type="button" aria-pressed={mode === "point"} onClick={() => setMode("point")}>
              Coordinates
            </button>
            <button type="button" aria-pressed={mode === "file"} onClick={() => setMode("file")}>
              Upload
            </button>
          </div>

          {mode === "site" ? (
            <nav className="con-sites" aria-label="Verified sites">
              {sites.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={s.id === siteId ? "is-active" : ""}
                  aria-pressed={s.id === siteId}
                  onClick={() => setSiteId(s.id)}
                >
                  <span className="con-site-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="con-site-name">{s.name}</span>
                  <span
                    className="rec-dot"
                    data-state={s.state}
                    title={s.state === "confirmed" ? "confirmed" : "candidate"}
                  />
                </button>
              ))}
              {!sites.length && (
                <p className="con-cost">Waiting for the backend to list its sites…</p>
              )}
            </nav>
          ) : mode === "file" ? (
            <div className="con-upload">
              <label className="con-drop">
                <input
                  type="file"
                  accept=".tif,.tiff,.geotiff,.geojson,.json,.img,.vrt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void takeFile(f);
                  }}
                />
                <b>{uploading ? "Reading…" : "Choose a file"}</b>
                <small>GeoTIFF or GeoJSON · up to 64 MB</small>
              </label>
              {upload ? (
                <dl className="con-meta">
                  <div>
                    <dt>File</dt>
                    <dd>{upload.filename}</dd>
                  </div>
                  <div>
                    <dt>Covers</dt>
                    <dd>{upload.area_km2} km²</dd>
                  </div>
                  <div>
                    <dt>Centre</dt>
                    <dd>
                      {Math.abs(upload.centroid[1]).toFixed(3)}°{" "}
                      {upload.centroid[1] < 0 ? "S" : "N"},{" "}
                      {Math.abs(upload.centroid[0]).toFixed(3)}°{" "}
                      {upload.centroid[0] < 0 ? "W" : "E"}
                    </dd>
                  </div>
                  {upload.raster && (
                    <div>
                      <dt>Raster</dt>
                      <dd>
                        {upload.raster.width}×{upload.raster.height},{" "}
                        {upload.raster.bands} band{upload.raster.bands === 1 ? "" : "s"}
                        {upload.raster.pixel_m ? `, ${upload.raster.pixel_m} m` : ""}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="con-cost">
                  A georeferenced file already knows where it is. A plain JPEG or
                  PNG does not, and is refused rather than guessed at.
                </p>
              )}
              {upload?.note && <p className="con-cost">{upload.note}</p>}
            </div>
          ) : (
            <div className="con-row">
              <label className="con-field">
                <span>LONGITUDE</span>
                <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" />
              </label>
              <label className="con-field">
                <span>LATITUDE</span>
                <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
              </label>
              <label className="con-field">
                <span>SIZE (KM)</span>
                <input value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          )}

          <div className="con-row">
            <label className="con-field">
              <span>FOREST DEFINITION</span>
              <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="fao">FAO</option>
                <option value="eudr">EUDR</option>
              </select>
            </label>
            <label className="con-field">
              <span>WINDOW (DAYS)</span>
              <select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="365">365 — below the power gate</option>
                <option value="545">545</option>
                <option value="730">730 — recommended</option>
                <option value="1095">1095</option>
              </select>
            </label>
          </div>

          <div className="con-actions">
            {phase === "running" ? (
              <button type="button" className="con-run is-running" onClick={stop}>
                Cancel · {elapsed}s
              </button>
            ) : (
              <button type="submit" className="con-run" disabled={online === false || (mode === "file" && !upload)}>
                Run the analysis <span>→</span>
              </button>
            )}
            <p className="con-cost">
              {mode === "site"
                ? "Cached: this returns in milliseconds."
                : mode === "file" && !upload
                  ? "Choose a georeferenced file to continue."
                  : "Cold: expect two to five minutes while it reads the archive."}
            </p>
          </div>
          {note && <p className="con-note">{note}</p>}
        </form>
      </section>

      {phase === "idle" && !evidence && !disturbance && !biomass && (
        <section className="con-explain">
          <p className="eyebrow">
            <i className="tiny-line" />
            WHAT A RUN ACTUALLY DOES
          </p>
          <div className="con-explain-grid">
            {[
              [
                "01",
                "Convergence",
                "Seven sources, none of them decisive alone.",
                "C-band radar, L-band radar, optical, lidar and three land-cover products, each free to fail without taking the request down. Every value comes back with the sensor that produced it, the window it covers and the method behind it.",
                "Seconds once cached",
              ],
              [
                "02",
                "Change",
                "A drop has to persist before it counts.",
                "A harmonic baseline learns the site's own season, then each observation updates a per-pixel posterior. Crossings that do not hold stay provisional. Below its power threshold the detector confirms nothing and says so — the alternative was calling a national park clear-felled.",
                "Minutes on new ground",
              ],
              [
                "03",
                "Biomass",
                "An interval that was checked, not claimed.",
                "GEDI footprints are the calibration target; Sentinel features carry the estimate between them. Intervals come from split conformal over spatially blocked folds, and coverage is measured on blocks used for neither training nor calibration. Sometimes it fails, and the page shows it failing.",
                "Minutes on new ground",
              ],
            ].map(([n, title, claim, body, cost]) => (
              <article key={n as string}>
                <span className="con-explain-n">{n}</span>
                <h3>{title}</h3>
                <p className="con-explain-claim">{claim}</p>
                <p className="con-explain-body">{body}</p>
                <span className="meta con-explain-cost">{cost}</span>
              </article>
            ))}
          </div>
          <p className="con-explain-foot">
            Nothing here is precomputed for show. The six verified sites are
            cached because they have been run before, not because their answers
            were written down.
          </p>
        </section>
      )}

      {phase === "running" && (
        <section className="con-progress">
          <span className="meta">READING</span>
          <div className="con-bars">
            {[
              ["Evidence · 7 sources", evidence],
              ["Disturbance · Sentinel-1 + 2", disturbance],
              ["Biomass · GEDI calibration", biomass],
            ].map(([name, got]) => (
              <div key={String(name)} data-done={got ? "yes" : "no"}>
                <i />
                <span>{String(name)}</span>
                <b>{got ? "done" : "…"}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {(evidence || disturbance || biomass) && (
        <section className="con-out">
          <div className="rec-headline" data-uncalibrated={biomass?.available && biomass.usable === false ? "yes" : undefined}>
            {stock ? (
              <>
                <div className="rec-big">
                  <b>{num(stock.agbd_mean)}</b>
                  <small>Mg / ha</small>
                </div>
                <div className="rec-interval">
                  <span className="meta">{pct(stock.level)} INTERVAL</span>
                  <strong>
                    {num(stock.agbd_low)} – {num(stock.agbd_high)}
                  </strong>
                  <span className="meta">{num(stock.carbon_mean)} MgC/ha above ground</span>
                </div>
                {biomass?.usable === false && (
                  <p className="rec-uncalibrated">
                    This interval did not pass its calibration check
                    {biomass.fit
                      ? ` — it covered ${pct(biomass.fit.coverage.empirical, 1)} of held-out footprints against a nominal ${pct(biomass.fit.coverage.nominal)}`
                      : ""}
                    . Read the estimate, not the bounds.
                  </p>
                )}
              </>
            ) : biomass ? (
              <p className="rec-absent">
                <b>No biomass estimate here.</b>{" "}
                {biomass.reason?.replace(/^[A-Za-z]*(Error|Exception):\s*/, "") ??
                  "The backend did not say why."}
              </p>
            ) : null}
          </div>

          {v && (
            <section className="rec-block">
              <header>
                <h3>Change</h3>
                <span className="meta">{days} day window</span>
              </header>
              <p className={`rec-verdict rec-verdict-${v.tone}`}>{v.line}</p>
              {v.sub && <p className="rec-verdict-sub">{v.sub}</p>}
              <Rows rows={disturbance ?? []} open={openRow} onToggle={setOpenRow} />
            </section>
          )}

          {evidence && (
            <section className="rec-block">
              <header>
                <h3>Convergence</h3>
                <span className="meta">
                  {evidence.confidence
                    ? `${pct(evidence.confidence.score)} · ${evidence.confidence.basis}`
                    : ""}
                </span>
              </header>
              <Rows rows={evidence.observations ?? []} open={openRow} onToggle={setOpenRow} />
              <div className="rec-sources">
                {(evidence.sources ?? []).map((s) => (
                  <span key={s.source} data-av={s.availability}>
                    <i />
                    {s.source}
                    {s.reason ? <em> — {s.reason}</em> : null}
                  </span>
                ))}
              </div>
            </section>
          )}

          {biomass?.fit && (
            <section className="rec-block">
              <header>
                <h3>How this was checked</h3>
                <span className="meta">
                  {biomass.fit.gedi_footprints.toLocaleString()} GEDI footprints
                </span>
              </header>
              <div className="rec-gate" data-pass={biomass.fit.coverage.passes ? "yes" : "no"}>
                <span className="meta">CALIBRATION GATE</span>
                <strong>
                  {pct(biomass.fit.coverage.empirical, 1)} of held-out footprints fell inside the{" "}
                  {pct(biomass.fit.coverage.nominal)} interval
                </strong>
                <span className="meta">
                  {biomass.fit.coverage.n} shots on blocks the model never saw ·{" "}
                  {biomass.fit.coverage.passes ? "PASSES" : "FAILS"}
                </span>
              </div>
              {!!biomass.fit.caveats?.length && (
                <ul className="rec-caveats">
                  {biomass.fit.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </section>
      )}

      <footer className="rec-foot">
        <Link href="/">&larr; Return to the forest</Link>
        <span className="meta">SylvaSense · evidence, not verdicts · ORION PS-03</span>
        <Link href="/record">The six verified sites &#8599;</Link>
      </footer>
    </main>
  );
}

function Rows({
  rows,
  open,
  onToggle,
}: {
  rows: Obs[];
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
                {u && u.low != null && u.high != null ? `${num(u.low)} – ${num(u.high)}` : ""}
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

"use client";
import Brand from "../Brand";
import { Preview, PreviewKind } from "./previews";
import "./studies.css";

/**
 * Index for the scroll studies, written in the host application's own
 * selector vocabulary (.selector / .concept-grid / .concept-card) so the
 * section reads as part of SylvaSense rather than as an import.
 */

interface Entry {
  index: string;
  slug: string;
  name: string;
  line: string;
  kind: PreviewKind;
  tech: string;
  mechanic: string;
}

const DIRECTIONS: Entry[] = [
  {
    index: "01",
    slug: "01",
    name: "Ember",
    line: "A wall of leaves clears, a forest burns, and the ash reorganises itself into satellite pixels.",
    kind: "ember",
    tech: "Three.js · instancing · particle shaders",
    mechanic: "Elapsed destruction",
  },
  {
    index: "02",
    slug: "02",
    name: "Growth Rings",
    line: "A cross-section written one year at a time, which becomes the instrument that reads it from orbit.",
    kind: "rings",
    tech: "Canvas 2D · procedural dendrochronology",
    mechanic: "Time, radially",
  },
  {
    index: "03",
    slug: "03",
    name: "Night Watch",
    line: "The forest goes dark, something happens that you cannot see, and radar reveals it after the fact.",
    kind: "night",
    tech: "Three.js · point cloud · SAR shader",
    mechanic: "Light, then a radar sweep",
  },
  {
    index: "04",
    slug: "04",
    name: "Herbarium",
    line: "A museum of pressed specimens accelerates into an archive of absence, then digitises itself.",
    kind: "herbarium",
    tech: "CSS 3D · editorial typography · canvas plates",
    mechanic: "Travel through an archive",
  },
  {
    index: "05",
    slug: "05",
    name: "Enumeration",
    line: "One tree becomes two million, two million are subtracted, and the count resolves back to one.",
    kind: "enumeration",
    tech: "Three.js · 24k instances · exponential camera",
    mechanic: "Scale, in powers of ten",
  },
  {
    index: "06",
    slug: "06",
    name: "Roots",
    line: "The camera goes down instead of along, through the half of the forest that has never been photographed.",
    kind: "roots",
    tech: "Three.js · recursive root growth · soil particles",
    mechanic: "Depth below ground",
  },
  {
    index: "07",
    slug: "07",
    name: "The Stack",
    line: "Every observation since 1984 as a stacked slice, falling past you until you find the one where it ended.",
    kind: "stack",
    tech: "Three.js · instanced slices · procedural imagery",
    mechanic: "Depth through time",
  },
  {
    index: "08",
    slug: "08",
    name: "Vitals",
    line: "A forest breathing on a twelve-month cycle, twelve cells at once, until the rhythm goes wrong and then stops.",
    kind: "vitals",
    tech: "Three.js canopy · Canvas 2D waveforms",
    mechanic: "A physiological rhythm",
  },
  {
    index: "09",
    slug: "09",
    name: "Rain",
    line: "One circuit of the water a forest moves through the sky — ridden upward, and then watched break open.",
    kind: "rain",
    tech: "Three.js · one morphing particle system",
    mechanic: "Altitude, then a broken cycle",
  },
  {
    index: "10",
    slug: "10",
    name: "Seed",
    line: "Eighty years of succession on cleared ground, where the green comes back decades before the carbon does.",
    kind: "seed",
    tech: "Three.js · per-instance growth curves",
    mechanic: "Eighty years of growth",
  },
];

const MERGES: Entry[] = [
  {
    index: "11",
    slug: "11",
    name: "The Cube",
    line: "Climbs the spatial axis from one stem to orbit, then descends the time axis through every observation ever made.",
    kind: "m-cube",
    tech: "Enumeration 05 + The Stack 07",
    mechanic: "Scale, then time",
  },
  {
    index: "12",
    slug: "12",
    name: "Ash and Root",
    line: "Real fire footage takes the half of the forest you can photograph, then the ground opens and shows you the larger half.",
    kind: "m-ashroot",
    tech: "Ember 01 + Roots 06 · public-domain media",
    mechanic: "Destruction, then depth",
  },
  {
    index: "13",
    slug: "13",
    name: "The Return",
    line: "The water cycle opens, and then eighty years of replanting are attempted in the drier climate that made.",
    kind: "m-return",
    tech: "Rain 09 + Seed 10",
    mechanic: "A broken cycle, then recovery",
  },
  {
    index: "14",
    slug: "14",
    name: "The Record",
    line: "Three ways to keep a record of a forest — count its rings, press it, or leave it standing and watch.",
    kind: "m-record",
    tech: "Growth Rings 02 + Herbarium 04 + Night Watch 03",
    mechanic: "Three eras of observation",
  },
  {
    index: "15",
    slug: "15",
    name: "The Silent Alarm",
    line: "Twelve cells breathing on a monitor until six flatline — then the dark they stopped in, and the sensor that did not need light.",
    kind: "m-alarm",
    tech: "Vitals 08 + Night Watch 03",
    mechanic: "A rhythm, then a radar pass",
  },
  {
    index: "16",
    slug: "16",
    name: "Both Directions",
    line: "Two hundred and twenty-four rings read backwards off a dead stem, then eighty years written forwards on bare ground.",
    kind: "m-both",
    tech: "Growth Rings 02 + Seed 10",
    mechanic: "Time backwards, then forwards",
  },
  {
    index: "17",
    slug: "17",
    name: "Tinderbox",
    line: "The water cycle breaks first and the fire is the receipt — one fuel-moisture gauge runs from 128 % to 6 % across both acts.",
    kind: "m-tinder",
    tech: "Rain 09 + Ember 01",
    mechanic: "A water cycle, then combustion",
  },
  {
    index: "18",
    slug: "18",
    name: "Type Specimen",
    line: "A pressed leaf from 1857 resolves to its outline, the outline is one living stem, and the stem is one of two and a half million.",
    kind: "m-type",
    tech: "Herbarium 04 + Enumeration 05",
    mechanic: "An archive, then a census",
  },
  {
    index: "19",
    slug: "19",
    name: "Below the Record",
    line: "One continuous fall through every observation ever made of this hectare, and then through the nine metres nobody ever recorded.",
    kind: "m-below",
    tech: "The Stack 07 + Roots 06",
    mechanic: "Time down, then depth down",
  },
];

function Card({ e }: { e: Entry }) {
  return (
    <a className="concept-card study-card" href={`/study/${e.slug}`}>
      <div className="concept-preview">
        <Preview kind={e.kind} />
        <span className="preview-bottom">
          {e.index} / {e.mechanic}
        </span>
        <span className="preview-open" aria-hidden="true">
          ↗
        </span>
      </div>
      <div className="card-description">
        <div>
          <div className="card-title-line">
            <h2>{e.name}</h2>
            <span className="card-kind">{e.tech}</span>
          </div>
          <p>{e.line}</p>
        </div>
      </div>
    </a>
  );
}

export default function StudyIndex() {
  return (
    <main className="selector study-selector">
      <header className="selector-header">
        <Brand />
        <span className="meta">NINETEEN SCROLL STUDIES</span>
        <a className="index-link" href="/">
          The flagship <span>↗</span>
        </a>
      </header>

      <section className="selector-intro">
        <div>
          <p className="eyebrow">
            <span className="tiny-line" aria-hidden="true" />
            SYLVASENSE / ORION-PS-03 / STUDIES
          </p>
          <h1>
            Nineteen ways to
            <br />
            tell <em>one story.</em>
          </h1>
        </div>
        <p className="muted study-intro-note">
          Ten independent directions and nine merges built from them. Each is a working scroll
          experience rather than a mockup: no two share a scroll mechanic, a palette, a typographic
          voice or a rendering approach. All figures are plausible illustrative data.
        </p>
      </section>

      <div className="collection-heading">
        <span className="meta">TEN DIRECTIONS</span>
        <span className="meta">01 — 10</span>
      </div>
      <section className="concept-grid" aria-label="Ten independent scroll studies">
        {DIRECTIONS.map((e) => (
          <Card key={e.slug} e={e} />
        ))}
      </section>

      <div className="collection-heading study-heading-gap">
        <span className="meta">NINE MERGES</span>
        <span className="meta">11 — 19 · TWO AXES EACH</span>
      </div>
      <section className="concept-grid" aria-label="Nine merged scroll studies">
        {MERGES.map((e) => (
          <Card key={e.slug} e={e} />
        ))}
      </section>

      <footer className="selector-footer">
        <Brand />
        <span>DESKTOP · FULL WINDOW · SCROLL SLOWLY — EVERYTHING IS SCROLL-LINKED</span>
        <span>ILLUSTRATIVE DATA · NO LIVE IMAGERY · 2026</span>
      </footer>
    </main>
  );
}

/* eslint-disable @next/next/no-img-element -- Local, preloaded alpha sprites must preserve their transparent canvas textures. */
"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ASSETS,
  chapters,
  clamp,
  initialFrame,
  mix,
  smooth,
  treeLabel,
  trees,
} from "./model";
import type { Frame, Layer, WorldEngine } from "./model";
import type { createAmbient } from "./ambient";
import { useFieldData } from "./useFieldData";
import "./styles.css";

function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 26V12l10 7V4l12 9v13M5 21l10-7 12 8M15 4v24" />
    </svg>
  );
}
function Beat({
  start,
  end,
  motion = "rise",
  className = "",
  children,
}: {
  start: number;
  end: number;
  motion?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`lg-beat ${className}`}
      data-from={start}
      data-to={end}
      data-motion={motion}
      aria-hidden={start > 0}
      inert={start > 0}
      style={{ visibility: start > 0 ? "hidden" : "visible" }}
    >
      {children}
    </section>
  );
}
function Kicker({ children }: { children: ReactNode }) {
  return <p className="lg-kicker">{children}</p>;
}
const layerCopy = {
  optical: [
    "Reflected light.",
    "Canopy texture and vegetation signals. Clouds can hide the surface.",
  ],
  sar: [
    "Beyond the clouds.",
    "Radar backscatter adds structural context, day or night.",
  ],
  lidar: [
    "A third dimension.",
    "Laser returns reveal the vertical structure of the canopy.",
  ],
};

export default function TheLastGreen() {
  const root = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<WorldEngine | null>(null),
    state = useRef<Frame>({ ...initialFrame });
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(0),
    [fallback, setFallback] = useState(false),
    [menu, setMenu] = useState(false),
    [active, setActive] = useState(0);
  const [layer, setLayer] = useState<Layer>("optical"),
    [clouds, setClouds] = useState(true),
    [year, setYear] = useState(2025),
    [selected, setSelected] = useState(67),
    [carbon, setCarbon] = useState(false),
    [sound, setSound] = useState(false),
    [notes, setNotes] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  // Real measurements, when the backend can supply them. This never blocks
  // the scroll: until it resolves, every reading below falls back to the
  // constant the narrative was written with, labelled as illustrative.
  const field = useFieldData();
  const measured = field.biomass !== null;
  // Canopy cover across the slider. The backend supplies two real anchors -
  // the ESA WorldCover 2020 baseline, which is also the EUDR cut-off year,
  // and the fraction of the plot confirmed disturbed since. The years between
  // them are a straight line, which the method note says out loud rather than
  // letting the slider imply six annual measurements we do not have.
  const coverAt = (y: number) => {
    const t = (y - 2020) / 5;
    if (field.cover2020 === null) return 92.1 - t * 18.4;
    return field.cover2020 * 100 - t * (field.confirmed ?? 0) * 100;
  };
  const lostBy = (y: number) => coverAt(2020) - coverAt(y);
  const soundscape = useRef<ReturnType<typeof createAmbient> | null>(null);
  const readyRef = useRef(false);
  const motionOverride = useRef(false),
    pendingFocus = useRef<number | null>(null);
  const [fullMotion, setFullMotion] = useState(false);
  const chooseTree = useCallback((index: number) => {
    state.current.selected = index;
    setSelected(index);
  }, []);
  const jump = useCallback((p: number) => {
    setMenu(false);
    pendingFocus.current = p;
    window.scrollTo({
      top: p * (document.documentElement.scrollHeight - innerHeight),
      behavior: state.current.reduced ? "instant" : "smooth",
    });
  }, []);
  const selectLayer = (value: Layer) => {
    state.current.layer = value;
    setLayer(value);
  };
  const chooseYear = (value: number) => {
    state.current.year = value;
    setYear(value);
  };
  const toggleSound = async () => {
    try {
      if (!soundscape.current) {
        const { createAmbient } = await import("./ambient");
        soundscape.current = createAmbient();
      }
      setSound(await soundscape.current.toggle());
    } catch {
      setSound(false);
    }
  };
  useEffect(() => {
    if (menu)
      root.current
        ?.querySelector<HTMLButtonElement>("#lg-chapter-menu button")
        ?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    if (notes)
      root.current
        ?.querySelector<HTMLButtonElement>("#lg-study-notes button")
        ?.focus({ preventScroll: true });
  }, [notes]);
  const closeNotes = () => {
    setNotes(false);
    root.current
      ?.querySelector<HTMLButtonElement>(".lg-disclosure")
      ?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const host = root.current!;
    const surface = canvas.current!;
    let disposed = false,
      frame = 0,
      previous = 0,
      clock = 0,
      lastUI = 0,
      loadedAt = 0,
      target = 0,
      pointerX = 0,
      pointerY = 0,
      scrollExtent = 1;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(pointer: fine)");
    let reduce = media.matches;
    const beats = Array.from(
      host.querySelectorAll<HTMLElement>(".lg-beat"),
    ).map((el) => ({
      el,
      from: Number(el.dataset.from),
      to: Number(el.dataset.to),
      motion: el.dataset.motion,
    }));
    const leaves = Array.from(
      host.querySelectorAll<HTMLElement>(".lg-foliage img"),
    );
    const cursor = host.querySelector<HTMLElement>(".lg-cursor")!;
    const ruler = host.querySelector<HTMLElement>(".lg-progress-fill")!,
      counter = host.querySelector<HTMLElement>("[data-crown-count]")!,
      ashWords = Array.from(
        host.querySelectorAll<HTMLElement>(".lg-ash-words span"),
      );
    const rootStyle = document.documentElement.style;
    const previousScroll = rootStyle.scrollBehavior;
    rootStyle.scrollBehavior = "auto";
    const resize = () => {
      scrollExtent = Math.max(
        1,
        document.documentElement.scrollHeight - innerHeight,
      );
      target = clamp(scrollY / scrollExtent);
      state.current.mobile = innerWidth <= 760;
      engine.current?.resize();
    };
    const scroll = () => {
      scrollExtent = Math.max(
        1,
        document.documentElement.scrollHeight - innerHeight,
      );
      target = clamp(scrollY / scrollExtent);
    };
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(host);
    const preference = () => {
      reduce = media.matches && !motionOverride.current;
      state.current.reduced = reduce;
      host.dataset.reduced = String(reduce);
    };
    preference();
    resize();
    const pointer = (e: PointerEvent) => {
      if (!fine.matches) return;
      pointerX = (e.clientX / innerWidth - 0.5) * 2;
      pointerY = (e.clientY / innerHeight - 0.5) * 2;
      cursor.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      cursor.classList.toggle(
        "is-control",
        !!(e.target as HTMLElement).closest("button,a,input"),
      );
    };
    const pick = (e: MouseEvent) => {
      if (state.current.p < 0.62 || state.current.p > 0.725) return;
      const id = engine.current?.pick(e.clientX, e.clientY);
      if (id !== null && id !== undefined) chooseTree(id);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const notesOpen = !!host.querySelector("#lg-study-notes");
        setMenu(false);
        setNotes(false);
        host
          .querySelector<HTMLButtonElement>(
            notesOpen ? ".lg-disclosure" : ".lg-menu-button",
          )
          ?.focus({ preventScroll: true });
      }
      if (e.key === "Tab") host.classList.add("using-keyboard");
    };
    const visibility = () => {
      previous = 0;
      soundscape.current?.update(state.current.p, !document.hidden);
    };
    addEventListener("scroll", scroll, { passive: true });
    addEventListener("resize", resize);
    addEventListener("pointermove", pointer, { passive: true });
    addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", visibility);
    surface.addEventListener("click", pick);
    media.addEventListener("change", preference);
    let completed = 0;
    const complete = () => {
      completed++;
      if (!disposed) setLoading(Math.round((completed / 5) * 100));
    };
    const images = {} as Record<keyof typeof ASSETS, HTMLImageElement>;
    const tasks = Object.entries(ASSETS).map(
      ([key, url]) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            complete();
            resolve();
          };
          const timeout = setTimeout(finish, 8000);
          img.onload = () => {
            images[key as keyof typeof ASSETS] = img;
            finish();
          };
          img.onerror = finish;
          img.src = url;
        }),
    );
    const fonts = Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 6000)),
    ]).then(() => {
      complete();
    });
    const began = performance.now();
    let repeat = false;
    try {
      repeat = sessionStorage.getItem("sylvasense-entered") === "1";
    } catch {}
    const setup = async () => {
      await Promise.all([...tasks, fonts]);
      if (disposed) return;
      try {
        const { createWorld } = await import("./world");
        if (disposed) return;
        engine.current = createWorld(surface, images, host);
        engine.current.update(state.current);
      } catch {
        setFallback(true);
        host.dataset.webgl = "fallback";
      }
      complete();
      if (disposed) return;
      const delay = Math.max(
        0,
        (repeat || reduce ? 0 : 850) - (performance.now() - began),
      );
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (disposed) return;
      readyRef.current = true;
      loadedAt = performance.now();
      setReady(true);
      setHasLoaded(true);
      try {
        sessionStorage.setItem("sylvasense-entered", "1");
      } catch {}
    };
    void setup();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (document.hidden) return;
      preference();
      const dt = Math.min(0.05, previous ? (now - previous) / 1000 : 1 / 60);
      previous = now;
      clock += reduce ? 0 : dt;
      const f = state.current,
        old = f.p;
      f.p = reduce ? target : mix(f.p, target, 1 - Math.exp(-dt * 13));
      if (Math.abs(f.p - target) < 0.00001) f.p = target;
      f.velocity = mix(f.velocity, (f.p - old) / Math.max(0.001, dt), 0.08);
      f.pointerX = mix(f.pointerX, reduce ? 0 : pointerX, 0.04);
      f.pointerY = mix(f.pointerY, reduce ? 0 : pointerY, 0.04);
      f.time = clock;
      f.intro = readyRef.current
        ? reduce
          ? 1
          : smooth(now - loadedAt, 0, 1600)
        : 0;
      const p = f.p;
      host.style.setProperty("--story", String(p));
      host.style.setProperty("--intro", String(f.intro));
      host.style.setProperty("--technical", String(smooth(p, 0.36, 0.44)));
      host.style.setProperty("--forest-return", String(smooth(p, 0.945, 1)));
      for (const b of beats) {
        const incoming = b.from === 0 ? 1 : smooth(p, b.from, b.from + 0.017),
          outgoing = b.to >= 1 ? 0 : smooth(p, b.to - 0.022, b.to);
        const opacity = incoming * (1 - outgoing);
        const visible = opacity > 0.005;
        b.el.style.visibility = visible ? "visible" : "hidden";
        b.el.style.opacity = String(opacity);
        const interactive = opacity > 0.45;
        b.el.inert = !interactive;
        b.el.setAttribute("aria-hidden", String(!interactive));
        if (!visible) continue;
        let transform = "";
        const arrive = 1 - incoming;
        if (!reduce) {
          if (b.motion === "opening")
            transform = `perspective(1100px) translate3d(${f.pointerX * -6}px,${outgoing * -110 + arrive * 20}px,${outgoing * 380}px) rotateX(${outgoing * -8}deg)`;
          else if (b.motion === "pass")
            transform = `perspective(900px) translate3d(${-outgoing * 160}px,0,${outgoing * 500 - arrive * 240}px)`;
          else if (b.motion === "lateral")
            transform = `translate3d(${arrive * 95 - outgoing * 130}px,0,0)`;
          else if (b.motion === "cut")
            transform = `translate3d(0,${arrive * 45 + outgoing * 45}px,0) skewY(${outgoing * -3}deg)`;
          else transform = `translate3d(0,${arrive * 48 - outgoing * 45}px,0)`;
        }
        b.el.style.transform = transform;
        b.el.style.clipPath =
          b.motion === "cut"
            ? `inset(0 ${outgoing * 100}% 0 0)`
            : `inset(0 0 ${arrive * 11}% 0)`;
      }
      if (
        pendingFocus.current !== null &&
        Math.abs(p - pendingFocus.current) < 0.004
      ) {
        const destination = beats.find(
          (b) =>
            p >= b.from &&
            p < b.to &&
            b.el.className.indexOf("crown-label") === -1,
        );
        const heading = destination?.el.querySelector<HTMLElement>("h1,h2");
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
          pendingFocus.current = null;
        }
      }
      const fly = smooth(p, 0.009, 0.115),
        intro = 1 - f.intro;
      for (let i = 0; i < leaves.length; i++) {
        const dx = i % 2 ? -1 : 1,
          dy = i < 3 ? -1 : 1;
        leaves[i].style.transform =
          `translate3d(${dx * (fly * (120 + i * 14) + intro * 45) + f.pointerX * (i + 1) * 1.4}%,${dy * (fly * (100 + i * 10) + intro * 22) + f.pointerY * (i + 1)}%,${fly * 240}px) rotate(${dx * (fly * 48 + intro * 18) + Math.sin(clock * 0.19 + i) * 1.8}deg) scale(${1 + fly * 0.35})`;
        leaves[i].style.opacity = String(
          (1 - smooth(p, 0.085, 0.125)) * (0.65 + f.intro * 0.35),
        );
      }
      ashWords.forEach((el, i) => {
        const d = smooth(p, 0.354 + i * 0.003, 0.38 + i * 0.003);
        el.style.transform = `translate3d(${d * (i - 5) * 6}px,${d * -45}px,0) rotate(${d * (i % 2 ? 8 : -5)}deg)`;
        el.style.filter = `blur(${d * 8}px)`;
        el.style.opacity = String(1 - d);
      });
      ruler.style.transform = `scaleX(${p})`;
      counter.textContent = String(
        Math.round(144 * smooth(p, 0.623, 0.684)),
      ).padStart(3, "0");
      host.dataset.era =
        p < 0.39 ? "forest" : p < 0.92 ? "observatory" : "future";
      engine.current?.update(f);
      if (now - lastUI > 140) {
        lastUI = now;
        const chapter = chapters.reduce(
          (value, c, i) => (p >= c.at ? i : value),
          0,
        );
        setActive((v) => (v === chapter ? v : chapter));
        soundscape.current?.update(p, true);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      sizeObserver.disconnect();
      cancelAnimationFrame(frame);
      removeEventListener("scroll", scroll);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", pointer);
      removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", visibility);
      surface.removeEventListener("click", pick);
      media.removeEventListener("change", preference);
      engine.current?.dispose();
      engine.current = null;
      soundscape.current?.dispose();
      soundscape.current = null;
      rootStyle.scrollBehavior = previousScroll;
      readyRef.current = false;
    };
  }, [chooseTree]);
  const tree = trees[selected];
  return (
    <main
      ref={root}
      className={`last-green-flagship ${ready ? "is-ready" : ""} ${fallback ? "is-fallback" : ""}`}
      aria-busy={!ready}
    >
      <a
        className="lg-skip"
        href="#evidence"
        onClick={(e) => {
          e.preventDefault();
          jump(0.475);
        }}
      >
        Skip to the evidence
      </a>
      <div className="lg-stage">
        <div className="lg-static-forest" />
        <canvas
          ref={canvas}
          className="lg-world"
          role="img"
          aria-label="A forest resolving into a three-dimensional Earth observation survey"
        />
        <div className="lg-film-grain" aria-hidden="true" />
        <header className="lg-header">
          <button
            className="lg-brand"
            onClick={() => jump(0)}
            aria-label="SylvaSense, return to beginning"
          >
            <Mark />
            <span>SylvaSense</span>
          </button>
          <span className="lg-edition">
            THE LAST GREEN <span>/</span> A LIVING RECORD
          </span>
          <div className="lg-header-actions">
            <button
              className="lg-sound"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={sound ? "Mute ambient sound" : "Enable ambient sound"}
            >
              <span
                className={sound ? "lg-sound-bars playing" : "lg-sound-bars"}
              >
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>Sound {sound ? "on" : "off"}</span>
            </button>
            <button
              className="lg-menu-button"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-controls="lg-chapter-menu"
            >
              {menu ? "Close" : "Index"}
              <span>{menu ? "−" : "+"}</span>
            </button>
          </div>
        </header>
        {menu && (
          <nav
            id="lg-chapter-menu"
            className="lg-chapter-menu"
            aria-label="Journey index"
          >
            <p className="lg-kicker">THE LAST GREEN / FIELD INDEX</p>
            {chapters.map((c, i) => (
              <button
                key={c.label}
                onClick={() => jump(c.at === 0 ? 0 : c.at + 0.025)}
                aria-current={active === i ? "step" : undefined}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {c.label}
                <small>{c.act}</small>
              </button>
            ))}
          </nav>
        )}
        <div className="lg-narrative">
          <Beat start={0} end={0.115} motion="opening" className="lg-opening">
            <Kicker>FORESTS ARE NOT A BACKDROP.</Kicker>
            <h1>
              <span>The last</span>
              <em>green.</em>
            </h1>
            <div className="lg-opening-bottom">
              <p>
                A living world. <br />A disappearing one. <br />A different way
                to see.
              </p>
              <button className="lg-enter" onClick={() => jump(0.122)}>
                Enter the forest <span>↓</span>
              </button>
              <span className="lg-opening-note">
                AN IMMERSIVE FIELD STUDY <br />
                BY SYLVASENSE
              </span>
            </div>
          </Beat>
          <Beat start={0.102} end={0.182} motion="lateral" className="lg-life">
            <Kicker>01 / BEFORE THE ABSENCE</Kicker>
            <h2>
              Nothing here <br />
              exists <em>alone.</em>
            </h2>
            <p className="lg-copy">
              A canopy of connections. <br />
              Holding water. Making shelter. Storing carbon.
            </p>
            <div className="lg-quiet-coordinate">
              THE LIVING FOREST <span>—</span> LOOK CLOSER
            </div>
          </Beat>
          <Beat start={0.17} end={0.265} motion="cut" className="lg-loss">
            <Kicker>02 / THE FIRST ABSENCE</Kicker>
            <h2>
              One cut. <br />
              Then <em>another.</em>
            </h2>
            <p className="lg-copy">
              The gaps arrive quietly. <br />
              The consequences travel further.
            </p>
            <span className="lg-loss-rule" />
          </Beat>
          <Beat start={0.254} end={0.329} motion="lateral" className="lg-heat">
            <Kicker>03 / A DIFFERENT KIND OF LIGHT</Kicker>
            <h2>
              What held the light <br />
              <em>becomes it.</em>
            </h2>
            <p className="lg-copy">Leaves. Heat. Embers. Ash.</p>
          </Beat>
          <Beat start={0.318} end={0.397} motion="still" className="lg-silence">
            <Kicker>04 / LET THE SILENCE SETTLE</Kicker>
            <h2 className="lg-ash-words" aria-label="What remains?">
              <span aria-hidden="true">What</span>{" "}
              <em aria-hidden="true">
                {"remains?".split("").map((c, i) => (
                  <span key={i}>{c}</span>
                ))}
              </em>
            </h2>
            <p className="lg-copy">Absence is a signal, too.</p>
          </Beat>
          <Beat start={0.388} end={0.464} motion="pass" className="lg-vision">
            <Kicker>A DIFFERENT VISION</Kicker>
            <h2>
              Begin <br />
              to <em>see.</em>
            </h2>
            <p className="lg-copy">
              The same world. <br />
              Now, a world we can read.
            </p>
          </Beat>
          <Beat
            start={0.448}
            end={0.547}
            motion="lateral"
            className="lg-observation"
          >
            <Kicker>05 / BEYOND THE VISIBLE</Kicker>
            <h2>
              One forest. <br />
              Different <em>truths.</em>
            </h2>
            <div
              id="evidence"
              className="lg-layer-controls"
              role="group"
              aria-label="Observation layer"
            >
              {(["optical", "sar", "lidar"] as Layer[]).map((l, i) => (
                <button
                  key={l}
                  aria-pressed={layer === l}
                  onClick={() => selectLayer(l)}
                >
                  <span>0{i + 1}</span>
                  {l === "sar" ? "SAR" : l === "lidar" ? "LiDAR" : "Optical"}
                  <i />
                </button>
              ))}
            </div>
            <p className="lg-sensor-copy">
              <strong>{layerCopy[layer][0]}</strong>
              {layerCopy[layer][1]}
            </p>
            <button
              className="lg-cloud-control"
              aria-pressed={clouds}
              onClick={() => {
                setClouds(!clouds);
                state.current.clouds = !clouds;
              }}
            >
              Cloud cover <span>{clouds ? "On" : "Off"}</span>
            </button>
          </Beat>
          <Beat start={0.535} end={0.632} motion="rise" className="lg-fusion">
            <Kicker>06 / NO SINGLE SENSOR TELLS THE WHOLE STORY</Kicker>
            <h2>
              Many signals. <br />
              One <em>understanding.</em>
            </h2>
            <p className="lg-copy">
              Reflectance. Backscatter. Structure. Time. <br />
              Aligned around the same living system.
            </p>
            <div className="lg-fusion-caption">
              <span>OPTICAL</span>
              <i>+</i>
              <span>SAR</span>
              <i>+</i>
              <span>LiDAR</span>
              <i>+</i>
              <span>TIME</span>
            </div>
          </Beat>
          <Beat
            start={0.621}
            end={0.733}
            motion="lateral"
            className="lg-detection"
          >
            <Kicker>07 / THE FOREST HAS INDIVIDUALS</Kicker>
            <h2>
              Every crown. <br />A living <em>coordinate.</em>
            </h2>
            <div className="lg-enumeration">
              <strong data-crown-count>000</strong>
              <span>
                MODELED CROWNS <br />
                {field.site
                  ? field.site.name.toUpperCase()
                  : "RONDONIA, BRAZIL"}
              </span>
            </div>
            <p className="lg-copy">
              High-resolution imagery meets canopy structure. <br />
              Select a crown to inspect its place in the forest.
            </p>
            <button
              className="lg-text-button"
              onClick={() => chooseTree((selected + 13) % 144)}
            >
              Inspect another crown <span>↗</span>
            </button>
          </Beat>
          <Beat
            start={0.625}
            end={0.73}
            motion="rise"
            className="lg-crown-label"
          >
            <div data-world-anchor="tree">
              <span className="lg-anchor-stem" />
              <b>{treeLabel(selected)}</b>
              <p>
                {(tree.height * 10).toFixed(1)} m <span>CANOPY HEIGHT</span>
              </p>
              <p>
                {Math.round(tree.confidence * 100)}%{" "}
                <span>MODEL CONFIDENCE</span>
              </p>
            </div>
          </Beat>
          <Beat start={0.72} end={0.822} motion="lateral" className="lg-carbon">
            <Kicker>08 / THE WEIGHT OF GREEN</Kicker>
            <h2>
              More than <br />
              meets the <em>eye.</em>
            </h2>
            <div
              className="lg-stock-switch"
              role="group"
              aria-label="Forest stock estimate"
            >
              <button
                aria-pressed={!carbon}
                onClick={() => {
                  setCarbon(false);
                  state.current.carbon = false;
                }}
              >
                Biomass
              </button>
              <button
                aria-pressed={carbon}
                onClick={() => {
                  setCarbon(true);
                  state.current.carbon = true;
                }}
              >
                Carbon stock
              </button>
            </div>
            <div className="lg-stock">
              <strong>
                {measured
                  ? (carbon
                      ? field.biomass!.carbon
                      : field.biomass!.mean
                    ).toFixed(1)
                  : carbon
                    ? "77.2"
                    : "164.2"}
              </strong>
              <span>{carbon ? "Mg C / ha" : "Mg / ha"}</span>
            </div>
            <p className="lg-copy">
              {carbon
                ? "Carbon held in aboveground biomass."
                : "An estimate of aboveground dry biomass."}{" "}
              <br />
              {carbon
                ? "A stock estimate, not annual sequestration."
                : "Structure, density, and calibrated relationships."}
            </p>
            <p className="lg-method-note">
              {measured ? (
                carbon ? (
                  <>
                    {field.live ? "LIVE" : "MEASURED"} · AGBD ×0.47 CARBON
                    FRACTION · A STOCK, NOT A FLUX
                  </>
                ) : (
                  <>
                    {field.live ? "LIVE" : "MEASURED"} · GEDI L4A ×{" "}
                    {field.footprints?.toLocaleString() ?? "—"} FOOTPRINTS ·{" "}
                    {(field.biomass!.level * 100).toFixed(0)}% INTERVAL{" "}
                    {field.biomass!.low.toFixed(1)}–
                    {field.biomass!.high.toFixed(1)} Mg/ha
                    {field.biomass!.calibrated ? "" : " · INTERVAL UNCALIBRATED"}
                  </>
                )
              ) : (
                <>
                  AWAITING THE BACKEND ·{" "}
                  {carbon
                    ? "CARBON FRACTION 0.47"
                    : "FIGURE NOT YET MEASURED"}
                </>
              )}
            </p>
          </Beat>
          <Beat start={0.809} end={0.92} motion="rise" className="lg-time">
            <Kicker>09 / WHAT CHANGES BETWEEN THE IMAGES</Kicker>
            <h2>
              The years leave <br />a <em>trace.</em>
            </h2>
            <div className="lg-time-reading">
              <strong>
                {coverAt(year).toFixed(1)}
                <small>%</small>
              </strong>
              <span>
                CANOPY COVER <br />
                {year === 2020
                  ? "BASELINE / 2020"
                  : `−${lostBy(year).toFixed(1)} PERCENTAGE POINTS / VS 2020`}
              </span>
            </div>
            <p className="lg-copy">
              The ghost canopy holds the past. <br />
              Move through time to see what remains.
            </p>
            <p className="lg-method-note">
              {field.cover2020 !== null ? (
                <>
                  {field.live ? "LIVE" : "MEASURED"} · 2020 BASELINE FROM ESA
                  WORLDCOVER · {((field.confirmed ?? 0) * 100).toFixed(1)}% OF
                  THE PLOT CONFIRMED DISTURBED BY SENTINEL-1 AND -2 ·
                  INTERMEDIATE YEARS INTERPOLATED
                </>
              ) : (
                <>AWAITING THE BACKEND · SERIES NOT YET MEASURED</>
              )}
            </p>
            <div className="lg-time-control">
              <label htmlFor="forest-year">
                YEAR <output>{year}</output>
              </label>
              <input
                id="forest-year"
                type="range"
                min="2020"
                max="2025"
                step="1"
                value={year}
                onChange={(e) => chooseYear(Number(e.target.value))}
              />
              <div>
                {[2020, 2021, 2022, 2023, 2024, 2025].map((y) => (
                  <button
                    key={y}
                    aria-label={`Show ${y}`}
                    aria-pressed={y === year}
                    onClick={() => chooseYear(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </Beat>
          <Beat start={0.909} end={1} motion="rise" className="lg-ending">
            <Kicker>10 / WHAT WE CHOOSE TO KEEP</Kicker>
            <h2>
              A future. <br />
              <em>Still possible.</em>
            </h2>
            <p className="lg-copy">Seen. Understood. Worth protecting.</p>
            <div className="lg-intervention">
              <Link href="/console">
                Analyse an area
                <span>↗</span>
              </Link>
              <p>Any boundary. The evidence comes back with its sources.</p>
            </div>
            <div className="lg-end-wordmark">
              <Mark />
              <span>SylvaSense</span>
              <small>FOREST INTELLIGENCE</small>
            </div>
            <Link className="lg-end-primary" href="/record">
              <span className="lg-end-primary-eyebrow">
                THE SCROLL ENDS / THE INSTRUMENT DOES NOT
              </span>
              <strong>
                Open the live record <i>↗</i>
              </strong>
              <small>
                Six real sites, read from Sentinel-1, Sentinel-2 and GEDI —
                with the uncertainty left in.
              </small>
            </Link>
            <div className="lg-end-links">
              <button onClick={() => jump(0.477)}>
                Explore the evidence again ↗
              </button>
              <button onClick={() => jump(0)}>Return to the forest ↑</button>
            </div>
          </Beat>
        </div>
        <div className="lg-layer-labels" aria-hidden="true">
          {[
            "OPTICAL / REFLECTANCE",
            "SAR / BACKSCATTER",
            "LiDAR / STRUCTURE",
            "TEMPORAL / CHANGE",
          ].map((l, i) => (
            <span key={l} data-world-anchor={`layer-${i}`}>
              <b>{l.split(" / ")[0]}</b>
              <small> / {l.split(" / ")[1]}</small>
              <i />
            </span>
          ))}
        </div>
        <div className="lg-foliage" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <img
              key={i}
              src={ASSETS.leaf}
              alt=""
              className={`lg-leaf-${i}`}
              draggable="false"
            />
          ))}
        </div>
        <div className="lg-edge-note" aria-hidden="true">
          <span>FIELD RECORD</span>
          <i />
          <span>
            {active < 3
              ? "LIVING SYSTEM"
              : active < 8
                ? (field.site?.name.toUpperCase() ?? "FIELD SURVEY")
                : "CONTINUITY"}
          </span>
        </div>
        <footer className="lg-footer">
          <button
            className="lg-chapter-current"
            onClick={() => setMenu(!menu)}
            aria-label="Open journey index"
          >
            <span>{String(active + 1).padStart(2, "0")}</span>
            <i />
            {chapters[active].label}
          </button>
          <span className="lg-scroll-cue">
            {chapters[active].cue} <b>↓</b>
          </span>
          <button
            className="lg-disclosure"
            onClick={() => setNotes(!notes)}
            aria-expanded={notes}
            aria-controls="lg-study-notes"
          >
            {measured
              ? field.live
                ? "Live measurements"
                : `Measured · ${field.generated ?? ""}`
              : "Awaiting the backend"}{" "}
            <span>ⓘ</span>
          </button>
        </footer>
        <div className="lg-progress" aria-hidden="true">
          <div className="lg-progress-fill" />
          {chapters.map((c) => (
            <i key={c.label} style={{ left: `${c.at * 100}%` }} />
          ))}
        </div>
        {notes && (
          <aside id="lg-study-notes" className="lg-study-notes">
            <button onClick={closeNotes} aria-label="Close study notes">
              ×
            </button>
            <Kicker>ABOUT THIS FIELD STUDY</Kicker>
            <h3>
              A real question. <br />
              <em>
                {measured
                  ? "Real measurements."
                  : "Waiting on the instrument."}
              </em>
            </h3>
            {measured ? (
              <>
                <p>
                  The forest you are looking at is a rendering. The numbers are
                  not. Biomass, the 2020 canopy baseline and the change since
                  are measured over {field.site?.name ?? "the survey tile"}
                  {field.site
                    ? ` (${Math.abs(field.site.centroid[1]).toFixed(2)}° ${
                        field.site.centroid[1] < 0 ? "S" : "N"
                      }, ${Math.abs(field.site.centroid[0]).toFixed(2)}° ${
                        field.site.centroid[0] < 0 ? "W" : "E"
                      })`
                    : ""}
                  , from {field.scenes.sar ?? "—"} Sentinel-1 scenes,{" "}
                  {field.scenes.optical ?? "—"} Sentinel-2 scenes and{" "}
                  {field.footprints?.toLocaleString() ?? "—"} GEDI
                  footprints across {field.sources ?? "—"} independent
                  sources.
                </p>
                <p>
                  Individual crowns remain illustrative: 10 m pixels do not
                  resolve them, and that needs sub-metre imagery or airborne
                  LiDAR. Every measured figure carries its interval, and the
                  full record with provenance is one page away.
                </p>
              </>
            ) : (
              <>
                <p>
                  The backend is not answering, so the readings on screen are
                  placeholders and are labelled as such. Start the API and they
                  are replaced by measurements.
                </p>
                <p>
                  Sentinel-scale optical and SAR provide landscape context.
                  Individual crowns require finer imagery or dense airborne
                  LiDAR. Biomass requires calibrated models and uncertainty
                  assessment.
                </p>
              </>
            )}
            <button
              className="lg-motion-choice"
              aria-pressed={fullMotion}
              onClick={() => {
                motionOverride.current = !fullMotion;
                setFullMotion(!fullMotion);
              }}
            >
              {fullMotion
                ? "Motion: full experience"
                : "Motion: follow device setting"}
              <span>
                {fullMotion ? "Use device setting" : "Enable full motion"}
              </span>
            </button>
            <a
              href="https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-1"
              target="_blank"
              rel="noreferrer"
            >
              Radar observation / ESA ↗
            </a>
            <a
              href="https://gedi.umd.edu/dataproducts/products/"
              target="_blank"
              rel="noreferrer"
            >
              Forest structure & biomass / GEDI ↗
            </a>
          </aside>
        )}
        <p className="lg-fallback-note" role="status">
          The 3D survey is unavailable on this device. The study and its
          controls remain available.
        </p>
        <div className="lg-cursor" aria-hidden="true">
          <i />
        </div>
      </div>
      <div
        className={`lg-loader ${ready ? "is-opening" : ""}`}
        aria-hidden={hasLoaded}
      >
        <div className="lg-loader-door left" />
        <div className="lg-loader-door right" />
        <div className="lg-loader-center">
          <Mark />
          <span className="lg-loader-label">
            A LIVING WORLD, COMING INTO FOCUS
          </span>
          <div className="lg-loader-topology" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <i
                key={i}
                style={{
                  transform: `scale(${0.35 + i * 0.13}) rotate(${i * 7}deg)`,
                }}
              />
            ))}
          </div>
          <span className="lg-loader-number">
            {String(loading).padStart(2, "0")}
            <small>/ 100</small>
          </span>
          <div className="lg-loader-track">
            <i style={{ transform: `scaleX(${loading / 100})` }} />
          </div>
          <p role="status">
            {loading < 100 ? "Gathering the light" : "Step into the green"}
          </p>
        </div>
      </div>
      <noscript>
        <div className="lg-no-script">
          The Last Green is an interactive forest study. Enable JavaScript to
          explore the journey.
        </div>
      </noscript>
    </main>
  );
}

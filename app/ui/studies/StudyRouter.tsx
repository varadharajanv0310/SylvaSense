"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import "./studies.css";

/**
 * A study takes over the whole viewport and drives its own scroll engine, so
 * the host application's page chrome and smooth-scroll behaviour are suspended
 * while one is mounted (see the `study-mode` rules in studies.css).
 */

const loader = () => (
  <div className="study-loader">
    <span className="micro">Compositing scene…</span>
  </div>
);

const opts = { ssr: false, loading: loader };

const STUDIES: Record<string, ReturnType<typeof dynamic>> = {
  "01": dynamic(() => import("./01-ember/Ember"), opts),
  "02": dynamic(() => import("./02-rings/Rings"), opts),
  "03": dynamic(() => import("./03-nightwatch/NightWatch"), opts),
  "04": dynamic(() => import("./04-herbarium/Herbarium"), opts),
  "05": dynamic(() => import("./05-enumeration/Enumeration"), opts),
  "06": dynamic(() => import("./06-roots/Roots"), opts),
  "07": dynamic(() => import("./07-stack/Stack"), opts),
  "08": dynamic(() => import("./08-vitals/Vitals"), opts),
  "09": dynamic(() => import("./09-rain/Rain"), opts),
  "10": dynamic(() => import("./10-seed/Seed"), opts),
  "11": dynamic(() => import("./merged/Cube"), opts),
  "12": dynamic(() => import("./merged/AshAndRoot"), opts),
  "13": dynamic(() => import("./merged/TheReturn"), opts),
  "14": dynamic(() => import("./merged/TheRecord"), opts),
  "15": dynamic(() => import("./merged/SilentAlarm"), opts),
  "16": dynamic(() => import("./merged/BothDirections"), opts),
  "17": dynamic(() => import("./merged/Tinderbox"), opts),
  "18": dynamic(() => import("./merged/TypeSpecimen"), opts),
  "19": dynamic(() => import("./merged/BelowTheRecord"), opts),
};

export const STUDY_IDS = Object.keys(STUDIES);

export default function StudyRouter({ id }: { id: string }) {
  useEffect(() => {
    document.body.classList.add("study-mode");
    return () => {
      document.body.classList.remove("study-mode");
      // the study engine writes progress to the document root
      document.documentElement.style.removeProperty("--p");
    };
  }, []);

  const Study = STUDIES[id];
  if (!Study) return null;
  return <Study />;
}

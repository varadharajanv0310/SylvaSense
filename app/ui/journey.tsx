"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Brand from "./Brand";
import { concepts, clamp } from "./data";

export function useJourney() {
  const [progress,setProgress]=useState(0);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)");
    const preference=()=>setReduced(media.matches); preference(); media.addEventListener("change",preference);
    let request=0;
    const update=()=>{ cancelAnimationFrame(request);request=requestAnimationFrame(()=>setProgress(clamp(window.scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)))); };
    addEventListener("scroll",update,{passive:true});addEventListener("resize",update);update();
    return()=>{removeEventListener("scroll",update);removeEventListener("resize",update);media.removeEventListener("change",preference);cancelAnimationFrame(request);};
  },[]);
  const jump=useCallback((scene:number)=>window.scrollTo({top:scene===0?0:(document.documentElement.scrollHeight-innerHeight)*(scene/6+.025),behavior:reduced?"instant":"smooth"}),[reduced]);
  return {progress, stage:Math.min(5,Math.floor(progress*6)), jump,reduced};
}
export function Chrome({id,progress,jump}:{id:string;progress:number;jump:(n:number)=>void}){
  const [open,setOpen]=useState(false);const c=concepts[Number(id)-1];const stage=Math.min(5,Math.floor(progress*6));
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[]);
  return <><header className="experience-header"><Brand/><span className="experience-title meta">{id} / {c.name}</span><button className="all-concepts" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="concept-menu">{open?"Close":"All concepts"}<span>{open?"×":"☰"}</span></button></header>
  {open&&<nav id="concept-menu" className="concept-menu" aria-label="Concepts"><a className="menu-back" href="/concepts">↙ Back to collection</a>{concepts.map(x=><a key={x.id} href={`/concept-${x.id}`} aria-current={x.id===id?"page":undefined}><span>{x.id}</span>{x.name}<span>↗</span></a>)}</nav>}
  <nav className="chapter-nav" aria-label="Story chapters">{c.words.map((word,i)=><button key={word} onClick={()=>jump(i)} aria-current={stage===i?"step":undefined} aria-label={`Chapter ${i+1}: ${word}`}><span className="chapter-mark"/><span className="chapter-label">{word}</span></button>)}</nav>
  <footer className="experience-footer"><span className="meta">{String(stage+1).padStart(2,"0")} <span className="footer-rule"/> {c.words[stage]}</span><span className="scroll-instruction meta">{progress>.94?"A FOREST WORTH SEEING":"SCROLL TO "+(id==="03"?"TURN THE ARCHIVE":id==="02"?"CHANGE ALTITUDE":id==="04"?"TRACE THE ECHO":"CONTINUE THE STORY")} {progress>.94?"":"↓"}</span><span className="simulation-label">SIMULATED STUDY</span></footer><div className="journey-progress" style={{transform:`scaleX(${progress})`}}/></>;
}
export function Scene({progress,index,children,className=""}:{progress:number;index:number;children:ReactNode;className?:string}){
  const position=progress*6-index;
  const opacity=index===0?clamp((1-position)*5):clamp(position*7)*clamp((1-position)*6);
  const finalOpacity=index===5?clamp(position*6):opacity;
  return <section className={`story-scene ${className}`} aria-hidden={finalOpacity<.5} inert={finalOpacity<.5} style={{opacity:finalOpacity,visibility:finalOpacity<.01?"hidden":"visible",transform:`translateY(${(1-clamp(position*5))*28-clamp((position-.8)*5)*20}px)`,pointerEvents:finalOpacity>.5?"auto":"none"} as CSSProperties}>{children}</section>;
}
export function EndLinks({id}:{id:string}) { const next=Number(id)%5+1; return <div className="end-links"><a href={`/concept-0${next}`}>Next perspective <span>↗</span></a><a href="/concepts">Return to collection</a></div>; }
export function Film({active=true,className=""}:{active?:boolean;className?:string}) {
  const ref=useRef<HTMLVideoElement>(null);const [failed,setFailed]=useState(false);
  useEffect(()=>{const video=ref.current;if(!video)return;const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;const sync=()=>{if(active&&!reduce&&!document.hidden)video.play().catch(()=>{});else video.pause();};sync();document.addEventListener("visibilitychange",sync);return()=>document.removeEventListener("visibilitychange",sync);},[active]);
  return <div className={`film ${className}`}><img src="/media/poster.jpg" alt="Aerial view of an uninterrupted forest canopy"/>{!failed&&<video ref={ref} muted playsInline loop preload="metadata" poster="/media/poster.jpg" onError={()=>setFailed(true)}><source src="/media/forest.mp4" type="video/mp4"/></video>}</div>;
}

"use client";
import { useEffect, useState } from "react";
import Brand from "../Brand";
export const forestStories = [
  {id:"06", number:"01", name:"The Last Green", theme:"Fire & memory", line:"First the leaves. Then the silence.", chapters:["Leaves","Life","The cut","Fire","Ash","Witness"]},
  {id:"07", number:"02", name:"A Forest Holds the Rain", theme:"Water & survival", line:"Follow one drop into a hidden world.", chapters:["Rain","Canopy","Below","Thirst","Listen","Return"]},
  {id:"08", number:"03", name:"The Space Between Trees", theme:"Separation & belonging", line:"A forest is more than its trees.", chapters:["Together","A line","Islands","Distance","Reconnect","Belong"]},
];
export function ForestChrome({id,progress,jump}:{id:string;progress:number;jump:(n:number)=>void}) {
  const [open,setOpen]=useState(false);const story=forestStories.find(s=>s.id===id)!;const stage=Math.min(5,Math.floor(progress*6));
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};addEventListener("keydown",escape);return()=>removeEventListener("keydown",escape);},[]);
  return <><header className="experience-header forest-header"><Brand/><span className="experience-title meta">{story.number} / {story.name}</span><button className="all-concepts" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="forest-menu">{open?"Close":"Three stories"}<span>{open?"×":"☰"}</span></button></header>
  {open&&<nav className="concept-menu" id="forest-menu" aria-label="Forest stories"><a className="menu-back" href="/concepts">↙ The collection</a>{forestStories.map(s=><a key={s.id} href={`/concept-${s.id}`} aria-current={id===s.id?"page":undefined}><span>{s.number}</span>{s.name}<span>↗</span></a>)}</nav>}
  <nav className="chapter-nav" aria-label="Story chapters">{story.chapters.map((c,i)=><button key={c} onClick={()=>jump(i)} aria-label={`Chapter ${i+1}: ${c}`} aria-current={stage===i?"step":undefined}><span className="chapter-mark"/><span className="chapter-label">{c}</span></button>)}</nav>
  <footer className="experience-footer forest-footer"><span className="meta">{String(stage+1).padStart(2,"0")}<span className="footer-rule"/>{story.chapters[stage]}</span><span className="scroll-instruction meta">{progress>.95?"SCROLL BACK TO RETURN":"SCROLL TO CHANGE THE WORLD ↓"}</span><span className="simulation-label">ILLUSTRATIVE FOREST STUDY</span></footer><div className="journey-progress" style={{transform:`scaleX(${progress})`}}/></>;
}
export function ForestEnd({id,replay}:{id:string;replay:()=>void}) {const index=forestStories.findIndex(s=>s.id===id);const next=forestStories[(index+1)%3];return <div className="forest-end"><a href={`/concept-${next.id}`}>Next story <span>↗</span></a><button onClick={replay}>Experience again ↺</button><a href="/concepts">The collection</a></div>;}

"use client";
import {useEffect,useRef,useState} from "react";
import {Chrome,EndLinks,useJourney} from "../journey";
import {clamp,random,range} from "../data";

function ArchiveRings({progress:p,layer}:{progress:number;layer:number}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const canvas=ref.current!,ctx=canvas.getContext("2d");if(!ctx)return;const w=canvas.width=canvas.clientWidth*Math.min(devicePixelRatio,2),h=canvas.height=canvas.clientHeight*Math.min(devicePixelRatio,2);ctx.clearRect(0,0,w,h);const r=Math.min(w,h)*.4;
  const gap=range(p,.16,.30)*(1-range(p,.49,.60));const expand=Math.max(range(p,.48,.66),p>.49&&layer===2?.8:0)*(1-range(p,.80,.94));
  for(let j=0;j<64;j++){
   ctx.beginPath();ctx.lineWidth=j%10===0?1.6:.75;ctx.strokeStyle=j>48&&gap>.1?`rgba(157,75,46,${.7-gap*.45})`:`rgba(${layer===2?"67,91,65":layer===1?"96,86,64":"71,68,52"},${.45+random(j+33)*.35})`;
   const radius=(j+3)/67*r;for(let i=0;i<=240;i++){const a=i/240*Math.PI*2+p*.5;const distort=1+.045*Math.sin(a*5)+.03*Math.cos(a*8+j*.02)+.018*Math.sin(a*16)+(layer===1?.025*Math.sin(a*37+j*.4):0);const loss=(Math.sin(a*2.5+1)>.58&&j>40)?gap*.36:0;const rr=radius*distort*(1-loss);const x=w*.5+Math.cos(a)*rr+expand*(j-32)*1.5;const y=h*.5+Math.sin(a)*rr*(1-expand*.48)-expand*(j-32)*2.7;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
  }
  ctx.strokeStyle="#706c4b40";ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(w*.5-r*1.15,h*.5);ctx.lineTo(w*.5+r*1.15,h*.5);ctx.moveTo(w*.5,h*.5-r*1.15);ctx.lineTo(w*.5,h*.5+r*1.15);ctx.stroke();
  for(let i=0;i<4;i++){const a=i/4*Math.PI*2;ctx.beginPath();ctx.arc(w*.5+Math.cos(a)*r*1.1,h*.5+Math.sin(a)*r*1.1,3,0,7);ctx.fillStyle="#747659";ctx.fill();}
 },[p,layer]);return <canvas ref={ref} className="archive-rings" role="img" aria-label="Abstract growth-ring record that loses sections and separates into observation layers as you scroll"/>;
}
const chapters=[
 {n:"I",label:"THE SPECIMEN",title:<>The forest<br/>keeps a <em>record.</em></>,copy:"Every crown, every season, every quiet exchange of carbon. A living system writes its history in layers.",note:"A field guide to what remains."},
 {n:"II",label:"THE MISSING PAGES",title:<>Absence is<br/>a kind of <em>evidence.</em></>,copy:"Loss rarely arrives all at once. A thinning canopy. A broken edge. A chapter removed before it can be read.",note:"Canopy cover: 92.1% → 73.7% / simulated 2020–2025"},
 {n:"III",label:"THE INCOMPLETE ARCHIVE",title:<>One visit.<br/><em>Many silences.</em></>,copy:"A field notebook holds what one person can see. Vast, changing forests need a record that returns again and again.",note:"Repeated Earth observations extend the field record."},
 {n:"IV",label:"THREE WAYS OF READING",title:<>Light. Echo.<br/><em>Height.</em></>,copy:"Optical imagery records vegetation. Radar adds a view through cloud. LiDAR traces the vertical structure. Together, the pages align.",note:"Select a layer to inspect the specimen."},
 {n:"V",label:"THE ANNOTATED FOREST",title:<>From a crown<br/>to a <em>carbon story.</em></>,copy:"SylvaSense identifies tree crowns, estimates aboveground biomass and stored carbon, and compares the archive across time.",note:"12,486 crowns · 184.6 Mg biomass / ha · 86.8 Mg C / ha"},
 {n:"VI",label:"THE NEXT ENTRY",title:<>Keep a record.<br/>Make a <em>difference.</em></>,copy:"A dated observation. A traceable change. A reason to act. Forest intelligence becomes useful when evidence can be revisited.",note:"SYLVASENSE / OBSERVE · UNDERSTAND · PRESERVE"},
];
export default function Archive(){const {progress:p,jump}=useJourney();const [layer,setLayer]=useState(0);const travel=p*6;const offset=Math.min(5,Math.floor(travel)+range(travel%1,.65,1));
 return <main className="journey archive" style={{height:"760svh"}}><div className="pinned-world archive-paper"><div className="paper-grain"/><div className="archive-topline meta">THE SYLVASENSE FIELD ARCHIVE <span>VOLUME 01 · EARTH OBSERVATION</span></div><div className="archive-specimen"><ArchiveRings progress={p} layer={layer}/><span className="specimen-tag meta">FIG. {String(Math.min(6,Math.floor(p*6)+1)).padStart(2,"0")} — {p<.5?"THE LIVING RECORD":layer===0?"OPTICAL REFLECTANCE":layer===1?"RADAR BACKSCATTER":"CANOPY HEIGHT"}</span><span className="specimen-scale">0 ━━━━━━ 50 m</span></div>
 <div className="archive-track" style={{transform:`translateX(${-offset*100}vw)`}}>{chapters.map((c,i)=><section key={c.n} className="archive-page" aria-hidden={Math.abs(offset-i)>.7} inert={Math.abs(offset-i)>.7}><div className="archive-page-copy"><p className="eyebrow">{c.n} / {c.label}</p>{i===0?<h1>{c.title}</h1>:<h2>{c.title}</h2>}<p className="archive-body">{c.copy}</p><p className="archive-footnote">{c.note}</p>{i===3&&<div className="archive-layer-tabs">{["Optical","Radar","LiDAR"].map((x,j)=><button key={x} onClick={()=>setLayer(j)} aria-pressed={layer===j}>{x}</button>)}</div>}{i===4&&<dl className="archive-annotation"><dt>ESTIMATE CONFIDENCE</dt><dd>91.3%<span>illustrative model output</span></dd></dl>}{i===5&&<EndLinks id="03"/>}</div><span className="archive-page-number">{c.n}</span></section>)}</div><div className="archive-spine"><span className="meta">SPECIMEN 001 / FOREST INTELLIGENCE</span><div>{chapters.map((c,i)=><button key={c.n} aria-label={`Open archive chapter ${c.n}`} aria-current={Math.min(5,Math.floor(p*6))===i?"step":undefined} onClick={()=>jump(i)}>{c.n}</button>)}</div><span className="meta">{Math.round(p*100)} / 100</span></div></div><Chrome id="03" progress={p} jump={jump}/></main>;
}

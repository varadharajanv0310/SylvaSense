"use client";
import { Scene, useJourney } from "../journey";
import { range } from "../data";
import { ForestChrome, ForestEnd } from "./shared";
import ForestAtmosphere from "./ForestAtmosphere";
export default function LastGreen(){
 const {progress:p,jump,reduced}=useJourney();const cut=range(p,.33,.49),burn=range(p,.47,.64),ash=range(p,.64,.77),scan=range(p,.83,.96);
 return <main className="journey forest-story last-green" style={{height:"880svh"}}><ForestChrome id="06" progress={p} jump={jump}/><div className="pinned-world">
 <div className="green-environment" style={{transform:`scale(${1+range(p,0,.33)*.14})`,filter:`saturate(${1.25-burn*1.15}) brightness(${.65-burn*.4+scan*.1})`}}><img src="/media/deep-forest.jpg" alt="Sunlight filtering through a dense green forest" style={{opacity:1-cut*.84}}/><div className="felled-panels" aria-hidden="true">{Array.from({length:12},(_,i)=>{const fall=range(cut,i*.045,.45+i*.045);return <div key={i} style={{left:`${i*8.34}%`,width:"8.5%",height:"100%",backgroundPosition:`calc(50% + ${50-(i+.5)*100/12}vw) center`,transform:`translateY(${fall*110}%) rotate(${fall*(i%2?16:-16)}deg)`,opacity:1-fall*.45}}/>;})}</div>
 </div><div className="fire-light" style={{opacity:burn*(1-ash)}}/><div className="ash-haze" style={{opacity:ash*(1-scan*.5)}}/>
 <div className="forest-scan" aria-hidden="true" style={{opacity:scan}}><div className="forest-scan-grid"/><span className="scan-caption">CANOPY LOSS / SIMULATED OBSERVATION</span>{[14,29,45,65,80].map((x,i)=><span className="scan-target" key={x} style={{left:`${x}%`,top:`${32+i%3*14}%`}}>−{[12,19,31,24,17][i]}%</span>)}</div>
 <Scene progress={p} index={0} className="green-opening forest-center"><p className="eyebrow">A SYLVASENSE STORY / 01</p><h1>The last <br/><em>green.</em></h1><p className="forest-deck">Every leaf is part of something larger.</p><button className="forest-scroll" onClick={()=>jump(1)} aria-label="Enter the forest">Step through the leaves <span>↓</span></button></Scene>
 <Scene progress={p} index={1} className="forest-low-left"><p className="eyebrow">01 / A WORLD STILL WHOLE</p><h2>Before the silence, <br/><em>everything moved.</em></h2><p className="forest-deck">Light through the canopy. Life beneath it. <br/>A forest holding itself together.</p></Scene>
 <Scene progress={p} index={2} className="forest-right"><p className="eyebrow">02 / THE FIRST ABSENCE</p><h2>One cut. <br/>Then <em>another.</em></h2><p className="forest-deck">The canopy opens. The shelter disappears. <br/>What took decades leaves in moments.</p><div className="forest-measure"><strong>{(92.1-cut*18.4).toFixed(1)}<small>%</small></strong><span>CANOPY COVER <br/>SIMULATED CHANGE</span></div></Scene>
 <Scene progress={p} index={3} className="forest-center fire-copy"><p className="eyebrow">03 / A DIFFERENT KIND OF LIGHT</p><h2>Green becomes <br/><em>fire.</em></h2><p className="forest-deck">The leaves that held the light <br/>become the light that consumes them.</p></Scene>
 <Scene progress={p} index={4} className="forest-center ash-copy"><p className="eyebrow">04 / WHAT REMAINS</p><h2>Even the words <br/><em>disappear.</em></h2><p className="forest-deck">A living world, reduced to what the wind carries.</p></Scene>
 <Scene progress={p} index={5} className="forest-center forest-ending"><p className="eyebrow">05 / MAKE LOSS VISIBLE</p><h2>Before the last leaf. <br/><em>See the change.</em></h2><p className="forest-deck">SylvaSense turns observations into evidence. <br/>Because an early signal can change the ending.</p><ForestEnd id="06" replay={()=>jump(0)}/></Scene>
 <ForestAtmosphere kind="fire" progress={p} reduced={reduced}/>
 </div></main>;
}

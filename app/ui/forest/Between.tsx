"use client";
import { useState } from "react";
import { Scene,useJourney } from "../journey";
import { range } from "../data";
import { ForestChrome,ForestEnd } from "./shared";
import ForestAtmosphere from "./ForestAtmosphere";
export default function Between(){
 const {progress:p,jump,reduced}=useJourney();const [corridor,setCorridor]=useState("river");const split=range(p,.17,.52),reconnect=range(p,.69,.93);const gap=split*(1-reconnect*.88);const road=range(p,.16,.3)*(1-reconnect*.85);
 return <main className="journey forest-story between-story" style={{height:"900svh"}}><ForestChrome id="08" progress={p} jump={jump}/><div className="pinned-world">
 <div className="island-world" style={{transform:`scale(${1.12-range(p,.23,.64)*.23+reconnect*.12}) rotate(${split*-5+reconnect*5}deg)`}}>
 {Array.from({length:4},(_,i)=>{const x=i%2?1:-1,y=i<2?-1:1;return <div key={i} className={`canopy-island island-${i}`} style={{transform:`translate(${x*gap*5.2}vw,${y*gap*5.2}vh)`,filter:`saturate(${1.2-gap*.65}) brightness(${.66-gap*.15})`}}/>;})}
 <svg className="fragmentation-map" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path className="forest-road road-one" d="M-80 380 L230 390 L420 312 L620 354 L1090 256" style={{strokeDashoffset:1400*(1-road),strokeWidth:2+gap*27}}/><path className="forest-road road-two" d="M590 -80 L572 210 L485 350 L515 560 L470 790" style={{strokeDashoffset:1100*(1-range(p,.3,.47)),strokeWidth:2+gap*21,opacity:1-reconnect*.9}}/>
 <g className="corridor-network" style={{opacity:range(p,.64,.69)}}><path className={corridor==="river"?"chosen-corridor":""} d="M260 220 Q440 290 490 365 T750 510"/><path className={corridor==="ridge"?"chosen-corridor":""} d="M260 220 Q220 340 200 530 Q450 600 750 510"/></g>
 <g className="habitat-nodes" style={{opacity:range(p,.45,.6)}}>{[[260,220],[740,190],[200,530],[750,510]].map(([x,y],i)=><g key={x} transform={`translate(${x},${y})`}><circle r="32"/><circle r="4"/><text y="57">{String.fromCharCode(65+i)}</text></g>)}</g></svg></div>
 <div className="between-shade"/><ForestAtmosphere kind="canopy" progress={p} reduced={reduced}/>
 <span className="map-coordinates" aria-hidden="true">LANDSCAPE STUDY / 4 HABITATS / ONE LIVING SYSTEM</span>
 <Scene progress={p} index={0} className="between-opening"><p className="eyebrow">A SYLVASENSE STORY / 03</p><h1>The space <br/><em>between</em> trees.</h1><div className="between-intro"><p className="forest-deck">From up here, everything is connected. <br/>Keep scrolling. Watch the distance grow.</p><button className="forest-scroll" onClick={()=>jump(1)}>Follow the connections <span>↓</span></button></div></Scene>
 <Scene progress={p} index={1} className="between-line"><p className="eyebrow">01 / IT BEGINS WITH A LINE</p><h2>A way through. <br/>A world <em>apart.</em></h2><p className="forest-deck">A road appears in the canopy. <br/>For us, a connection. For the forest, a divide.</p></Scene>
 <Scene progress={p} index={2} className="forest-right"><p className="eyebrow">02 / GREEN DOES NOT MEAN WHOLE</p><h2>Still trees. <br/>No longer <em>one forest.</em></h2><p className="forest-deck">The camera rises. Four habitats drift apart. <br/>The spaces between them become barriers.</p></Scene>
 <Scene progress={p} index={3} className="between-distance"><p className="eyebrow">03 / THE COST OF DISTANCE</p><h2>A short flight. <br/>An impossible <em>crossing.</em></h2><p className="forest-deck">Seeds, wildlife, and living networks <br/>depend on more than the number of trees.</p><div className="connectivity-readout"><b>04</b><span>ISOLATED HABITATS</span><i/><b>00</b><span>CONNECTED CORRIDORS</span></div></Scene>
 <Scene progress={p} index={4} className="between-reconnect"><p className="eyebrow">04 / FIND THE WAY BACK</p><h2>Protect the <br/><em>in-between.</em></h2><p className="forest-deck">See where a corridor could reconnect the landscape. <br/>Explore two illustrative restoration paths.</p><div className="corridor-controls" aria-label="Restoration corridor"><button aria-pressed={corridor==="river"} onClick={()=>setCorridor("river")}>Along the river</button><button aria-pressed={corridor==="ridge"} onClick={()=>setCorridor("ridge")}>Over the ridge</button></div><span className="corridor-detail">{corridor==="river"?"A → D / RIPARIAN CONNECTION":"A → C → D / UPLAND CONNECTION"}</span></Scene>
 <Scene progress={p} index={5} className="between-belong"><p className="eyebrow">05 / A LANDSCAPE THAT BELONGS TOGETHER</p><h2>Count the trees. <br/>Understand the <em>forest.</em></h2><p className="forest-deck">SylvaSense brings the bigger picture into focus. <br/>What we connect matters as much as what we keep.</p><ForestEnd id="08" replay={()=>jump(0)}/></Scene>
 </div></main>;
}

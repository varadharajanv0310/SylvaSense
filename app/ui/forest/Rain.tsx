"use client";
import { Scene,useJourney } from "../journey";
import { range } from "../data";
import { ForestChrome,ForestEnd } from "./shared";
import ForestAtmosphere from "./ForestAtmosphere";
export default function Rain(){
 const {progress:p,jump,reduced}=useJourney();const descent=range(p,.27,.43),drought=range(p,.48,.65),returning=range(p,.82,.98);
 return <main className="journey forest-story rain-story" style={{height:"850svh"}}><ForestChrome id="07" progress={p} jump={jump}/><div className="pinned-world">
 <div className="rain-canopy" style={{transform:`translateY(${-descent*100+returning*100}%) scale(${1.1+range(p,0,.3)*.2})`,filter:`saturate(${1.3-drought}) brightness(.62)`}}><img src="/media/deep-forest.jpg" alt="Rain falling into a lush living forest"/></div>
 <div className="root-world" style={{transform:`translateY(${(1-descent)*100-returning*100}%)`}}><div className="soil-horizon"/><span className="soil-level">BENEATH THE VISIBLE / ROOT-ZONE STUDY</span></div>
 <div className="rain-vignette"/><div className="drought-light" style={{opacity:drought*(1-returning)}}/>
 <ForestAtmosphere kind="rain" progress={p} reduced={reduced}/>
 <div className="water-depth" style={{opacity:range(p,.08,.18)*(1-returning)}} aria-hidden="true"><span>{descent<.2?"CANOPY":"BELOW GROUND"}</span><i/><b>{(28-descent*30).toFixed(1)} m</b></div>
 <Scene progress={p} index={0} className="rain-opening"><p className="eyebrow">A SYLVASENSE STORY / 02</p><h1>A forest <br/>holds the <em>rain.</em></h1><p className="forest-deck">A journey that begins with a single drop.</p><button className="forest-scroll" onClick={()=>jump(1)}>Follow the water <span>↓</span></button><span className="rain-opening-note">FROM THE SKY. <br/>THROUGH THE LEAVES. <br/>INTO EVERYTHING.</span></Scene>
 <Scene progress={p} index={1} className="forest-right"><p className="eyebrow">01 / A THOUSAND SMALL RESERVOIRS</p><h2>The canopy <br/><em>catches the sky.</em></h2><p className="forest-deck">Water gathers on a leaf, then falls. <br/>You descend with it, toward the roots.</p></Scene>
 <Scene progress={p} index={2} className="rain-below"><p className="eyebrow">02 / THE WORLD UNDER THE WORLD</p><h2>Life runs <br/><em>deeper.</em></h2><p className="forest-deck">Follow the branching network. <br/>A forest is alive far beyond what we see.</p><span className="root-note">ILLUSTRATIVE ROOT & WATER NETWORK</span></Scene>
 <Scene progress={p} index={3} className="rain-thirst"><p className="eyebrow">03 / WHEN THE FLOW STOPS</p><h2>A slow, <br/><em>invisible thirst.</em></h2><p className="forest-deck">The water fades before the canopy does. <br/>By the time we see brown, the story has begun.</p><div className="forest-measure"><strong>{Math.round(78-drought*54)}<small>%</small></strong><span>RELATIVE MOISTURE INDEX <br/>ILLUSTRATIVE ONLY</span></div></Scene>
 <Scene progress={p} index={4} className="rain-listen"><p className="eyebrow">04 / LISTEN BELOW THE SURFACE</p><h2>The first warning <br/>is a <em>whisper.</em></h2><p className="forest-deck">Moisture, canopy, and terrain tell a shared story. <br/>SylvaSense helps bring those signals together.</p><div className="water-signals"><span>CANOPY CONDITION</span><span>MOISTURE SIGNAL</span><span>TERRAIN CONTEXT</span></div></Scene>
 <Scene progress={p} index={5} className="rain-return"><p className="eyebrow">05 / A POSSIBLE TOMORROW</p><h2>Give the forest <br/>a chance to <em>drink.</em></h2><p className="forest-deck">The rain returns in this imagined future. <br/>Earlier understanding makes room for action.</p><ForestEnd id="07" replay={()=>jump(0)}/></Scene>
 </div></main>;
}

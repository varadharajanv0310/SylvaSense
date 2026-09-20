"use client";
import Brand from "./Brand";
import { concepts } from "./data";
import { forestStories } from "./forest/shared";
export default function ConceptSelector(){
 return <main className="forest-collection"><header className="selector-header"><Brand/><span className="meta">THREE STORIES FROM A LIVING FOREST</span><a className="index-link" href="#stories">Step inside <span>↙</span></a></header>
 <section className="forest-collection-intro"><div><p className="eyebrow">SYLVASENSE / FOREST STORIES</p><h1>Everything begins <br/>with <em>green.</em></h1></div><p>Step through the leaves. <br/>Follow the rain. Cross the distance. <br/>Three forests. Three possible futures.</p></section>
 <section id="stories" className="forest-collection-grid" aria-label="Three immersive forest stories">{forestStories.map(s=><a className={`forest-story-card forest-card-${s.id}`} key={s.id} href={`/concept-${s.id}`}><div className="forest-card-image"><img src={s.id==="08"?"/media/river-canopy.jpg":"/media/deep-forest.jpg"} alt={s.id==="08"?"An unbroken green canopy and winding river":"Sunlit leaves and mossy trunks in a lush forest"}/>{s.id==="06"&&<img className="card-leaf" src="/media/leaf.webp" alt=""/>}<span>{s.number} / {s.theme.toUpperCase()}</span><h2>{s.id==="06"?<>The last <br/><em>green.</em></>:s.id==="07"?<>A forest holds <br/>the <em>rain.</em></>:<>The space <br/><em>between</em> trees.</>}</h2><b aria-hidden="true">↗</b></div><div className="forest-card-description"><p>{s.line}</p><span>Enter story ↗</span></div></a>)}</section>
 <details className="previous-experiments"><summary>Earlier explorations / 01–05</summary><div>{concepts.map(c=><a key={c.id} href={`/concept-${c.id}`}>{c.id} / {c.name} ↗</a>)}</div></details>
 <footer className="forest-collection-footer"><span>EARTH OBSERVATION. HUMAN PERSPECTIVE.</span><span>Interactive concepts · Illustrative data · 2026</span></footer></main>;
}

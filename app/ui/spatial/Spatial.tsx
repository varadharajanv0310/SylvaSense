"use client";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {clamp,random} from "../data";

type Props={mode:"orbit"|"ghost";progress:number;band?:string};
function treePoints(count:number){
  const branches:{a:THREE.Vector3;b:THREE.Vector3;radius:number;depth:number}[]=[];
  const ends:THREE.Vector3[]=[];let seed=5;
  function branch(a:THREE.Vector3,dir:THREE.Vector3,len:number,r:number,depth:number){
    const b=a.clone().addScaledVector(dir,len);branches.push({a,b,radius:r,depth});
    if(depth>5){ends.push(b);return;}
    for(let i=0;i<(depth<2?3:2);i++){seed++;const next=dir.clone().multiplyScalar(.63).add(new THREE.Vector3((random(seed)-.5)*1.5,.24+random(seed+500)*.3,(random(seed+900)-.5)*1.5)).normalize();branch(b,next,len*(.67+random(seed+150)*.12),r*.62,depth+1);}
  }
  branch(new THREE.Vector3(0,-2.6,0),new THREE.Vector3(0,1,0),2.3,.15,0);
  const largeBranches=branches.filter(b=>b.depth<=2);
  const arr=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    let x:number,y:number,z:number;
    if(i<count*.35){const b=i<count*.045?branches[0]:i<count*.13?largeBranches[Math.floor(random(i+140)*largeBranches.length)]:branches[Math.floor(random(i+140)*branches.length)], t=random(i+9),a=random(i+66)*Math.PI*2;const point=b.a.clone().lerp(b.b,t);x=point.x+Math.cos(a)*b.radius;y=point.y;z=point.z+Math.sin(a)*b.radius;}
    else {const e=ends[Math.floor(random(i+141)*ends.length)],a=random(i+8)*Math.PI*2,v=random(i+61)*2-1,r=Math.cbrt(random(i+99))*.73;x=e.x+Math.cos(a)*Math.sqrt(1-v*v)*r;y=e.y+v*r*.68;z=e.z+Math.sin(a)*Math.sqrt(1-v*v)*r;}
    arr.set([x,y-.8,z],i*3);
  }return arr;
}

export default function Spatial({mode,progress,band="OPTICAL"}:Props){
  const host=useRef<HTMLDivElement>(null),values=useRef({progress,band});values.current={progress,band};const [fallback,setFallback]=useState(false);
  useEffect(()=>{
    const container=host.current!;let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:"low-power"});}catch{setFallback(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));container.appendChild(renderer.domElement);
    const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(0,1,12);
    const mobile=innerWidth<700, count=mobile?13000:23000;
    const group=new THREE.Group();scene.add(group);
    const positions=mode==="ghost"?treePoints(count):new Float32Array(count*3);
    const targets=new Float32Array(count*3), carbon=new Float32Array(count*3), colors=new Float32Array(count*3),seeds=new Float32Array(count);
    for(let i=0;i<count;i++){
      const a=random(i+8)*Math.PI*2,u=random(i+43)*2-1;
      if(mode==="orbit"){
        const lon=a,lat=Math.asin(u),continent=Math.sin(lon*3+Math.cos(lat*4))*Math.sin(lat*5+lon*.7)+Math.cos(lon*5-lat*2)*.35;
        const r=2.65+(continent>.05?.02+random(i+600)*.055:0);
        positions.set([Math.cos(lon)*Math.cos(lat)*r,Math.sin(lat)*r,Math.sin(lon)*Math.cos(lat)*r],i*3);
        const col=new THREE.Color(continent>.05?"#a7d8ef":"#20445e");colors.set([col.r,col.g,col.b],i*3);
        const gx=(i%160)/160*7-3.5,gz=Math.floor(i/160)/(count/160)*6-3;
        const height=Math.sin(gx*.75+gz*.3)*.48+Math.cos(gz*1.4)*.36+Math.sin(gx*2+gz)*.16+random(i+8)*.3;
        targets.set([gx,height-.3,gz],i*3);
      }else{
        const col=new THREE.Color().setHSL(.73+random(i+171)*.06,.35,.50+random(i+232)*.4);colors.set([col.r,col.g,col.b],i*3);
        targets.set([(i%150)/150*8-4,Math.sin(i*.001)*.25-1.6,Math.floor(i/150)/(count/150)*6-3],i*3);
      }
      const cluster=i%3,rad=cluster===0?1.6:.88;
      carbon.set([Math.cos(a)*Math.sqrt(1-u*u)*rad+(cluster===0?0:cluster===1?-2.1:2.1),u*rad+.1,Math.sin(a)*Math.sqrt(1-u*u)*rad],i*3);
      seeds[i]=random(i+764);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));geometry.setAttribute("aTarget",new THREE.BufferAttribute(targets,3));geometry.setAttribute("aCarbon",new THREE.BufferAttribute(carbon,3));geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));geometry.setAttribute("aSeed",new THREE.BufferAttribute(seeds,1));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending,uniforms:{uProgress:{value:0},uTime:{value:0},uMode:{value:mode==="orbit"?0:1},uBand:{value:0},uPixel:{value:renderer.getPixelRatio()}},vertexShader:`
      attribute vec3 aTarget; attribute vec3 aCarbon; attribute float aSeed;
      uniform float uProgress; uniform float uTime; uniform float uMode; uniform float uBand; uniform float uPixel;
      varying vec3 vColor; varying float vAlpha;
      void main(){ vec3 p=position; vColor=color; vAlpha=.85;
        if(uMode<.5){
          float plane=smoothstep(.30,.58,uProgress);p=mix(p,aTarget,plane);
          p.y+=sin(p.x*2.+uTime*.6)*.022*plane;
          if(uBand>1.5){vColor=mix(vec3(.15,.45,.9),vec3(.9,.6,.22),(aTarget.y+1.3)/2.2);p.y+=plane*.3;}
          else if(uBand>.5){vColor=vec3(.4+aSeed*.6);}
          else{vColor=mix(vColor,vec3(.35,.8,.59),plane*.5);}
          float scan=1.-smoothstep(.0,.14,abs(fract(uTime*.07)-aSeed));vAlpha+=scan*.4*plane;
        }else{
          float absence=smoothstep(.14,.29,uProgress)*(1.-smoothstep(.35,.49,uProgress));
          p+=normalize(position+vec3(.01))*(aSeed*5.)*absence;
          vAlpha*=1.-absence*smoothstep(.16,.62,aSeed)*.93;
          float grid=smoothstep(.38,.43,uProgress)*(1.-smoothstep(.47,.56,uProgress));p=mix(p,aTarget,grid);
          float atom=smoothstep(.65,.76,uProgress)*(1.-smoothstep(.84,.99,uProgress));p=mix(p,aCarbon,atom);
          p.x+=sin(uTime*.6+aSeed*20.)*.02;
          vColor=mix(vColor,vec3(.95,.7,.3),atom*.55);
          vColor=mix(vColor,vec3(.55,.95,.7),smoothstep(.87,1.,uProgress)*.5);
        }
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((uMode>.5?29.:30.)*uPixel/-mv.z,1.,5.); }
      `,fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;gl_FragColor=vec4(vColor,(1.-smoothstep(.1,.5,d))*vAlpha);}`});
    const cloud=new THREE.Points(geometry,material);group.add(cloud);
    const shell=new THREE.Mesh(new THREE.SphereGeometry(2.63,36,24),new THREE.MeshBasicMaterial({color:0x162c40,wireframe:true,transparent:true,opacity:.3}));if(mode==="orbit")group.add(shell);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(3.55,.005,4,160),new THREE.MeshBasicMaterial({color:0x9dd9f4,transparent:true,opacity:.65}));halo.rotation.x=1.23;halo.rotation.z=-.38;if(mode==="orbit")group.add(halo);
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.043,8,8),new THREE.MeshBasicMaterial({color:0xc9eeff}));if(mode==="orbit")group.add(marker);
    const floor=new THREE.GridHelper(10,20,0x3b385c,0x222031);floor.position.y=-3.45;if(mode==="ghost")group.add(floor);
    const starsG=new THREE.BufferGeometry(),starsP=new Float32Array(900*3);for(let i=0;i<900;i++)starsP.set([(random(i+11)-.5)*28,(random(i+267)-.5)*22,-7-random(i+990)*8],i*3);starsG.setAttribute("position",new THREE.BufferAttribute(starsP,3));const starsM=new THREE.PointsMaterial({color:mode==="orbit"?0x6695ba:0x806c9e,size:.012,transparent:true,opacity:.55});scene.add(new THREE.Points(starsG,starsM));
    const resize=()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<h?54:40;camera.updateProjectionMatrix();};resize();const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);
    let pointerX=0,pointerY=0;const pointer=(e:PointerEvent)=>{pointerX=e.clientX/innerWidth-.5;pointerY=e.clientY/innerHeight-.5;};window.addEventListener("pointermove",pointer,{passive:true});
    const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;let frame=0,last=0,time=0;
    const draw=(now:number)=>{frame=requestAnimationFrame(draw);if(document.hidden||now-last<30)return;const delta=Math.min(now-last,60);last=now;if(!reduced)time+=delta*.001;const p=values.current.progress;
      material.uniforms.uProgress.value=p;material.uniforms.uTime.value=time;material.uniforms.uBand.value=values.current.band==="SAR"?1:values.current.band==="LiDAR"?2:0;
      group.position.x=mobile?0:mode==="orbit"?1.5:1.15;group.position.y=mobile?.25:0;
      if(mode==="orbit"){const flatten=clamp((p-.30)/.28);group.rotation.y=time*.045+p*1.7;group.rotation.x=.14-flatten*.26;const size=1+Math.sin(p*Math.PI)*.15;group.scale.setScalar(size);shell.material.opacity=(1-flatten)*.3;halo.material.opacity=(1-flatten)*.6;marker.visible=flatten<.9;marker.position.set(Math.cos(time*.25)*3.55,Math.sin(time*.25)*1.2,Math.sin(time*.25)*3.3);}
      else{group.rotation.y=Math.sin(time*.07)*.12+p*.45;floor.visible=p<.68||p>.9;group.scale.setScalar(mobile?.74:.83);}
      if(!reduced){camera.position.x+=(pointerX*.22-camera.position.x)*.025;camera.position.y+=(.9+pointerY*.14-camera.position.y)*.025;}camera.lookAt(0,0,0);renderer.render(scene,camera);
    };frame=requestAnimationFrame(draw);
    const lost=(event:Event)=>{event.preventDefault();setFallback(true);cancelAnimationFrame(frame);};renderer.domElement.addEventListener("webglcontextlost",lost);
    return()=>{cancelAnimationFrame(frame);resizeObserver.disconnect();window.removeEventListener("pointermove",pointer);renderer.domElement.removeEventListener("webglcontextlost",lost);scene.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.Points||obj instanceof THREE.LineSegments){obj.geometry.dispose();(Array.isArray(obj.material)?obj.material:[obj.material]).forEach((m:THREE.Material)=>m.dispose());}});renderer.dispose();renderer.domElement.remove();};
  },[mode]);
  return <div className={`spatial ${fallback?"spatial-fallback":""}`} ref={host} role="img" aria-label={mode==="orbit"?"Interactive three-dimensional globe transforming into a forest elevation field":"Three-dimensional tree point cloud dissolving, reforming, and becoming a carbon visualization"}>{fallback&&<div className={`fallback-visual fallback-${mode}`}><div className="fallback-orb"/><span className="meta">{mode==="orbit"?"ORBITAL OBSERVATION":"CANOPY POINT RETURNS"}<br/>2D VIEW / SCROLL TO EXPLORE</span></div>}</div>;
}

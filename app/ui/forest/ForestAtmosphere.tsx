"use client";
import { useEffect,useRef } from "react";
import { clamp,random,range } from "../data";
import { createFlameField } from "./FlameField";
type Props={kind:"fire"|"rain"|"canopy";progress:number;reduced:boolean};
type Root={x:number;y:number;tx:number;ty:number;cx:number;cy:number;width:number;seed:number};
export default function ForestAtmosphere({kind,progress,reduced}:Props){
 const canvas=useRef<HTMLCanvasElement>(null),state=useRef({progress,reduced});state.current={progress,reduced};
 useEffect(()=>{
  const c=canvas.current!,ctx=c.getContext("2d");if(!ctx)return;
  const leaf=new Image();leaf.src="/media/leaf.webp";
  const flameField=kind==="fire"?createFlameField():null;
  let w=1,h=1,dpr=1,frame=0,last=0,time=0,previous=-1,visible=true;
  leaf.onload=()=>{previous=-1;};
  const resize=()=>{w=c.clientWidth;h=c.clientHeight;dpr=Math.min(devicePixelRatio,1.5);c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);previous=-1;};
  const ro=new ResizeObserver(resize);ro.observe(c);resize();
  const visibility=()=>{visible=!document.hidden;last=0;};document.addEventListener("visibilitychange",visibility);
  const roots:Root[]=[];
  const branch=(x:number,y:number,angle:number,length:number,depth:number,seed:number)=>{
   const tx=x+Math.cos(angle)*length,ty=y+Math.sin(angle)*length;
   roots.push({x,y,tx,ty,cx:(x+tx)/2+(random(seed+3)-.5)*.06,cy:y+(ty-y)*.24,width:depth*.65,seed});
   if(depth>0){branch(tx,ty,angle-.35-random(seed+8)*.4,length*.71,depth-1,seed*2+1);branch(tx,ty,angle+.35+random(seed+9)*.4,length*.73,depth-1,seed*2+2);}
  };
  for(let i=0;i<5;i++)branch(.5+i*.1,.08,Math.PI*.5+(i-2)*.2,.19,5,80+i*190);
  const dot=(x:number,y:number,r:number,color:string|CanvasGradient)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
  const paintLeaf=(x:number,y:number,size:number,angle:number,alpha:number)=>{if(!leaf.complete||!leaf.naturalWidth)return;ctx.save();ctx.globalAlpha=clamp(alpha);ctx.translate(x,y);ctx.rotate(angle);ctx.scale(.85+Math.sin(angle)*.15,1);ctx.drawImage(leaf,-size/2,-size/2,size,size);ctx.restore();};
  const draw=(now:number)=>{
   frame=requestAnimationFrame(draw);const {progress:p,reduced:reduce}=state.current;if(!visible||now-last<32)return;
   if(reduce&&p===previous)return;const dt=last?Math.min((now-last)/1000,.06):0;last=now;time+=reduce?0:dt;previous=p;ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;
   if(kind==="fire"){
    const fly=range(p,0,.155),burn=range(p,.46,.62),ash=range(p,.63,.8),ending=range(p,.83,.94);
    // Large textured leaves create a foreground curtain; scroll gives every leaf its own outward trajectory.
    for(let i=0;i<46;i++){
     const edge=i%4,r=random(i+41),axis=random(i+100);let x=edge===0?-.035:edge===1?1.035:axis,y=edge===2?-.09:edge===3?1.09:r;
     x+=(x-.5)*fly*2.5;y+=(y-.5)*fly*2.8;
     paintLeaf(x*w+Math.sin(time*.28+i)*4,y*h+Math.cos(time*.34+i)*5,Math.min(w,h)*(.3+r*.25)*(1-fly*.3),i*2.39+fly*(i%2?3:-3),reduce?1-fly:1);
    }
    if(fly<1)for(let i=0;i<35;i++){
     const bx=(i%7)/6+(random(i+633)-.5)*.18,by=Math.floor(i/7)/4+(random(i+398)-.5)*.16,dx=bx-.5,dy=by-.5;
     paintLeaf((bx+dx*fly*4)*w,(by+dy*fly*5)*h,Math.min(w,h)*(.47+random(i+112)*.2)*(1+fly*.5),i*2.2+fly*(i%2?4:-4),clamp(1-fly*1.4)*.95);
    }
    // The same drifting seeds change from leaves to embers and then to ash.
    for(let i=0;i<95;i++){
     const speed=.025+random(i+13)*.04;const x=(random(i*3+4)*1.25+Math.sin(time*.2+i)*.025+time*.008)%1.2*w;
     const y=((random(i+7)+time*speed*(burn>.2?-1:1))%1.2+1.2)%1.2*h;
     const size=9+random(i+50)*24;
     if(burn<.5)paintLeaf(x,y,size,random(i+29)*6+time*.6,(.3+random(i)*.5)*(1-burn*2));
     if(burn>.05){ctx.save();ctx.globalAlpha=burn*(1-ash*.4)*(1-ending);ctx.translate(x,y);ctx.rotate(time+random(i)*7);ctx.fillStyle=ash>.35?`rgba(195,192,173,${.25+random(i)*.55})`:i%3?"#ff971c":"#fff2ab";ctx.shadowColor="#ff5000";ctx.shadowBlur=ash>.35?0:12;ctx.fillRect(-1,-2,1.5+random(i)*3,3+random(i+4)*6);ctx.restore();}
    }
    const fire=range(p,.47,.55)*(1-range(p,.63,.72));
    if(fire>0){
     ctx.save();ctx.globalCompositeOperation="screen";
     const flames=flameField?.render(time);if(flames){ctx.globalAlpha=fire*.9;ctx.drawImage(flames,0,h*.28,w,h*.72);ctx.globalAlpha=1;}
     for(let i=0;i<175;i++){
      const life=(random(i+203)+time*(.22+random(i)*.21))%1;
      const x=(random(i+102)*1.1-.05)*w+Math.sin(life*8+i)*25;
      const y=h-life*h*(.4+random(i+88)*.55),r=(1-life)*(24+random(i+45)*65);
      const glow=ctx.createRadialGradient(x,y,0,x,y,Math.max(1,r));glow.addColorStop(0,`rgba(255,${120+Math.floor((1-life)*90)},20,${fire*(1-life)*.45})`);glow.addColorStop(.4,`rgba(245,58,3,${fire*(1-life)*.22})`);glow.addColorStop(1,"rgba(110,4,0,0)");ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,r*2,r*2);
     }ctx.restore();
    }
    // Ash settles across the central words, then a new observation clears the view.
    const settle=range(p,.69,.815)*(1-ending);
    if(settle>0){ctx.save();ctx.globalAlpha=settle;for(let i=0;i<1700;i++){
     const x=w*(.5+(random(i+83)+random(i+301)+random(i+819)-1.5)*.3),y=h*(.49+(random(i+891)+random(i+390)+random(i+541)-1.5)*.13),sz=1+random(i+61)*Math.min(w/65,9);
     dot(x,y,sz,["#222420","#34352e","#171a16","#68695b"][i%4]);
    }ctx.restore();}
   }
   if(kind==="rain"){
    const descent=range(p,.27,.43),drought=range(p,.48,.65),returning=range(p,.82,.98),underground=descent*(1-returning),water=1-drought+returning;
    if(underground>.01){ctx.save();ctx.globalAlpha=underground;ctx.lineCap="round";
     // A procedural, explicitly illustrative network: thick roots branch into fine absorbing structures.
     for(const root of roots){const x=root.x*w,y=root.y*h,tx=root.tx*w,ty=root.ty*h;ctx.strokeStyle=drought>.6?"#836340":"#8fa887";ctx.globalAlpha=underground*(.16+root.width*.12);ctx.lineWidth=Math.max(.5,root.width*1.2);ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(root.cx*w,root.cy*h,tx,ty);ctx.stroke();
      if(random(root.seed+3)<.52){const t=(time*.16+random(root.seed))%1;const px=(1-t)**2*x+2*(1-t)*t*root.cx*w+t*t*tx,py=(1-t)**2*y+2*(1-t)*t*root.cy*h+t*t*ty;ctx.globalAlpha=underground*clamp(water+range(p,.68,.78)*.45);dot(px,py,1.5+root.width*.5,drought>.6?"#e1c585":"#a9f3df");}
     }ctx.restore();
     if(p>.66){const pulse=(time*.18)%1;ctx.save();ctx.globalAlpha=(1-pulse)*underground*.5;ctx.strokeStyle="#a4e7cb";ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(w*.67,h*.4,pulse*w*.48,pulse*h*.6,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    }
    ctx.save();ctx.globalAlpha=(1-underground)*.5;ctx.strokeStyle="#caeee0";ctx.lineWidth=.7;
    for(let i=0;i<125;i++){const x=random(i+50)*w,y=((random(i+20)+time*(.25+random(i)*.35))%1)*h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y+16+random(i)*16);ctx.stroke();}ctx.restore();
    // One refractive drop leads the descent before joining the root network.
    const drop=1-range(p,.29,.41);if(drop>0){const x=w*.72,y=h*(.42+range(p,.15,.34)*.4),r=Math.min(w,h)*.053;ctx.save();ctx.globalAlpha=drop;const g=ctx.createRadialGradient(x-r*.3,y-r*.4,1,x,y,r);g.addColorStop(0,"#efffffa9");g.addColorStop(.25,"#b4ead128");g.addColorStop(.8,"#12453949");g.addColorStop(.99,"#cdf7d59c");g.addColorStop(1,"#cdf7d500");dot(x,y,r,g);ctx.strokeStyle="#d9ffee";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,r*.83,3.65,4.7);ctx.stroke();ctx.restore();}
    for(let i=0;i<12;i++){const x=random(i+800)*w,y=(random(i+720)+Math.sin(time*.14+i)*.02)*h;paintLeaf(x,y,30+random(i)*60,i*3+time*.1,(1-underground)*.5);}
   }
   if(kind==="canopy"){
    const gap=range(p,.25,.52)*(1-range(p,.72,.92));
    for(let i=0;i<22;i++){const x=(random(i+200)+time*.011)%1*w,y=(random(i+900)+Math.sin(time*.35+i)*.03)*h;paintLeaf(x,y,8+random(i)*13,i+time*.2,.4*(1-gap));}
    if(p>.42&&p<.84){ctx.save();ctx.strokeStyle="#e9edc976";ctx.setLineDash([3,8]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w*.27,h*.3);ctx.lineTo(w*.72,h*.73);ctx.stroke();ctx.restore();}
   }
  };frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);ro.disconnect();document.removeEventListener("visibilitychange",visibility);leaf.onload=null;leaf.src="";flameField?.dispose();};
 },[kind]);
 return <canvas ref={canvas} className={`forest-atmosphere atmosphere-${kind}`} aria-hidden="true"/>;
}

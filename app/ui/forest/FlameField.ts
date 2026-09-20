// A small GPU field adds turbulent fire to the foreground particle system.
// The canvas renderer retains its ember fallback if WebGL is unavailable.
export function createFlameField(){
 const canvas=document.createElement("canvas");canvas.width=480;canvas.height=320;
 const gl=canvas.getContext("webgl",{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)return null;
 const vertex=gl.createShader(gl.VERTEX_SHADER)!,fragment=gl.createShader(gl.FRAGMENT_SHADER)!;
 gl.shaderSource(vertex,"attribute vec2 a;varying vec2 uv;void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}");
 gl.shaderSource(fragment,`precision mediump float;varying vec2 uv;uniform float time;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 float fbm(vec2 p){float n=0.;float a=.5;for(int i=0;i<5;i++){n+=noise(p)*a;p=p*2.03+vec2(13.7,9.2);a*=.5;}return n;}
 void main(){vec2 q=vec2(uv.x*8.,uv.y*4.-time*1.35);float warp=fbm(q*.65+vec2(time*.12,0.));float n=fbm(q+vec2(warp*1.7,0.));float shape=1.-uv.y*1.65+(n-.48)*1.7;float heat=clamp(shape,0.,1.);float core=pow(heat,2.4);vec3 color=vec3(heat*1.35,core*.98,pow(heat,7.)*.53);float alpha=smoothstep(.03,.3,heat)*(1.-smoothstep(.35,1.,uv.y));gl_FragColor=vec4(color,alpha);}`);
 gl.compileShader(vertex);gl.compileShader(fragment);const program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);return null;}
 const buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.useProgram(program);const position=gl.getAttribLocation(program,"a");gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);const timer=gl.getUniformLocation(program,"time");gl.viewport(0,0,480,320);
 return {render(time:number){if(gl.isContextLost())return null;gl.uniform1f(timer,time);gl.drawArrays(gl.TRIANGLES,0,6);return canvas;},dispose(){gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);gl.getExtension("WEBGL_lose_context")?.loseContext();}};
}

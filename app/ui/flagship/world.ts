import * as THREE from "three";
import { clamp, mix, random, smooth, terrain, trees } from "./model";
import type { ASSETS, Frame, WorldEngine } from "./model";

const noiseGLSL = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.03+vec2(13.7,9.2);a*=.5;}return n;}
float ease(float a,float b,float v){return smoothstep(a,b,v);}
`;
const backgroundVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const backgroundFragment = `precision highp float;varying vec2 vUv;uniform sampler2D uForest,uCanopy;uniform float uP,uTime,uIntro,uAspect;uniform vec2 uPointer;${noiseGLSL}
vec2 cover(vec2 uv,float ratio){float screen=uAspect;return (uv-.5)*vec2(min(1.,screen/ratio),min(1.,ratio/screen))+.5;}
void main(){
 float p=uP,t=uTime;vec2 uv=vUv;float push=ease(0.,.17,p);vec2 source=cover(uv,1.777);
 source=(source-.5)/(1.+push*.18+(1.-uIntro)*.11)+.5+uPointer*vec2(.007,.004);source.y+=push*.028;
 float sway=sin(source.y*8.+t*.2)*.0008;source.x+=sway;
 vec3 forest=texture2D(uForest,source).rgb;float lum=dot(forest,vec3(.299,.587,.114));
 float loss=ease(.15,.275,p);float islands=fbm(source*9.)*.8+noise(source*32.)*.2;float scar=smoothstep(islands-.065,islands+.06,loss*.98);
 vec3 bare=mix(vec3(.09,.10,.065),vec3(.035,.045,.034),ease(.235,.30,p));forest=mix(forest,mix(vec3(lum*.24),bare,.7),scar*.94);
 float exposure=.76+sin(t*.13)*.015;forest*=exposure;forest=mix(forest,vec3(lum*.16),ease(.29,.37,p)*.89);
 float rays=pow(max(0.,sin(uv.x*16.+uv.y*3.+.7)),18.)*.022*(1.-loss);forest+=vec3(.70,.77,.45)*rays;
 float smoke=fbm(vec2(uv.x*3.,uv.y*4.-t*.075));float haze=ease(.265,.345,p)*(1.-ease(.39,.46,p));forest=mix(forest,vec3(.09,.105,.085),haze*(.32+smoke*.6));
 float fire=ease(.24,.277,p)*(1.-ease(.306,.343,p));vec2 q=vec2(uv.x*8.,uv.y*7.-t*1.1);float n=fbm(q+vec2(fbm(q*.6)*1.6,0.));float heat=clamp(1.-uv.y*3.1+(n-.5)*1.6,0.,1.);vec3 flame=vec3(heat*1.12,pow(heat,2.8)*.65,pow(heat,8.)*.22);forest+=flame*fire*.75;
 float aerial=ease(.369,.427,p);vec3 canopy=texture2D(uCanopy,cover(uv,1.777)).rgb;float scan=1.-smoothstep(.015,.045,abs(uv.y-(1.-ease(.382,.432,p))));
 forest=mix(forest,canopy*.65,aerial);forest+=scan*vec3(.50,.65,.41)*aerial*(1.-ease(.425,.45,p));
 vec3 lab=vec3(.023,.037,.029)+fbm(uv*4.)*.012;float edgeGrid=(step(.994,fract(uv.x*22.))+step(.994,fract(uv.y*14.)))*.012;lab+=vec3(edgeGrid);
 vec3 color=mix(forest,lab,ease(.425,.477,p));float home=ease(.924,.978,p);color=mix(color,texture2D(uForest,source).rgb*.38,home);
 float vignette=1.-.35*pow(length((uv-.5)*vec2(1.,.85)),1.1);color*=vignette;float grain=(hash(uv*vec2(1900.,1100.)+floor(t*8.))-.5)*.011;color+=grain;
 gl_FragColor=vec4(color,1.);
}`;

const rasterVertex = `varying vec2 vUv;varying float vHeight;void main(){vUv=uv;vHeight=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const rasterFragment = `precision highp float;varying vec2 vUv;varying float vHeight;uniform sampler2D uMap;uniform float uBand,uOpacity,uTime,uCloud,uLoss,uSelected;${noiseGLSL}
void main(){vec2 uv=vUv;vec3 col=texture2D(uMap,uv).rgb;float lum=dot(col,vec3(.299,.587,.114));float h=fbm(uv*13.);
 if(uBand>.5&&uBand<1.5){float speckle=mix(.6,1.3,noise(uv*350.));col=vec3(.22+lum*.65)*speckle;col*=vec3(.88,.99,.93);}
 if(uBand>1.5&&uBand<2.5){col=mix(vec3(.12,.28,.25),vec3(.76,.79,.38),h);col*=.7;}
 if(uBand>2.5){col=mix(col,vec3(.47,.19,.12),smoothstep(.4,.63,h)*.65);}
 float lossRegion=1.-smoothstep(.12,.38,distance(uv,vec2(.69,.47)));float change=lossRegion*uLoss;col=mix(col,vec3(.27,.17,.1),change*.9);
 if(uBand<.5){float cloud=smoothstep(.37,.66,fbm(uv*4.+vec2(uTime*.013,0.)));col=mix(col,vec3(.72,.76,.68),cloud*uCloud*.87);}
 float edge=step(.012,uv.x)*step(.012,uv.y)*step(uv.x,.988)*step(uv.y,.988);float border=(1.-edge)*.18;col+=vec3(.45,.56,.34)*border;
 gl_FragColor=vec4(col,uOpacity);
}`;

const pointsVertex = `attribute vec3 aWild;attribute vec3 aColor;attribute float aSeed;attribute float aId;attribute float aLoss;uniform float uTime,uBlend,uSize,uP,uYear,uSelected,uVelocity,uReduced;varying vec3 vColor;varying float vAlpha;varying float vHeight;varying float vSelected;
void main(){float t=uTime;vec3 wild=aWild;wild.x+=sin(t*.15+aSeed*41.)*.7;wild.y=mod(aWild.y+t*(.2+aSeed*.3),14.)-2.;wild.z+=cos(t*.12+aSeed*33.)*.5;
 wild.x+=uVelocity*sin(aSeed*20.)*.7;wild.y+=uVelocity*.5;
 vec3 destination=position;float removed=step(aLoss,(uYear-2020.)/5.*.37)*smoothstep(.808,.83,uP);float repair=smoothstep(.91,.97,uP);destination.y=mix(destination.y,destination.y*.08,removed*(1.-repair)*.96);
 vec3 pos=mix(wild,destination,uBlend);pos.x+=sin(t+aSeed*12.)*.016*(1.-uReduced)*(1.-uBlend);
 vSelected=1.-step(.5,abs(aId-uSelected));vColor=aColor;vAlpha=mix(.15+aSeed*.4,1.,uBlend);vAlpha*=mix(1.,.15,removed*(1.-repair));vHeight=position.y;
 vec4 mv=modelViewMatrix*vec4(pos,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(uSize*(1.+vSelected*.4)*(145./-mv.z),.7,6.);}
`;
const pointsFragment = `precision highp float;uniform float uP,uOpacity,uBand,uCarbon;varying vec3 vColor;varying float vAlpha;varying float vHeight;varying float vSelected;
void main(){vec2 d=gl_PointCoord-.5;float r=length(d);if(r>.5)discard;float alpha=smoothstep(.5,.15,r)*vAlpha*uOpacity;vec3 c=vColor;
 c=mix(c,vec3(.9,.37,.08),smoothstep(.235,.275,uP)*(1.-smoothstep(.31,.345,uP)));c=mix(c,vec3(.58,.59,.53),smoothstep(.31,.345,uP)*(1.-smoothstep(.395,.465,uP)));
 if(uBand>.5&&uBand<1.5)c=mix(c,vec3(.58,.68,.6),.8);if(uBand>1.5)c=mix(vec3(.32,.64,.58),vec3(.92,.86,.49),clamp(vHeight/3.2,0.,1.));
 float density=smoothstep(.715,.748,uP)*(1.-smoothstep(.8,.83,uP));c=mix(c,mix(vec3(.43,.63,.4),vec3(.87,.75,.40),clamp(vHeight/3.,0.,1.)),density);c=mix(c,vec3(.80,.84,.62),uCarbon*density*.6);
 c=mix(c,vec3(.92,.97,.78),vSelected*smoothstep(.62,.65,uP)*(1.-smoothstep(.715,.735,uP)));
 gl_FragColor=vec4(c,alpha);}`;

const ringVertex = `attribute float aId;varying float vId;uniform float uSelected;void main(){vId=aId;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const ringFragment = `uniform float uScan,uOpacity,uSelected;varying float vId;void main(){if(vId>uScan*144.)discard;float selected=1.-step(.5,abs(vId-uSelected));gl_FragColor=vec4(mix(vec3(.60,.76,.47),vec3(.96,.93,.72),selected),uOpacity*(.52+selected*.48));}`;

export function createWorld(
  canvas: HTMLCanvasElement,
  images: Record<keyof typeof ASSETS, HTMLImageElement>,
  host: HTMLElement,
): WorldEngine {
  if (!images.forest || !images.canopy)
    throw new Error("Critical texture unavailable");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x08100b, 1);
  const mobile = innerWidth <= 760;
  let dpr = Math.min(devicePixelRatio, mobile ? 1.25 : 1.6),
    width = innerWidth,
    height = innerHeight;
  const textures: THREE.Texture[] = [];
  const texture = (img: HTMLImageElement) => {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    textures.push(tex);
    return tex;
  };
  const forest = texture(images.forest),
    canopy = texture(images.canopy);
  const backScene = new THREE.Scene(),
    backCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const backdrop = new THREE.ShaderMaterial({
    vertexShader: backgroundVertex,
    fragmentShader: backgroundFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uForest: { value: forest },
      uCanopy: { value: canopy },
      uP: { value: 0 },
      uTime: { value: 0 },
      uIntro: { value: 0 },
      uAspect: { value: width / height },
      uPointer: { value: new THREE.Vector2() },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdrop);
  backScene.add(quad);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 160);
  const group = new THREE.Group();
  scene.add(group);
  const ground = new THREE.PlaneGeometry(
    13.7,
    11.9,
    mobile ? 50 : 80,
    mobile ? 46 : 70,
  );
  ground.rotateX(-Math.PI / 2);
  const groundPositions = ground.attributes.position;
  for (let i = 0; i < groundPositions.count; i++)
    groundPositions.setY(
      i,
      terrain(groundPositions.getX(i), groundPositions.getZ(i)),
    );
  ground.computeVertexNormals();
  const layers = Array.from({ length: 4 }, (_, i) => {
    const material = new THREE.ShaderMaterial({
      vertexShader: rasterVertex,
      fragmentShader: rasterFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: canopy },
        uBand: { value: i },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uCloud: { value: 0 },
        uLoss: { value: 0 },
        uSelected: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(ground, material);
    mesh.renderOrder = i + 1;
    group.add(mesh);
    return mesh;
  });
  const each = mobile ? 125 : 265,
    count = trees.length * each;
  const pos = new Float32Array(count * 3),
    wild = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    seeds = new Float32Array(count),
    ids = new Float32Array(count),
    losses = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const tree = trees[Math.floor(i / each)],
      r = Math.sqrt(random(i + 194)) * tree.radius,
      angle = random(i + 532) * Math.PI * 2;
    const trunk = i % each < each * 0.09;
    const x = tree.x + (trunk ? (random(i) - 0.5) * 0.05 : Math.cos(angle) * r),
      z = tree.z + (trunk ? (random(i + 1) - 0.5) * 0.05 : Math.sin(angle) * r);
    const relative = trunk
      ? random(i + 192) * tree.height * 0.75
      : tree.height * (0.65 + 0.35 * Math.sqrt(1 - (r / tree.radius) ** 2)) -
        random(i + 970) * 0.14;
    pos.set([x, tree.ground + relative, z], i * 3);
    wild.set(
      [
        (random(i + 122) * 2 - 1) * 19,
        random(i + 72) * 14,
        (random(i + 773) * 2 - 1) * 12,
      ],
      i * 3,
    );
    const shade = 0.6 + random(i + 82) * 0.4;
    colors.set(
      trunk
        ? [0.37 * shade, 0.32 * shade, 0.2 * shade]
        : [
            (0.34 + relative * 0.06) * shade,
            (0.48 + relative * 0.06) * shade,
            (0.22 + relative * 0.045) * shade,
          ],
      i * 3,
    );
    seeds[i] = random(i + 199);
    ids[i] = Math.floor(i / each);
    losses[i] = clamp(
      Math.hypot(tree.x - 2.3, tree.z + 0.5) / 7 +
        random(Math.floor(i / each) + 190) * 0.12,
    );
  }
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pointsGeometry.setAttribute("aWild", new THREE.BufferAttribute(wild, 3));
  pointsGeometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  pointsGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  pointsGeometry.setAttribute("aId", new THREE.BufferAttribute(ids, 1));
  pointsGeometry.setAttribute("aLoss", new THREE.BufferAttribute(losses, 1));
  const pointMaterial = new THREE.ShaderMaterial({
    vertexShader: pointsVertex,
    fragmentShader: pointsFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBlend: { value: 0 },
      uSize: { value: mobile ? 0.4 : 0.34 },
      uP: { value: 0 },
      uYear: { value: 2020 },
      uSelected: { value: 67 },
      uVelocity: { value: 0 },
      uReduced: { value: 0 },
      uOpacity: { value: 0 },
      uBand: { value: 0 },
      uCarbon: { value: 0 },
    },
  });
  const points = new THREE.Points(pointsGeometry, pointMaterial);
  points.frustumCulled = false;
  points.renderOrder = 6;
  group.add(points);
  const ringGeometry = new THREE.RingGeometry(0.94, 1, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  ringGeometry.setAttribute(
    "aId",
    new THREE.InstancedBufferAttribute(
      new Float32Array(trees.map((_, i) => i)),
      1,
    ),
  );
  const ringMaterial = new THREE.ShaderMaterial({
    vertexShader: ringVertex,
    fragmentShader: ringFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uScan: { value: 0 },
      uOpacity: { value: 0 },
      uSelected: { value: 67 },
    },
  });
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, 144);
  const matrix = new THREE.Matrix4();
  trees.forEach((t, i) => {
    matrix.makeScale(t.radius * 1.1, 1, t.radius * 1.1);
    matrix.setPosition(t.x, t.ground + t.height + 0.05, t.z);
    rings.setMatrixAt(i, matrix);
  });
  rings.instanceMatrix.needsUpdate = true;
  rings.renderOrder = 8;
  group.add(rings);
  const gridPositions: number[] = [];
  for (let i = -7; i <= 7; i++) {
    gridPositions.push(i, -0.45, -6, i, -0.45, 6);
  }
  for (let i = -6; i <= 6; i++) {
    gridPositions.push(-7, -0.45, i, 7, -0.45, i);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(gridPositions, 3),
  );
  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x9aa780,
    transparent: true,
    opacity: 0,
  });
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
  group.add(grid);
  const sweepMaterial = new THREE.MeshBasicMaterial({
    color: 0xc5dca7,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const sweep = new THREE.Mesh(
    new THREE.PlaneGeometry(0.025, 12),
    sweepMaterial,
  );
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.y = 3.35;
  sweep.renderOrder = 9;
  group.add(sweep);
  const heightGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(0, 3, 0),
  ]);
  const heightMaterial = new THREE.LineBasicMaterial({
    color: 0xdde5b2,
    transparent: true,
    opacity: 0,
  });
  const heightLine = new THREE.Line(heightGeometry, heightMaterial);
  group.add(heightLine);
  const ghostMaterial = pointMaterial.clone();
  ghostMaterial.uniforms = {
    ...THREE.UniformsUtils.clone(pointMaterial.uniforms),
  };
  const ghost = new THREE.Points(pointsGeometry, ghostMaterial);
  ghost.renderOrder = 5;
  ghost.visible = false;
  group.add(ghost);
  const cameraRight = new THREE.Vector3(),
    cameraUp = new THREE.Vector3();
  const labels = Array.from(
    host.querySelectorAll<HTMLElement>("[data-world-anchor]"),
  );
  const labelPoint = new THREE.Vector3(),
    look = new THREE.Vector3();
  let slowFrames = 0,
    lastTime = 0,
    contextLost = false,
    currentFrame: Frame | null = null;
  const contextLoss = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    host.dataset.webgl = "fallback";
  };
  canvas.addEventListener("webglcontextlost", contextLoss);
  const resize = () => {
    width = canvas.clientWidth || innerWidth;
    height = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    backdrop.uniforms.uAspect.value = width / height;
  };
  resize();
  host.dataset.webgl = "ready";
  host.dataset.points = String(count);
  function update(f: Frame) {
    currentFrame = f;
    if (contextLost) return;
    const p = f.p,
      t = f.time;
    const since = lastTime ? performance.now() - lastTime : 16;
    lastTime = performance.now();
    if (since > 27) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 110 && dpr > 1) {
      dpr = 1;
      resize();
      host.dataset.quality = "adaptive";
      slowFrames = 0;
    }
    backdrop.uniforms.uP.value = p;
    backdrop.uniforms.uTime.value = t;
    backdrop.uniforms.uIntro.value = f.intro;
    backdrop.uniforms.uPointer.value.set(f.pointerX, f.pointerY);
    const data = smooth(p, 0.375, 0.447),
      finish = 1 - smooth(p, 0.914, 0.949),
      fusion = smooth(p, 0.53, 0.56) * (1 - smooth(p, 0.586, 0.619)),
      detection = smooth(p, 0.613, 0.64) * (1 - smooth(p, 0.72, 0.737)),
      mass = smooth(p, 0.72, 0.746) * (1 - smooth(p, 0.801, 0.825)),
      temporal = smooth(p, 0.808, 0.832) * (1 - smooth(p, 0.905, 0.925));
    const cx =
      mix(1, 9, data) -
      smooth(p, 0.62, 0.67) * 6 +
      smooth(p, 0.72, 0.75) * 9 -
      smooth(p, 0.8, 0.845) * 11 +
      smooth(p, 0.9, 0.94) * 8;
    const cy =
      mix(4, 12, data) +
      smooth(p, 0.62, 0.675) * 5 -
      smooth(p, 0.72, 0.75) * 8 +
      smooth(p, 0.8, 0.85) * 16 -
      smooth(p, 0.9, 0.94) * 10;
    const cz =
      mix(18, 16, data) -
      smooth(p, 0.62, 0.68) * 4 +
      smooth(p, 0.72, 0.75) * 5 -
      smooth(p, 0.8, 0.85) * 13 +
      smooth(p, 0.9, 0.94) * 13;
    camera.position.set(
      cx + f.pointerX * 0.22,
      cy - f.pointerY * 0.15,
      cz + (f.mobile ? 9 : 0),
    );
    look.set(0, 1.1 + fusion * 0.7, 0);
    camera.lookAt(look);
    const composition = f.mobile ? 0 : mix(4.4, -4.4, mass);
    // Compose the survey in camera space so it remains beside desktop copy and below mobile copy.
    camera.updateMatrixWorld();
    group.position.set(0, 0, 0);
    const horizontal = cameraRight.setFromMatrixColumn(camera.matrixWorld, 0),
      vertical = cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
    group.position.addScaledVector(horizontal, composition * data);
    group.position.addScaledVector(vertical, (f.mobile ? -5.6 : 0.35) * data);
    group.rotation.y =
      -0.06 + data * 0.02 + (f.reduced ? 0 : Math.sin(t * 0.06) * 0.012);
    group.scale.setScalar(f.mobile ? 0.48 : 0.76);
    const band = f.layer === "sar" ? 1 : f.layer === "lidar" ? 2 : 0;
    const study = smooth(p, 0.448, 0.466) * (1 - smooth(p, 0.53, 0.55));
    layers.forEach((mesh, i) => {
      const mat = mesh.material as THREE.ShaderMaterial;
      mesh.position.y = i * fusion * 1.45;
      mat.uniforms.uOpacity.value =
        data *
        finish *
        (i === 0
          ? 0.89 - mass * 0.43 - detection * 0.3
          : fusion * (i === 3 ? 0.38 : 0.58));
      mat.uniforms.uBand.value = i === 0 ? mix(0, band, study) : i;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCloud.value =
        i === 0 && f.layer === "optical" && f.clouds ? study * 0.9 : 0;
      mat.uniforms.uLoss.value = (temporal * (f.year - 2020)) / 5;
    });
    const u = pointMaterial.uniforms;
    u.uTime.value = t;
    u.uVelocity.value = f.reduced ? 0 : Math.max(-1, Math.min(1, f.velocity));
    u.uP.value = p;
    u.uBlend.value = smooth(p, 0.352, 0.455);
    u.uSize.value = (f.mobile ? 0.36 : 0.32) * dpr;
    u.uYear.value = f.year;
    u.uSelected.value = f.selected;
    u.uReduced.value = f.reduced ? 1 : 0;
    u.uCarbon.value = f.carbon ? 1 : 0;
    u.uBand.value = study * band + mass * 2;
    u.uOpacity.value =
      finish *
      (p < 0.35 ? 0.09 + smooth(p, 0.24, 0.31) * 0.1 : mix(0.34, 0.84, data)) *
      (1 - fusion * 0.62);
    if (p > 0.44 && p < 0.535 && f.layer !== "lidar") u.uOpacity.value *= 0.24;
    ringMaterial.uniforms.uOpacity.value = detection;
    ringMaterial.uniforms.uScan.value = smooth(p, 0.623, 0.684);
    ringMaterial.uniforms.uSelected.value = f.selected;
    rings.visible = detection > 0.001;
    sweep.position.x = mix(-7, 7, smooth(p, 0.623, 0.684));
    sweepMaterial.opacity = detection * (1 - smooth(p, 0.684, 0.713)) * 0.4;
    gridMaterial.opacity = data * finish * 0.15;
    const selectedTree = trees[f.selected];
    heightLine.position.set(
      selectedTree.x,
      selectedTree.ground,
      selectedTree.z,
    );
    heightLine.scale.y = selectedTree.height / 3;
    heightMaterial.opacity = detection * 0.7;
    ghost.visible = temporal > 0.01;
    ghostMaterial.uniforms.uBlend.value = 1;
    ghostMaterial.uniforms.uP.value = 0.68;
    ghostMaterial.uniforms.uYear.value = 2020;
    ghostMaterial.uniforms.uOpacity.value = temporal * 0.14;
    ghostMaterial.uniforms.uBand.value = 1;
    ghostMaterial.uniforms.uSize.value = u.uSize.value * 0.8;
    if (f.reviewed && p > 0.909) {
      ringMaterial.uniforms.uOpacity.value = finish * 0.75;
      rings.visible = true;
      ringMaterial.uniforms.uScan.value = 1;
      ringMaterial.uniforms.uSelected.value = 67;
    }
    renderer.clear();
    renderer.render(backScene, backCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);
    for (const label of labels) {
      const name = label.dataset.worldAnchor!;
      if (name === "tree") {
        labelPoint.set(
          selectedTree.x,
          selectedTree.ground + selectedTree.height,
          selectedTree.z,
        );
        group.localToWorld(labelPoint);
        labelPoint.project(camera);
        label.style.transform = `translate3d(${Math.max(20, Math.min(width - (f.mobile ? 139 : 185), (labelPoint.x * 0.5 + 0.5) * width + 20))}px,${Math.max(100, Math.min(height - 190, (-labelPoint.y * 0.5 + 0.5) * height - 35))}px,0)`;
      } else {
        const i = Number(name.split("-")[1]);
        labelPoint.set(6.9, 0.2 + i * fusion * 1.45, 3.5);
        group.localToWorld(labelPoint);
        labelPoint.project(camera);
        label.style.transform = `translate3d(${Math.min(width - (f.mobile ? 82 : 158), (labelPoint.x * 0.5 + 0.5) * width)}px,${(-labelPoint.y * 0.5 + 0.5) * height}px,0)`;
        label.style.opacity = String(fusion);
      }
    }
    host.dataset.renderCalls = String(renderer.info.render.calls);
  }
  return {
    update,
    resize,
    pick(x, y) {
      if (!currentFrame) return null;
      let best = 42,
        index: number | null = null;
      for (let i = 0; i < trees.length; i++) {
        const tree = trees[i];
        labelPoint.set(tree.x, tree.ground + tree.height, tree.z);
        group.localToWorld(labelPoint);
        labelPoint.project(camera);
        const distance = Math.hypot(
          (labelPoint.x * 0.5 + 0.5) * width - x,
          (-labelPoint.y * 0.5 + 0.5) * height - y,
        );
        if (distance < best) {
          best = distance;
          index = i;
        }
      }
      return index;
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", contextLoss);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      for (const s of [scene, backScene])
        s.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry) geometries.add(mesh.geometry);
          if (mesh.material) {
            if (Array.isArray(mesh.material))
              mesh.material.forEach((m) => materials.add(m));
            else materials.add(mesh.material);
          }
        });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
    },
  };
}

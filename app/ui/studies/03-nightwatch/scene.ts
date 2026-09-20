import * as THREE from 'three'
import { clamp01, easeInOutCubic, easeOutCubic, lerp, makeNoise2D, mulberry32, seg, smoothstep } from '../lib/math'
import { makeForestMask } from '../lib/mask'
import { perfTier } from '../lib/narrative'

/**
 * Concept 03 is a point-cloud piece. The forest is never a mesh; it is only
 * ever a sampling of returns, which is exactly what LiDAR and SAR deliver.
 * The scroll drives light level, then a radar wavefront across the scene.
 */

const WORLD = { x0: -110, x1: 110, z0: -190, z1: 30 }

export interface NightScene {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
}

export function createNightScene(canvas: HTMLCanvasElement): NightScene {
  const tier = perfTier()
  const TREES = tier === 'low' ? 110 : tier === 'mid' ? 210 : 330
  const CROWN_PTS = tier === 'low' ? 150 : tier === 'mid' ? 300 : 420
  const TRUNK_PTS = tier === 'low' ? 14 : 26

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 1.1 : 1.6))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x060d0a)
  const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 1200)
  camera.position.set(0, 2.2, 18)

  const mask = makeForestMask(256, 21)
  const maskTex = new THREE.CanvasTexture(mask.canvas)
  const noise = makeNoise2D(29)
  const rnd = mulberry32(777)

  const u2w = (u: number) => lerp(WORLD.x0, WORLD.x1, u)
  const v2w = (v: number) => lerp(WORLD.z0, WORLD.z1, v)
  const w2u = (x: number) => clamp01((x - WORLD.x0) / (WORLD.x1 - WORLD.x0))
  const w2v = (z: number) => clamp01((z - WORLD.z0) / (WORLD.z1 - WORLD.z0))

  /* ------------------------------------------------------------------ */
  /* forest point cloud                                                  */
  /* ------------------------------------------------------------------ */

  const trees: { x: number; z: number; h: number; r: number; cleared: number; id: number }[] = []
  for (let i = 0; i < TREES; i++) {
    const x = WORLD.x0 + rnd() * (WORLD.x1 - WORLD.x0)
    const z = WORLD.z0 + rnd() * (WORLD.z1 - WORLD.z0)
    const m = mask.sample(w2u(x), w2v(z))
    trees.push({
      x,
      z,
      h: 11 + rnd() * 17 + noise(x * 0.03, z * 0.03) * 5,
      r: 2.6 + rnd() * 3.4,
      cleared: m > 0.4 ? 1 : 0,
      id: i,
    })
  }

  const total = TREES * (CROWN_PTS + TRUNK_PTS)
  const pos = new Float32Array(total * 3)
  const aCleared = new Float32Array(total)
  const aSeed = new Float32Array(total)
  const aHnorm = new Float32Array(total)
  const aHue = new Float32Array(total)
  const aBase = new Float32Array(total)

  let n = 0
  for (const T of trees) {
    const hue = (T.id * 0.6180339887) % 1
    // trunk returns
    for (let i = 0; i < TRUNK_PTS; i++) {
      const t = i / TRUNK_PTS
      const y = t * T.h * 0.72
      const a = rnd() * Math.PI * 2
      const rr = 0.28 + rnd() * 0.22
      pos[n * 3] = T.x + Math.cos(a) * rr
      pos[n * 3 + 1] = y
      pos[n * 3 + 2] = T.z + Math.sin(a) * rr
      aCleared[n] = T.cleared
      aSeed[n] = rnd()
      aHnorm[n] = y / 32
      aHue[n] = hue
      aBase[n] = 0
      n++
    }
    // crown returns: shell of an ellipsoid, denser at the top
    for (let i = 0; i < CROWN_PTS; i++) {
      const u = rnd()
      const v = rnd()
      const theta = u * Math.PI * 2
      const phi = Math.acos(2 * v - 1)
      const shell = 0.62 + Math.pow(rnd(), 0.4) * 0.38
      const cy = T.h * 0.78
      const rx = T.r * shell
      const ry = T.r * 0.82 * shell
      const px = T.x + Math.sin(phi) * Math.cos(theta) * rx
      const py = cy + Math.cos(phi) * ry
      const pz = T.z + Math.sin(phi) * Math.sin(theta) * rx
      pos[n * 3] = px
      pos[n * 3 + 1] = py
      pos[n * 3 + 2] = pz
      aCleared[n] = T.cleared
      aSeed[n] = rnd()
      aHnorm[n] = clamp01(py / 32)
      aHue[n] = hue
      aBase[n] = 1
      n++
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aCleared', new THREE.BufferAttribute(aCleared, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1))
  geo.setAttribute('aHnorm', new THREE.BufferAttribute(aHnorm, 1))
  geo.setAttribute('aHue', new THREE.BufferAttribute(aHue, 1))
  geo.setAttribute('aBase', new THREE.BufferAttribute(aBase, 1))

  const U = {
    uTime: { value: 0 },
    uLight: { value: 1 }, // ambient visibility, 1 = dusk, 0 = blind
    uRemoved: { value: 0 }, // clearing happens unseen, in the dark
    uSweep: { value: -400 }, // world x of the radar wavefront
    uSar: { value: 0 }, // how much of the SAR look is active
    uChm: { value: 0 }, // canopy-height colouring
    uSeg: { value: 0 }, // per-crown instance colouring
    uSize: { value: 1 },
    uFade: { value: 1 },
  }

  const vert = [
    'attribute float aCleared, aSeed, aHnorm, aHue, aBase;',
    'uniform float uTime, uRemoved, uSweep, uSar, uSize, uChm;',
    'varying float vSeed, vHnorm, vHue, vSar, vEdge, vBase, vDepth, vAlive;',
    'void main(){',
    '  vSeed = aSeed; vHnorm = aHnorm; vHue = aHue; vBase = aBase;',
    '  vec3 p = position;',
    '  // trees inside a clearing collapse while nobody can see them',
    '  float gone = aCleared * uRemoved;',
    '  p.y *= (1.0 - gone * 0.96);',
    '  p.x += gone * (aSeed - 0.5) * 5.0;',
    '  p.z += gone * (aSeed - 0.5) * 5.0;',
    '  vAlive = 1.0 - gone;',
    '  // living canopy breathes',
    '  float breathe = (1.0 - uSar) * aBase * 0.25;',
    '  p.x += sin(uTime * 0.5 + aSeed * 30.0) * breathe;',
    '  p.z += cos(uTime * 0.42 + aSeed * 21.0) * breathe;',
    '  vSar = smoothstep(uSweep + 7.0, uSweep - 7.0, position.x) * uSar;',
    '  vEdge = exp(-pow((position.x - uSweep) / 5.0, 2.0)) * uSar;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '  float sz = mix(1.0, 1.55, uChm) * uSize * (0.7 + aSeed * 0.7);',
    '  gl_PointSize = clamp(sz * (170.0 / max(1.0, -mv.z)), 1.0, 9.0);',
    '}',
  ].join('\n')

  const frag = [
    'uniform float uTime, uLight, uSar, uChm, uSeg, uFade;',
    'varying float vSeed, vHnorm, vHue, vSar, vEdge, vBase, vDepth, vAlive;',
    'vec3 hue2rgb(float h){',
    '  vec3 k = mod(vec3(5.0,3.0,1.0) + h*6.0, 6.0);',
    '  return 0.55 - 0.45*clamp(min(k, 4.0-k), -1.0, 1.0);',
    '}',
    'void main(){',
    '  if (vAlive < 0.06) discard;',
    '  vec2 q = gl_PointCoord - 0.5;',
    '  float d = length(q);',
    '  if (d > 0.5) discard;',
    '  float soft = smoothstep(0.5, 0.15, d);',
    '  // optical: living canopy at dusk',
    '  vec3 optical = mix(vec3(0.10,0.07,0.05), mix(vec3(0.07,0.24,0.11), vec3(0.34,0.55,0.24), vHnorm), vBase);',
    '  // SAR: speckled backscatter, no colour, sees in the dark',
    '  float speckle = fract(sin(vSeed*91.7 + floor(uTime*3.0)*0.37)*43758.5453);',
    '  speckle = 0.35 + speckle*0.9;',
    '  vec3 sar = vec3(0.56,0.70,0.86) * speckle * (0.45 + vHnorm*0.9);',
    '  // canopy height model',
    '  float h = clamp(vHnorm*1.5, 0.0, 1.0);',
    '  vec3 chm = h < 0.5 ? mix(vec3(0.07,0.15,0.5), vec3(0.16,0.72,0.42), h/0.5)',
    '                     : mix(vec3(0.16,0.72,0.42), vec3(0.98,0.84,0.26), (h-0.5)/0.5);',
    '  chm = mix(chm, vec3(1.0,0.36,0.22), smoothstep(0.82, 1.0, h));',
    '  vec3 col = optical * mix(0.055, 1.0, uLight);',
    '  col = mix(col, sar, vSar);',
    '  col = mix(col, chm, uChm);',
    '  col = mix(col, mix(chm, hue2rgb(vHue), 0.72) * (0.5 + vHnorm*0.7), uSeg);',
    '  col += vec3(0.65,0.86,1.0) * vEdge * 1.6;',
    '  float distFade = smoothstep(420.0, 60.0, vDepth);',
    '  float a = soft * uFade * mix(0.42, 1.0, distFade);',
    '  if (a < 0.012) discard;',
    '  gl_FragColor = vec4(col, a);',
    '}',
  ].join('\n')

  const cloud = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  cloud.frustumCulled = false
  scene.add(cloud)

  /* ---------------- fireflies ---------------- */

  const FF = tier === 'low' ? 120 : 320
  const ffPos = new Float32Array(FF * 3)
  const ffSeed = new Float32Array(FF)
  for (let i = 0; i < FF; i++) {
    ffPos[i * 3] = WORLD.x0 * 0.5 + rnd() * (WORLD.x1 - WORLD.x0) * 0.5
    ffPos[i * 3 + 1] = 0.5 + rnd() * 12
    ffPos[i * 3 + 2] = WORLD.z0 * 0.5 + rnd() * (WORLD.z1 - WORLD.z0) * 0.6
    ffSeed[i] = rnd()
  }
  const ffGeo = new THREE.BufferGeometry()
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3))
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeed, 1))
  const ffU = { uTime: { value: 0 }, uAlive: { value: 1 } }
  const fireflies = new THREE.Points(
    ffGeo,
    new THREE.ShaderMaterial({
      uniforms: ffU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute float aSeed; uniform float uTime; varying float vS;',
        'void main(){ vS = aSeed; vec3 p = position;',
        '  p.x += sin(uTime*0.6 + aSeed*40.0)*2.4; p.y += sin(uTime*0.45 + aSeed*17.0)*1.3;',
        '  p.z += cos(uTime*0.5 + aSeed*23.0)*2.0;',
        '  vec4 mv = modelViewMatrix*vec4(p,1.0);',
        '  gl_PointSize = clamp(3.2*(170.0/max(1.0,-mv.z)), 1.0, 8.0);',
        '  gl_Position = projectionMatrix*mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime, uAlive; varying float vS;',
        'void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard;',
        '  float blink = smoothstep(0.55, 1.0, sin(uTime*1.7 + vS*62.0)*0.5+0.5);',
        '  float life = step(vS, uAlive);',
        '  float a = smoothstep(0.5,0.0,d) * blink * life;',
        '  if(a<0.02) discard;',
        '  gl_FragColor = vec4(vec3(1.0,0.86,0.42)*a, a); }',
      ].join('\n'),
    }),
  )
  fireflies.frustumCulled = false
  scene.add(fireflies)

  /* ---------------- disturbance flashes in the dark ---------------- */

  const FLASHES = 7
  const flPos = new Float32Array(FLASHES * 3)
  const flSeed = new Float32Array(FLASHES)
  for (let i = 0; i < FLASHES; i++) {
    const b = [
      [0.16, 0.58],
      [0.6, 0.74],
      [0.68, 0.26],
      [0.08, 0.16],
      [0.4, 0.5],
      [0.45, 0.85],
      [0.3, 0.32],
    ][i]
    flPos[i * 3] = u2w(b[0] + 0.05)
    flPos[i * 3 + 1] = 1.6
    flPos[i * 3 + 2] = v2w(b[1] + 0.05)
    flSeed[i] = rnd()
  }
  const flGeo = new THREE.BufferGeometry()
  flGeo.setAttribute('position', new THREE.BufferAttribute(flPos, 3))
  flGeo.setAttribute('aSeed', new THREE.BufferAttribute(flSeed, 1))
  const flU = { uTime: { value: 0 }, uActive: { value: 0 } }
  const flashes = new THREE.Points(
    flGeo,
    new THREE.ShaderMaterial({
      uniforms: flU,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute float aSeed; varying float vS;',
        'void main(){ vS = aSeed; vec4 mv = modelViewMatrix*vec4(position,1.0);',
        '  gl_PointSize = clamp(26.0*(170.0/max(1.0,-mv.z)), 2.0, 60.0);',
        '  gl_Position = projectionMatrix*mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime, uActive; varying float vS;',
        'void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard;',
        '  float ph = fract(uTime*0.33 + vS);',
        '  float pulse = pow(max(0.0, 1.0 - abs(ph - 0.5)*9.0), 6.0);',
        '  float a = smoothstep(0.5,0.0,d) * pulse * uActive;',
        '  if(a<0.01) discard;',
        '  gl_FragColor = vec4(vec3(1.0,0.62,0.22)*a, a*0.9); }',
      ].join('\n'),
    }),
  )
  flashes.frustumCulled = false
  scene.add(flashes)

  /* ---------------- the satellite pass ---------------- */

  const orbitU = { uTime: { value: 0 }, uProg: { value: 0 }, uOn: { value: 0 } }
  const orbitGeo = new THREE.BufferGeometry()
  const OP = 120
  const opArr = new Float32Array(OP * 3)
  const opT = new Float32Array(OP)
  for (let i = 0; i < OP; i++) {
    const t = i / (OP - 1)
    opArr[i * 3] = lerp(WORLD.x0 - 40, WORLD.x1 + 40, t)
    opArr[i * 3 + 1] = 96 + Math.sin(t * Math.PI) * 10
    opArr[i * 3 + 2] = lerp(WORLD.z0 - 30, WORLD.z1 + 10, t * 0.5 + 0.2)
    opT[i] = t
  }
  orbitGeo.setAttribute('position', new THREE.BufferAttribute(opArr, 3))
  orbitGeo.setAttribute('aT', new THREE.BufferAttribute(opT, 1))
  const orbit = new THREE.Points(
    orbitGeo,
    new THREE.ShaderMaterial({
      uniforms: orbitU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute float aT; varying float vT; uniform float uProg;',
        'void main(){ vT = aT; vec4 mv = modelViewMatrix*vec4(position,1.0);',
        '  gl_PointSize = clamp(mix(1.6, 9.0, step(abs(aT-uProg), 0.012))*(220.0/max(1.0,-mv.z)), 1.0, 14.0);',
        '  gl_Position = projectionMatrix*mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform float uProg, uOn; varying float vT;',
        'void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard;',
        '  float trail = smoothstep(0.24, 0.0, uProg - vT) * step(vT, uProg);',
        '  float head = smoothstep(0.02, 0.0, abs(vT - uProg));',
        '  float a = smoothstep(0.5,0.0,d) * (trail*0.30 + head) * uOn;',
        '  if(a<0.01) discard;',
        '  gl_FragColor = vec4(vec3(0.72,0.88,1.0)*a, a); }',
      ].join('\n'),
    }),
  )
  orbit.frustumCulled = false
  scene.add(orbit)

  /* ---------------- ground ---------------- */

  const groundU = {
    uMask: { value: maskTex },
    uSweep: { value: -400 },
    uSar: { value: 0 },
    uLight: { value: 1 },
    uTime: { value: 0 },
    uData: { value: 0 },
    uCam: { value: new THREE.Vector3() },
  }

  // The plane is much larger than the surveyed cell so its far edge never
  // enters frame; the mask stays pinned to the cell in world space, and the
  // surface dissolves with distance instead of ending at a hard line.
  const GX = (WORLD.x1 - WORLD.x0) * 2.6
  const GZ = (WORLD.z1 - WORLD.z0) * 2.6

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GX, GZ),
    new THREE.ShaderMaterial({
      uniforms: groundU,
      transparent: true,
      depthWrite: false,
      vertexShader: [
        'varying vec2 vUv; varying vec3 vW;',
        'void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz;',
        '  gl_Position = projectionMatrix*viewMatrix*wp; }',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uMask; uniform float uSweep, uSar, uLight, uTime, uData;',
        'uniform vec3 uCam;',
        'varying vec2 vUv; varying vec3 vW;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
        'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
        '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }',
        'void main(){',
        `  vec2 muv = (vW.xz - vec2(${WORLD.x0.toFixed(1)}, ${WORLD.z0.toFixed(1)})) / vec2(${(WORLD.x1 - WORLD.x0).toFixed(1)}, ${(WORLD.z1 - WORLD.z0).toFixed(1)});`,
        '  float inCell = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);',
        '  float m = texture2D(uMask, clamp(muv, 0.0, 1.0)).r * inCell;',
        '  float sar = smoothstep(uSweep + 7.0, uSweep - 7.0, vW.x) * uSar;',
        // forest floor: mottled litter, not a flat fill
        '  float n = vnoise(vW.xz * 0.055) * 0.62 + vnoise(vW.xz * 0.23) * 0.38;',
        '  vec3 night = mix(vec3(0.007,0.013,0.010), vec3(0.021,0.038,0.027), n) * mix(0.4, 1.0, uLight);',
        '  float sp = 0.4 + hash(floor(muv*420.0) + floor(uTime*3.0))*0.75;',
        // under radar, bare ground is a specular void and forest is rough/bright
        '  vec3 radar = mix(vec3(0.30,0.40,0.52)*sp, vec3(0.02,0.03,0.05), m);',
        '  vec3 col = mix(night, radar, sar * inCell);',
        '  float grid = step(0.985, fract(muv.x*44.0)) + step(0.985, fract(muv.y*44.0));',
        '  col += vec3(0.25,0.55,0.48) * grid * uData * 0.5 * inCell;',
        '  float edge = exp(-pow((vW.x - uSweep)/5.0, 2.0)) * uSar * inCell;',
        '  col += vec3(0.5,0.75,1.0) * edge;',
        // fade out with distance from the lens so the surface has no visible edge
        '  float d = length(vW.xz - uCam.xz);',
        '  float reach = mix(170.0, 560.0, max(uSar, uData));',
        '  float fade = 1.0 - smoothstep(reach * 0.32, reach, d);',
        '  float a = clamp(0.30 + sar*0.70 + uData*0.5, 0.0, 1.0) * fade;',
        '  if (a < 0.004) discard;',
        '  gl_FragColor = vec4(col, a);',
        '}',
      ].join('\n'),
    }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set((WORLD.x0 + WORLD.x1) / 2, 0, (WORLD.z0 + WORLD.z1) / 2)
  scene.add(ground)

  /* ---------------- the sensor stack ---------------- */

  const planeGroup = new THREE.Group()
  scene.add(planeGroup)
  const planeUniforms: { uReveal: { value: number }; uCollapse: { value: number }; uTime: { value: number } }[] = []
  const PLANE_W = 120
  for (let k = 0; k < 4; k++) {
    const u = {
      uMask: { value: maskTex },
      uMode: { value: k },
      uReveal: { value: 0 },
      uCollapse: { value: 0 },
      uTime: { value: 0 },
    }
    planeUniforms.push(u as any)
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PLANE_W, PLANE_W * 0.72, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: [
          'uniform sampler2D uMask; uniform float uMode, uReveal, uCollapse, uTime;',
          'varying vec2 vUv;',
          'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
          'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
          '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }',
          'float fbm(vec2 p){ return vnoise(p)*0.55+vnoise(p*2.1)*0.3+vnoise(p*4.7)*0.15; }',
          'void main(){',
          '  vec2 uv = vUv;',
          '  float m = texture2D(uMask, uv).r;',
          '  float n = fbm(uv*26.0);',
          '  vec3 col;',
          '  if (uMode < 0.5) {',
          '    float sp = 0.35 + hash(floor(uv*520.0)+floor(uTime*4.0))*0.85;',
          '    col = mix(vec3(0.42,0.54,0.68)*sp, vec3(0.03,0.04,0.06), m);',
          '  } else if (uMode < 1.5) {',
          '    col = mix(mix(vec3(0.05,0.13,0.06), vec3(0.11,0.26,0.10), n), mix(vec3(0.30,0.22,0.13), vec3(0.42,0.32,0.19), n), m);',
          '  } else if (uMode < 2.5) {',
          '    float ndvi = clamp((1.0-m)*(0.55+n*0.55), 0.0, 1.0);',
          '    col = ndvi < 0.35 ? mix(vec3(0.55,0.10,0.06), vec3(0.90,0.65,0.16), ndvi/0.35)',
          '                      : mix(vec3(0.90,0.65,0.16), vec3(0.10,0.66,0.28), (ndvi-0.35)/0.65);',
          '  } else {',
          '    float h = clamp((1.0-m)*(0.4+n*0.85), 0.0, 1.0);',
          '    h = floor(h*9.0)/9.0;',
          '    col = h < 0.5 ? mix(vec3(0.06,0.12,0.42), vec3(0.14,0.68,0.40), h/0.5)',
          '                  : mix(vec3(0.14,0.68,0.40), vec3(0.99,0.85,0.28), (h-0.5)/0.5);',
          '  }',
          '  float wipe = smoothstep(uReveal - 0.25, uReveal, uv.x);',
          '  float a = (1.0 - wipe) * mix(0.9, 0.38, uCollapse);',
          '  float frame = step(0.995, max(abs(uv.x-0.5), abs(uv.y-0.5))*2.0);',
          '  col += vec3(0.6,0.9,0.85)*frame*0.6;',
          '  if (a < 0.01) discard;',
          '  gl_FragColor = vec4(col, a);',
          '}',
        ].join('\n'),
      }),
    )
    mesh.position.set(k * 9 - 13, 30 - k * 3.5, -112 - k * 44)
    planeGroup.add(mesh)
  }

  /* ---------------- frame ---------------- */

  const target = new THREE.Vector3()
  const bg = new THREE.Color()
  const BG_DUSK = new THREE.Color(0x0a1912)
  const BG_NIGHT = new THREE.Color(0x02040a)
  const BG_DATA = new THREE.Color(0x03070e)
  let time = 0

  function update(p: number, dt: number) {
    time += dt

    /* light script */
    const light = 1 - smoothstep(seg(p, 0.13, 0.31))
    const sarActive = smoothstep(seg(p, 0.42, 0.5))
    const sweepT = easeInOutCubic(seg(p, 0.44, 0.62))
    const sweepX = lerp(WORLD.x1 + 60, WORLD.x0 - 60, sweepT)
    const chm = smoothstep(seg(p, 0.79, 0.88))
    const segT = smoothstep(seg(p, 0.9, 0.97))
    const stack = smoothstep(seg(p, 0.63, 0.7))
    const collapse = smoothstep(seg(p, 0.74, 0.82))

    U.uTime.value = time
    U.uLight.value = light
    U.uRemoved.value = smoothstep(seg(p, 0.31, 0.4))
    U.uSweep.value = sweepX
    U.uSar.value = sarActive * (1 - smoothstep(seg(p, 0.76, 0.84)))
    U.uChm.value = chm
    U.uSeg.value = segT
    U.uFade.value = 1 - smoothstep(seg(p, 0.63, 0.68)) * (1 - smoothstep(seg(p, 0.78, 0.84)))
    U.uSize.value = lerp(1, 1.5, chm)

    ffU.uTime.value = time
    ffU.uAlive.value = 1 - smoothstep(seg(p, 0.15, 0.3))
    flU.uTime.value = time
    flU.uActive.value = Math.sin(seg(p, 0.3, 0.45) * Math.PI) * 0.9
    orbitU.uTime.value = time
    orbitU.uProg.value = seg(p, 0.4, 0.62)
    orbitU.uOn.value = smoothstep(seg(p, 0.38, 0.44)) * (1 - smoothstep(seg(p, 0.66, 0.72)))

    groundU.uSweep.value = sweepX
    groundU.uSar.value = U.uSar.value
    groundU.uLight.value = light
    groundU.uTime.value = time
    groundU.uData.value = chm

    for (let k = 0; k < planeUniforms.length; k++) {
      const u: any = planeUniforms[k]
      u.uTime.value = time
      u.uReveal.value = 1 - smoothstep(seg(p, 0.64 + k * 0.018, 0.73 + k * 0.018))
      u.uCollapse.value = collapse
      const mesh = planeGroup.children[k] as THREE.Mesh
      const spread = lerp(1, 0.04, collapse)
      mesh.position.z = -112 - k * 44 * spread
      mesh.position.x = lerp(k * 9 - 13, 0, collapse)
      mesh.position.y = lerp(30 - k * 3.5, 20, collapse)
      const mat = mesh.material as THREE.ShaderMaterial
      mat.visible = stack > 0.01 && collapse < 0.995
      void mat
    }
    planeGroup.visible = stack > 0.01 && collapse < 0.99

    /* background */
    bg.copy(BG_DUSK).lerp(BG_NIGHT, smoothstep(seg(p, 0.12, 0.3)))
    bg.lerp(BG_DATA, smoothstep(seg(p, 0.6, 0.78)))
    ;(scene.background as THREE.Color).copy(bg)

    /* camera */
    const push = easeInOutCubic(seg(p, 0.02, 0.3))
    const back = easeInOutCubic(seg(p, 0.44, 0.64))
    const fly = easeInOutCubic(seg(p, 0.64, 0.8))
    const rise = easeOutCubic(seg(p, 0.8, 0.95))

    const camZ = 18 - push * 46 + back * 34 - fly * 66
    const camY = 2.2 + back * 16 + fly * 10 + rise * 44
    const orb = seg(p, 0.86, 1) * 0.9
    camera.position.set(Math.sin(time * 0.06 + orb * 2.2) * (6 + rise * 44), camY, camZ)
    // during the fusion beat the eye should sit on the plane stack, not below it
    target.set(0, lerp(9, 14, rise) - rise * 12 + fly * 13, camera.position.z - lerp(52, 96, Math.max(back, fly)) + rise * 40)
    camera.lookAt(target)
    camera.rotation.z = Math.sin(time * 0.09) * 0.008
    // the ground fade keys off the lens, so it is set after the camera moves
    groundU.uCam.value.copy(camera.position)

    renderer.render(scene, camera)
  }

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  function dispose() {
    scene.traverse((o) => {
      const any = o as any
      any.geometry?.dispose?.()
      const m = any.material
      if (Array.isArray(m)) m.forEach((x: any) => x.dispose?.())
      else m?.dispose?.()
    })
    maskTex.dispose()
    renderer.dispose()
  }

  return { update, resize, dispose }
}

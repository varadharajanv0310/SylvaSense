import * as THREE from 'three'
import { clamp01, easeInOutCubic, easeOutCubic, lerp, makeNoise2D, mulberry32, seg, smoothstep } from '../lib/math'
import { makeLeafTexture } from '../lib/textures'
import { perfTier } from '../lib/narrative'

/* ------------------------------------------------------------------ */
/* Clearing mask                                                       */
/* One canvas drives tree felling, the ground shader and the NDVI grid */
/* so the deforestation pattern is identical in every representation.  */
/* ------------------------------------------------------------------ */

const WORLD = { x0: -150, x1: 150, z0: -210, z1: 60 }

function makeClearingMask(size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, size, size)
  g.lineCap = 'round'
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'

  const rnd = mulberry32(21)

  // trunk road
  g.lineWidth = size * 0.022
  g.beginPath()
  g.moveTo(size * 0.42, size * 1.02)
  g.bezierCurveTo(size * 0.46, size * 0.7, size * 0.38, size * 0.42, size * 0.44, size * -0.02)
  g.stroke()

  // fishbone ribs - the signature settlement pattern
  for (let i = 0; i < 26; i++) {
    const t = i / 25
    const y = size * (1.0 - t * 1.02)
    const x = size * (0.42 + Math.sin(t * 3.1) * 0.03)
    const len = size * (0.1 + rnd() * 0.3) * (1 - Math.abs(t - 0.45))
    g.lineWidth = size * (0.006 + rnd() * 0.01)
    for (const dir of [-1, 1]) {
      if (rnd() < 0.18) continue
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + dir * len, y + (rnd() - 0.5) * size * 0.04)
      g.stroke()
    }
  }

  // block clear-cuts
  const blocks = [
    [0.2, 0.62, 0.15, 0.1],
    [0.58, 0.78, 0.2, 0.13],
    [0.66, 0.3, 0.13, 0.16],
    [0.1, 0.22, 0.12, 0.09],
  ]
  for (const b of blocks) {
    g.beginPath()
    g.rect(b[0] * size, b[1] * size, b[2] * size, b[3] * size)
    g.fill()
  }

  const data = g.getImageData(0, 0, size, size).data
  const sample = (x: number, z: number) => {
    const u = clamp01((x - WORLD.x0) / (WORLD.x1 - WORLD.x0))
    const v = clamp01((z - WORLD.z0) / (WORLD.z1 - WORLD.z0))
    const px = Math.min(size - 1, (u * size) | 0)
    const py = Math.min(size - 1, ((1 - v) * size) | 0)
    return data[(py * size + px) * 4] / 255
  }
  return { canvas: c, sample }
}

/* ------------------------------------------------------------------ */

export interface EmberScene {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
}

/**
 * Optional media. With none of it the scene renders exactly as before, which
 * is what makes /concept-01 and /concept-10 a fair comparison.
 */
export interface EmberMedia {
  /** canopy footage projected onto a backdrop deep in the forest */
  canopyVideo?: HTMLVideoElement
  /** real Landsat tile used as the ground during the orbital phase */
  tileImage?: HTMLImageElement
}

const arcAt = (p: number, a: number, b: number) => Math.sin(seg(p, a, b) * Math.PI)

export function createEmberScene(canvas: HTMLCanvasElement, media: EmberMedia = {}): EmberScene {
  const tier = perfTier()
  const LEAVES = tier === 'low' ? 110 : tier === 'mid' ? 200 : 300
  const TREES = tier === 'low' ? 260 : tier === 'mid' ? 520 : 820
  const PARTS = tier === 'low' ? 2304 : tier === 'mid' ? 5776 : 10816 // perfect squares
  const GRID = Math.round(Math.sqrt(PARTS))

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier !== 'low',
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 1.25 : 1.75))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2(0x0a1b10, 0.021)
  scene.fog = fog
  scene.background = new THREE.Color(0x0a1b10)

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 900)
  camera.position.set(0, 1.4, 6)

  const key = new THREE.DirectionalLight(0xfff0d0, 1.6)
  key.position.set(18, 40, 16)
  scene.add(key)
  const amb = new THREE.HemisphereLight(0x9fdcae, 0x10240f, 1.0)
  scene.add(amb)
  const fire = new THREE.PointLight(0xff5a1e, 0, 180, 2)
  fire.position.set(0, 6, -40)
  scene.add(fire)

  const mask = makeClearingMask(256)
  const noise = makeNoise2D(11)
  const rnd = mulberry32(99)

  /* ---------------- ground ---------------- */

  const maskTex = new THREE.CanvasTexture(mask.canvas)
  maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping

  // real Landsat imagery of the same ground, if it was supplied
  const tileTex = media.tileImage ? new THREE.Texture(media.tileImage) : null
  if (tileTex) {
    tileTex.colorSpace = THREE.SRGBColorSpace
    tileTex.wrapS = tileTex.wrapT = THREE.ClampToEdgeWrapping
    const mark = () => (tileTex.needsUpdate = true)
    if (media.tileImage!.complete) mark()
    else media.tileImage!.addEventListener('load', mark, { once: true })
  }

  // ShaderMaterial + fog:true requires the fog uniform block to be present.
  const groundUniforms = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uMask: { value: maskTex },
    uCut: { value: 0 },
    uBurn: { value: 0 },
    uData: { value: 0 },
    uTime: { value: 0 },
    uTile: { value: tileTex ?? maskTex },
    uUseTile: { value: tileTex ? 1 : 0 },
  })

  const groundVert = [
    'varying vec2 vUv;',
    '#include <fog_pars_vertex>',
    'void main(){',
    '  vUv = uv;',
    '  vec4 wp = modelMatrix * vec4(position,1.0);',
    '  vec4 mvPosition = viewMatrix * wp;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}',
  ].join('\n')

  const groundFrag = [
    'uniform sampler2D uMask; uniform sampler2D uTile;',
    'uniform float uCut, uBurn, uData, uTime, uUseTile;',
    'varying vec2 vUv;',
    '#include <fog_pars_fragment>',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);',
    '}',
    'float fbm(vec2 p){ return vnoise(p)*0.55 + vnoise(p*2.3)*0.28 + vnoise(p*5.1)*0.17; }',
    'void main(){',
    '  vec2 uv = mix(vUv, floor(vUv*180.0)/180.0 + 0.5/180.0, uData);',
    '  float m = texture2D(uMask, uv).r;',
    '  float front = smoothstep(uCut + 0.12, uCut - 0.12, 1.0 - uv.y);',
    '  float cut = clamp(m * front, 0.0, 1.0);',
    '  float n = fbm(uv * 42.0);',
    '  vec3 forest = mix(vec3(0.045,0.10,0.048), vec3(0.09,0.17,0.075), n);',
    '  vec3 bare   = mix(vec3(0.26,0.18,0.115), vec3(0.34,0.24,0.15), n);',
    '  vec3 col = mix(forest, bare, cut);',
    '  vec3 charc = mix(vec3(0.035,0.03,0.028), vec3(0.09,0.07,0.06), n);',
    '  float glow = pow(max(0.0, fbm(uv*26.0 + uTime*0.03) - 0.58), 2.0) * 9.0;',
    '  col = mix(col, charc + vec3(1.0,0.32,0.06)*glow*uBurn, uBurn);',
    '  float ndvi = clamp((1.0 - cut) * (0.55 + n*0.5) - uBurn*0.25, 0.0, 1.0);',
    '  vec3 ndviCol = ndvi < 0.35',
    '    ? mix(vec3(0.42,0.13,0.08), vec3(0.78,0.55,0.16), ndvi/0.35)',
    '    : mix(vec3(0.78,0.55,0.16), vec3(0.10,0.52,0.22), (ndvi-0.35)/0.65);',
    '  col = mix(col, ndviCol, uData * 0.92);',
    // with real imagery the orbital phase resolves to the actual Landsat scene
    '  vec3 tileCol = texture2D(uTile, clamp(vUv * 1.18 - 0.09, 0.0, 1.0)).rgb;',
    '  col = mix(col, tileCol, uUseTile * smoothstep(0.15, 0.85, uData));',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <fog_fragment>',
    '}',
  ].join('\n')

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.x1 - WORLD.x0, WORLD.z1 - WORLD.z0, 1, 1),
    new THREE.ShaderMaterial({ uniforms: groundUniforms, fog: true, vertexShader: groundVert, fragmentShader: groundFrag }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set((WORLD.x0 + WORLD.x1) / 2, 0, (WORLD.z0 + WORLD.z1) / 2)
  scene.add(ground)

  /* ---------------- canopy backdrop (video, optional) ---------------- */

  // A luminous plane behind the instanced forest. Scene fog is exponential and
  // would erase anything this far out, so the backdrop is unfogged and dimmed
  // by hand instead — it reads as the canopy continuing into the distance.
  let backdrop: THREE.Mesh | null = null
  let canopyTex: THREE.VideoTexture | null = null
  if (media.canopyVideo) {
    canopyTex = new THREE.VideoTexture(media.canopyVideo)
    canopyTex.colorSpace = THREE.SRGBColorSpace
    canopyTex.minFilter = THREE.LinearFilter
    backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(460, 258),
      new THREE.MeshBasicMaterial({
        map: canopyTex,
        fog: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: new THREE.Color(0x5e8a63),
      }),
    )
    backdrop.position.set(0, 52, -150)
    backdrop.renderOrder = -1
    scene.add(backdrop)
  }

  /* ---------------- leaf wall ---------------- */

  const leafTex = makeLeafTexture(192, 7)
  const leafGeo = new THREE.PlaneGeometry(1, 1.6)
  const leafMat = new THREE.MeshLambertMaterial({
    map: leafTex,
    transparent: true,
    alphaTest: 0.14,
    side: THREE.DoubleSide,
  })
  const wall = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES)
  wall.frustumCulled = false
  scene.add(wall)

  interface Leaf {
    base: THREE.Vector3
    dir: THREE.Vector3
    s: number
    rot: THREE.Vector3
    spin: THREE.Vector3
    delay: number
  }
  const leaves: Leaf[] = []
  for (let i = 0; i < LEAVES; i++) {
    const ang = rnd() * Math.PI * 2
    const rad = Math.pow(rnd(), 0.55) * 7.5
    leaves.push({
      base: new THREE.Vector3(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.72 + 1.2, 5.4 - rnd() * 11),
      dir: new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.8, 0.85 + rnd() * 0.8).normalize(),
      s: 0.8 + rnd() * 2.1,
      rot: new THREE.Vector3(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28),
      spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(4),
      delay: rnd() * 0.055,
    })
    // leaves nearest the lens read as backlit silhouettes; far ones catch light
    const near = clamp01((leaves[i].base.z + 5.6) / 11)
    wall.setColorAt(
      i,
      new THREE.Color().setHSL(0.27 + rnd() * 0.08, 0.5 + rnd() * 0.24, lerp(0.34, 0.07, near * near) + rnd() * 0.06),
    )
  }
  wall.instanceColor!.needsUpdate = true

  /* ---------------- forest ---------------- */

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.5, 1, 6, 1)
  trunkGeo.translate(0, 0.5, 0)
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1)
  {
    const pos = canopyGeo.attributes.position as THREE.BufferAttribute
    const r2 = mulberry32(5)
    for (let i = 0; i < pos.count; i++) {
      const f = 0.72 + r2() * 0.5
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.82, pos.getZ(i) * f)
    }
    canopyGeo.computeVertexNormals()
  }

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x2a2018 })
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f6b34, flatShading: true })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES)
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREES)
  trunks.frustumCulled = false
  canopies.frustumCulled = false
  scene.add(trunks, canopies)

  interface Tree {
    x: number
    z: number
    h: number
    r: number
    cut: number
    fellAxis: number
    sway: number
    doomed: boolean
    burn: number
  }
  const trees: Tree[] = []
  for (let i = 0; i < TREES; i++) {
    const x = WORLD.x0 + rnd() * (WORLD.x1 - WORLD.x0)
    const z = WORLD.z0 + rnd() * (WORLD.z1 - WORLD.z0)
    const m = mask.sample(x, z)
    const depth = clamp01((z - WORLD.z0) / (WORLD.z1 - WORLD.z0)) // 1 = nearest camera
    trees.push({
      x,
      z,
      h: 7 + rnd() * 15 + noise(x * 0.02, z * 0.02) * 4,
      r: 0.8 + rnd() * 0.7,
      // the cut front sweeps from near to far; masked areas go first
      cut: 0.3 + (1 - depth) * 0.14 + (1 - m) * 0.1 + rnd() * 0.035,
      fellAxis: rnd() * Math.PI * 2,
      sway: rnd() * Math.PI * 2,
      doomed: m > 0.35 || rnd() < 0.55,
      burn: 0.5 + rnd() * 0.12,
    })
  }

  const dummy = new THREE.Object3D()
  const canopyColorA = new THREE.Color(0x3d8b42)
  const canopyColorB = new THREE.Color(0x0d0b09)
  const fireColor = new THREE.Color(0xff5510)
  const tmpColor = new THREE.Color()
  const mTmp = new THREE.Matrix4()
  const mTilt = new THREE.Matrix4()
  const mScale = new THREE.Matrix4()

  /* ---------------- particles: motes to embers to ash to pixels ---------------- */

  const pGeo = new THREE.BufferGeometry()
  const home = new Float32Array(PARTS * 3)
  const grid = new Float32Array(PARTS * 3)
  const seeds = new Float32Array(PARTS)
  const sizes = new Float32Array(PARTS)
  const ndvi = new Float32Array(PARTS)
  for (let i = 0; i < PARTS; i++) {
    const hx = WORLD.x0 * 0.55 + rnd() * (WORLD.x1 - WORLD.x0) * 0.55
    const hy = 0.5 + Math.pow(rnd(), 0.7) * 27
    const hz = WORLD.z0 * 0.8 + rnd() * (WORLD.z1 - WORLD.z0) * 0.86
    home[i * 3] = hx
    home[i * 3 + 1] = hy
    home[i * 3 + 2] = hz
    const gx = i % GRID
    const gz = (i / GRID) | 0
    const wx = lerp(WORLD.x0, WORLD.x1, (gx + 0.5) / GRID)
    const wz = lerp(WORLD.z0, WORLD.z1, (gz + 0.5) / GRID)
    grid[i * 3] = wx
    grid[i * 3 + 1] = 2.0
    grid[i * 3 + 2] = wz
    seeds[i] = rnd()
    sizes[i] = 0.5 + rnd() * 1.1
    ndvi[i] = clamp01((1 - mask.sample(wx, wz)) * (0.55 + noise(wx * 0.05, wz * 0.05) * 0.55))
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(home.slice(), 3))
  pGeo.setAttribute('aHome', new THREE.BufferAttribute(home, 3))
  pGeo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 3))
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  pGeo.setAttribute('aNdvi', new THREE.BufferAttribute(ndvi, 1))

  const pUniforms = {
    uTime: { value: 0 },
    uEmber: { value: 0 },
    uAsh: { value: 0 },
    uGrid: { value: 0 },
    uFade: { value: 1 },
  }

  const partVert = [
    'uniform float uTime, uEmber, uAsh, uGrid;',
    'attribute vec3 aHome, aGrid; attribute float aSeed, aSize, aNdvi;',
    'varying float vSeed; varying float vNdvi; varying float vDepth;',
    'void main(){',
    '  vSeed = aSeed; vNdvi = aNdvi;',
    '  float s = aSeed * 100.0;',
    '  vec3 pMote = aHome + vec3(sin(uTime*0.42 + s)*1.6, sin(uTime*0.31 + s*1.7)*0.9, cos(uTime*0.27 + s*2.3)*1.4);',
    '  float rise = mod(s*7.0 + uTime*7.5, 62.0);',
    '  vec3 pEmber = vec3(aHome.x + sin(uTime*1.6 + s)*(2.0 + rise*0.09), rise - 2.0, aHome.z + cos(uTime*1.1 + s)*2.0);',
    '  float fall = mod(s*9.0 + uTime*3.4, 70.0);',
    '  vec3 pAsh = vec3(aHome.x*1.25 + sin(uTime*0.5 + s)*7.0, 58.0 - fall, aHome.z*1.05 + cos(uTime*0.4 + s)*5.0);',
    '  vec3 pos = pMote;',
    '  pos = mix(pos, pEmber, uEmber);',
    '  pos = mix(pos, pAsh, uAsh);',
    '  pos = mix(pos, aGrid, uGrid);',
    '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
    '  vDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '  float base = aSize * mix(1.0, 3.4, uGrid);',
    '  gl_PointSize = clamp(base * (260.0 / max(1.0, -mv.z)) * (1.0 + uEmber*0.4), 1.0, mix(22.0, 110.0, uGrid));',
    '}',
  ].join('\n')

  const partFrag = (additive: boolean) =>
    [
      'uniform float uEmber, uAsh, uGrid, uFade, uTime;',
      'varying float vSeed; varying float vNdvi; varying float vDepth;',
      'void main(){',
      '  vec2 q = gl_PointCoord - 0.5;',
      '  float circle = smoothstep(0.5, 0.12, length(q));',
      '  float box = 1.0 - smoothstep(0.40, 0.47, max(abs(q.x), abs(q.y)));',
      '  float a = mix(circle, box, uGrid);',
      '  vec3 green = mix(vec3(0.16,0.42,0.19), vec3(0.45,0.72,0.35), vSeed);',
      '  float flick = 0.6 + 0.4*sin(uTime*11.0 + vSeed*60.0);',
      '  vec3 ember = mix(vec3(1.0,0.32,0.04), vec3(1.0,0.82,0.35), vSeed*flick);',
      '  vec3 ash   = mix(vec3(0.30,0.29,0.28), vec3(0.66,0.64,0.62), vSeed);',
      '  vec3 ndviC = vNdvi < 0.35',
      '    ? mix(vec3(0.55,0.12,0.07), vec3(0.88,0.62,0.15), vNdvi/0.35)',
      '    : mix(vec3(0.88,0.62,0.15), vec3(0.16,0.72,0.31), (vNdvi-0.35)/0.65);',
      '  vec3 col = green;',
      '  col = mix(col, ember, uEmber);',
      '  col = mix(col, ash, uAsh);',
      '  col = mix(col, ndviC, uGrid);',
      additive ? '  float w = uEmber;' : '  float w = 1.0 - uEmber;',
      '  float distFade = smoothstep(340.0, 90.0, vDepth);',
      '  float alpha = a * w * uFade * mix(0.55, 1.0, uGrid) * mix(0.45, 1.0, distFade);',
      '  if (alpha < 0.01) discard;',
      '  gl_FragColor = vec4(col, alpha);',
      '}',
    ].join('\n')

  const motes = new THREE.Points(
    pGeo,
    new THREE.ShaderMaterial({
      uniforms: pUniforms,
      vertexShader: partVert,
      fragmentShader: partFrag(false),
      transparent: true,
      depthWrite: false,
    }),
  )
  const emberPts = new THREE.Points(
    pGeo,
    new THREE.ShaderMaterial({
      uniforms: pUniforms,
      vertexShader: partVert,
      fragmentShader: partFrag(true),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  motes.frustumCulled = false
  emberPts.frustumCulled = false
  scene.add(motes, emberPts)

  /* ---------------- canopy segmentation overlay ---------------- */

  const survivors = trees.filter((t) => !t.doomed).slice(0, 240)
  const segPts: number[] = []
  const segOrder: number[] = []
  const SIDES = 9
  survivors.forEach((t, i) => {
    const rad = t.r * 2.6
    const jitter = mulberry32(i * 31 + 3)
    for (let s = 0; s < SIDES; s++) {
      const a0 = (s / SIDES) * Math.PI * 2
      const a1 = ((s + 1) / SIDES) * Math.PI * 2
      const r0 = rad * (0.78 + jitter() * 0.45)
      const r1 = rad * (0.78 + jitter() * 0.45)
      segPts.push(t.x + Math.cos(a0) * r0, 3.2, t.z + Math.sin(a0) * r0)
      segPts.push(t.x + Math.cos(a1) * r1, 3.2, t.z + Math.sin(a1) * r1)
      segOrder.push(i / survivors.length, i / survivors.length)
    }
  })

  const segUniforms = { uReveal: { value: 0 }, uOpacity: { value: 0 } }
  const segGeo = new THREE.BufferGeometry()
  segGeo.setAttribute('position', new THREE.Float32BufferAttribute(segPts, 3))
  segGeo.setAttribute('aOrder', new THREE.Float32BufferAttribute(segOrder, 1))
  const segments = new THREE.LineSegments(
    segGeo,
    new THREE.ShaderMaterial({
      uniforms: segUniforms,
      transparent: true,
      depthTest: false,
      vertexShader: [
        'attribute float aOrder; varying float vO; uniform float uReveal;',
        'void main(){ vO = step(aOrder, uReveal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      ].join('\n'),
      fragmentShader: [
        'varying float vO; uniform float uOpacity;',
        'void main(){ if(vO < 0.5) discard; gl_FragColor = vec4(0.62,1.0,0.72, 0.82*uOpacity); }',
      ].join('\n'),
    }),
  )
  segments.frustumCulled = false
  scene.add(segments)

  const cGeo = new THREE.BufferGeometry()
  const cPos: number[] = []
  const cOrd: number[] = []
  survivors.forEach((t, i) => {
    cPos.push(t.x, 3.3, t.z)
    cOrd.push(i / survivors.length)
  })
  cGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3))
  cGeo.setAttribute('aOrder', new THREE.Float32BufferAttribute(cOrd, 1))
  const centroids = new THREE.Points(
    cGeo,
    new THREE.ShaderMaterial({
      uniforms: segUniforms,
      transparent: true,
      depthTest: false,
      vertexShader: [
        'attribute float aOrder; varying float vO; uniform float uReveal;',
        'void main(){ vO = step(aOrder, uReveal); vec4 mv = modelViewMatrix*vec4(position,1.0);',
        '  gl_PointSize = 3.5*(260.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }',
      ].join('\n'),
      fragmentShader: [
        'varying float vO; uniform float uOpacity;',
        'void main(){ if(vO<0.5) discard; if(length(gl_PointCoord-0.5)>0.5) discard;',
        '  gl_FragColor = vec4(0.85,1.0,0.9,uOpacity); }',
      ].join('\n'),
    }),
  )
  centroids.frustumCulled = false
  scene.add(centroids)

  // deforestation alert boxes, aligned with the block clear-cuts in the mask
  const alertGroup = new THREE.Group()
  const alertMat = new THREE.LineBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0 })
  const alertBoxes = [
    [0.2, 0.62, 0.15, 0.1],
    [0.58, 0.78, 0.2, 0.13],
    [0.66, 0.3, 0.13, 0.16],
  ]
  for (const b of alertBoxes) {
    const x0 = lerp(WORLD.x0, WORLD.x1, b[0])
    const x1 = lerp(WORLD.x0, WORLD.x1, b[0] + b[2])
    const z0 = lerp(WORLD.z1, WORLD.z0, b[1])
    const z1 = lerp(WORLD.z1, WORLD.z0, b[1] + b[3])
    const pts = [
      new THREE.Vector3(x0, 3.6, z0),
      new THREE.Vector3(x1, 3.6, z0),
      new THREE.Vector3(x1, 3.6, z1),
      new THREE.Vector3(x0, 3.6, z1),
      new THREE.Vector3(x0, 3.6, z0),
    ]
    alertGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), alertMat))
  }
  scene.add(alertGroup)

  /* ---------------- colour script ---------------- */

  const SKY = [
    { p: 0.0, c: new THREE.Color(0x0a1b10) },
    { p: 0.28, c: new THREE.Color(0x11291a) },
    { p: 0.46, c: new THREE.Color(0x3a2415) },
    { p: 0.58, c: new THREE.Color(0x6b2408) },
    { p: 0.7, c: new THREE.Color(0x20140f) },
    { p: 0.82, c: new THREE.Color(0x0b0b0d) },
    { p: 1.0, c: new THREE.Color(0x05090c) },
  ]
  const skyAt = (p: number, out: THREE.Color) => {
    for (let i = 0; i < SKY.length - 1; i++) {
      if (p <= SKY[i + 1].p) {
        const t = smoothstep(seg(p, SKY[i].p, SKY[i + 1].p))
        return out.copy(SKY[i].c).lerp(SKY[i + 1].c, t)
      }
    }
    return out.copy(SKY[SKY.length - 1].c)
  }
  const skyTmp = new THREE.Color()
  const target = new THREE.Vector3()

  /* ---------------- frame ---------------- */

  let time = 0

  function update(p: number, dt: number) {
    time += dt

    /* camera */
    const a = easeInOutCubic(seg(p, 0.06, 0.32))
    const b = easeInOutCubic(seg(p, 0.32, 0.5))
    const c = easeOutCubic(seg(p, 0.5, 0.68))
    const e = easeInOutCubic(seg(p, 0.79, 0.93))
    const f = seg(p, 0.93, 1)

    const camZ = 6 - a * 46 - b * 30
    const camY = 1.4 + c * 9 + e * 205
    const camX = Math.sin(p * 4.2) * 3.2 * (1 - e) + e * 12
    camera.position.set(camX, camY, camZ + e * 40)
    target.set(camX * 0.2, lerp(2.2 + c * 4, 0, e), camera.position.z - lerp(46, 6, e) - f * 6)
    camera.lookAt(target)
    camera.rotation.z = Math.sin(p * 7.0) * 0.012 * (1 - e)

    /* atmosphere */
    skyAt(p, skyTmp)
    ;(scene.background as THREE.Color).copy(skyTmp)
    fog.color.copy(skyTmp)
    fog.density = lerp(0.021, 0.0009, easeInOutCubic(seg(p, 0.74, 0.92))) * lerp(1, 1.55, arcAt(p, 0.5, 0.72))
    key.intensity = lerp(1.6, 0.25, seg(p, 0.3, 0.62)) + seg(p, 0.86, 1) * 0.9
    key.color.setHSL(lerp(0.12, 0.05, seg(p, 0.3, 0.6)), 0.5, 0.62)
    amb.intensity = lerp(1.0, 0.22, seg(p, 0.34, 0.66)) + seg(p, 0.84, 1) * 0.8
    fire.intensity = arcAt(p, 0.46, 0.74) * 260
    fire.position.set(Math.sin(time * 0.7) * 20, 5 + Math.sin(time * 2.3) * 1.4, camera.position.z - 34)

    /* leaf wall */
    const wallVisible = p < 0.2
    wall.visible = wallVisible
    if (wallVisible) {
      for (let i = 0; i < LEAVES; i++) {
        const L = leaves[i]
        const burst = easeInOutCubic(seg(p, 0.005 + L.delay, 0.115 + L.delay))
        const drift = time * 0.4
        dummy.position.set(
          L.base.x + L.dir.x * burst * 46 + Math.sin(drift + i) * 0.12 * (1 - burst),
          L.base.y + L.dir.y * burst * 34 + Math.cos(drift * 1.3 + i) * 0.12 * (1 - burst) - burst * burst * 5,
          L.base.z + L.dir.z * burst * 40,
        )
        dummy.rotation.set(
          L.rot.x + L.spin.x * burst * 3 + Math.sin(drift + i) * 0.08,
          L.rot.y + L.spin.y * burst * 3,
          L.rot.z + L.spin.z * burst * 3 + Math.cos(drift * 0.8 + i) * 0.08,
        )
        const s = L.s * (1 - burst * 0.25)
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        wall.setMatrixAt(i, dummy.matrix)
      }
      wall.instanceMatrix.needsUpdate = true
    }

    /* forest */
    const forestVisible = p > 0.05 && p < 0.9
    trunks.visible = canopies.visible = forestVisible
    if (forestVisible) {
      const dataFade = 1 - seg(p, 0.8, 0.89)
      for (let i = 0; i < TREES; i++) {
        const T = trees[i]
        const fell = T.doomed ? easeOutCubic(seg(p, T.cut, T.cut + 0.05)) : 0
        const burnT = T.doomed ? seg(p, T.burn, T.burn + 0.16) : seg(p, 0.56, 0.78) * 0.55
        const sway = Math.sin(time * 0.6 + T.sway) * 0.02 * (1 - fell)

        // trunk falls about its base
        dummy.position.set(T.x, 0, T.z)
        dummy.rotation.set(0, T.fellAxis, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        mTmp.copy(dummy.matrix)
        mTilt.makeRotationX(fell * 1.62 + sway)
        mScale.makeScale(T.r, T.h * (1 - fell * 0.08), T.r)
        mTmp.multiply(mTilt).multiply(mScale)
        trunks.setMatrixAt(i, mTmp)

        // canopy rides the trunk down, then burns away
        const cs = Math.max(0.001, T.r * 2.6 * (1 - fell * 0.55) * (1 - burnT * (T.doomed ? 1 : 0.35)))
        const fh = T.h * (1 - fell * 0.25)
        dummy.position.set(
          T.x + Math.sin(T.fellAxis) * fell * T.h * 0.55,
          Math.max(0.6, fh * Math.cos(fell * 1.5)) + sway,
          T.z + Math.cos(T.fellAxis) * fell * T.h * 0.55,
        )
        dummy.rotation.set(sway * 2, T.fellAxis, fell * 0.9)
        dummy.scale.set(cs, cs * 0.8, cs)
        dummy.updateMatrix()
        canopies.setMatrixAt(i, dummy.matrix)

        tmpColor.copy(canopyColorA).lerp(canopyColorB, clamp01(burnT * 1.25))
        if (burnT > 0.02 && burnT < 0.7) tmpColor.lerp(fireColor, (1 - Math.abs(burnT - 0.3) / 0.3) * 0.55)
        canopies.setColorAt(i, tmpColor)
      }
      trunks.instanceMatrix.needsUpdate = true
      canopies.instanceMatrix.needsUpdate = true
      if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true
      canopyMat.opacity = dataFade
      canopyMat.transparent = dataFade < 1
      trunkMat.opacity = dataFade
      trunkMat.transparent = dataFade < 1
    }

    /* canopy backdrop: present through the forest, burned off by the fire */
    if (backdrop) {
      const bm = backdrop.material as THREE.MeshBasicMaterial
      const show = smoothstep(seg(p, 0.06, 0.16)) * (1 - smoothstep(seg(p, 0.42, 0.56)))
      bm.opacity = show * 0.85
      backdrop.visible = show > 0.01
      // drain toward scorched as the fire front approaches
      bm.color.setHSL(lerp(0.3, 0.09, seg(p, 0.3, 0.52)), 0.3, lerp(0.42, 0.26, seg(p, 0.3, 0.52)))
      backdrop.position.z = camera.position.z - 200
    }

    /* ground */
    groundUniforms.uCut.value = seg(p, 0.3, 0.56) * 1.25
    groundUniforms.uBurn.value = smoothstep(seg(p, 0.5, 0.72))
    groundUniforms.uData.value = smoothstep(seg(p, 0.82, 0.93))
    groundUniforms.uTime.value = time

    /* particles */
    pUniforms.uTime.value = time
    pUniforms.uEmber.value = smoothstep(seg(p, 0.48, 0.6)) * (1 - smoothstep(seg(p, 0.64, 0.72)))
    pUniforms.uAsh.value = smoothstep(seg(p, 0.64, 0.73))
    pUniforms.uGrid.value = smoothstep(seg(p, 0.8, 0.9))
    pUniforms.uFade.value = lerp(0.55, 1, smoothstep(seg(p, 0.1, 0.2)))

    /* data layer */
    segUniforms.uReveal.value = seg(p, 0.9, 0.975)
    segUniforms.uOpacity.value = smoothstep(seg(p, 0.89, 0.94))
    alertMat.opacity = smoothstep(seg(p, 0.945, 0.985)) * (0.55 + 0.45 * Math.sin(time * 4))

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
    leafTex.dispose()
    maskTex.dispose()
    renderer.dispose()
  }

  return { update, resize, dispose }
}

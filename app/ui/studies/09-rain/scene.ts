import * as THREE from 'three'
import { clamp01, easeInOutCubic, lerp, makeNoise2D, mulberry32, seg, smoothstep } from '../lib/math'
import { makeForestMask } from '../lib/mask'
import { perfTier } from '../lib/narrative'

/**
 * Concept 09 follows the water.
 *
 * A large tree moves a thousand litres a day into the air; the Amazon basin
 * moves more water through its atmosphere than through its river. The scroll
 * rides one circuit of that loop — canopy, vapour, cloud, rain — and then
 * watches the circuit fail as the forest that drives it is removed.
 */

const R = 260
const CLOUD_Y = 360

export interface RainScene {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
  readState: () => { altitude: number; flux: number }
}

/** Scroll → camera altitude, keyframed to the stage the copy is describing. */
const ALT: [number, number][] = [
  [0.0, 16],
  [0.12, 26],
  [0.28, 120],
  [0.44, 330],
  [0.56, 360],
  [0.66, 150],
  [0.76, 90],
  [0.88, 210],
  [1.0, 300],
]
function altitudeAt(p: number) {
  const t = clamp01(p)
  let i = 0
  while (i < ALT.length - 2 && ALT[i + 1][0] < t) i++
  const [pa, a] = ALT[i]
  const [pb, b] = ALT[i + 1]
  const k = pb === pa ? 0 : clamp01((t - pa) / (pb - pa))
  return lerp(a, b, k * k * (3 - 2 * k))
}

export function createRainScene(canvas: HTMLCanvasElement): RainScene {
  const tier = perfTier()
  const PARTS = tier === 'low' ? 9000 : tier === 'mid' ? 20000 : 34000
  const CROWNS = tier === 'low' ? 700 : tier === 'mid' ? 1600 : 2600
  const DROPS = tier === 'low' ? 16 : 34

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 1.2 : 1.7))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2(0x0d211d, 0.0035)
  scene.fog = fog
  scene.background = new THREE.Color(0x0d211d)
  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.5, 4000)

  scene.add(new THREE.HemisphereLight(0xbfe3dc, 0x101c18, 1.15))
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.7)
  sun.position.set(-120, 200, 80)
  scene.add(sun)

  const mask = makeForestMask(256, 21)
  const noise = makeNoise2D(919)
  const rnd = mulberry32(909)
  const w2u = (x: number) => clamp01(x / (2 * R) + 0.5)
  const w2v = (z: number) => clamp01(z / (2 * R) + 0.5)

  /* ---------------- canopy ---------------- */

  const crownGeo = new THREE.IcosahedronGeometry(1, 1)
  {
    const pos = crownGeo.attributes.position as THREE.BufferAttribute
    const r2 = mulberry32(5)
    for (let i = 0; i < pos.count; i++) {
      const f = 0.74 + r2() * 0.46
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.84, pos.getZ(i) * f)
    }
    crownGeo.computeVertexNormals()
  }

  const crownU = { uDry: { value: 0 }, uWet: { value: 1 }, uTime: { value: 0 } }
  const crowns = new THREE.InstancedMesh(
    crownGeo,
    new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), crownU),
      fog: true,
      vertexShader: [
        'attribute float aSeed, aCut;',
        'uniform float uDry, uTime;',
        'varying float vSeed, vCut, vLit;',
        '#include <fog_pars_vertex>',
        'void main(){',
        '  vSeed = aSeed; vCut = aCut;',
        '  vec3 p = position * (1.0 - aCut * smoothstep(0.1, 0.8, uDry) * 0.94);',
        '  vec4 world = instanceMatrix * vec4(p, 1.0);',
        '  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);',
        '  vLit = clamp(dot(n, normalize(vec3(-0.5,0.78,0.34))) * 0.7 + 0.42, 0.0, 1.4);',
        '  vec4 mvPosition = modelViewMatrix * world;',
        '  gl_Position = projectionMatrix * mvPosition;',
        '  #include <fog_vertex>',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float uDry, uWet;',
        'varying float vSeed, vCut, vLit;',
        '#include <fog_pars_fragment>',
        'void main(){',
        '  vec3 wet = mix(vec3(0.07,0.26,0.20), vec3(0.20,0.50,0.34), vSeed);',
        '  vec3 dry = mix(vec3(0.30,0.26,0.13), vec3(0.50,0.42,0.20), vSeed);',
        '  vec3 col = mix(wet, dry, smoothstep(0.0, 0.85, uDry));',
        // wet canopy has a specular sheen the dry one loses
        '  col += vec3(0.55,0.72,0.66) * pow(clamp(vLit - 0.7, 0.0, 1.0), 2.2) * uWet * 0.7;',
        '  gl_FragColor = vec4(col * vLit, 1.0);',
        '  #include <fog_fragment>',
        '}',
      ].join('\n'),
    }),
    CROWNS,
  )
  crowns.frustumCulled = false
  const crownPts: { x: number; z: number; y: number }[] = []
  {
    const d = new THREE.Object3D()
    const seed = new Float32Array(CROWNS)
    const cut = new Float32Array(CROWNS)
    for (let i = 0; i < CROWNS; i++) {
      const a = rnd() * Math.PI * 2
      const rad = Math.sqrt(rnd()) * R
      const x = Math.cos(a) * rad
      const z = Math.sin(a) * rad
      const r = 5 + rnd() * 7 + noise(x * 0.01, z * 0.01) * 2
      const y = r * 0.85 + noise(x * 0.004, z * 0.004) * 6
      d.position.set(x, y, z)
      d.scale.set(r, r * 0.86, r)
      d.rotation.set(0, rnd() * 6.28, 0)
      d.updateMatrix()
      crowns.setMatrixAt(i, d.matrix)
      seed[i] = rnd()
      cut[i] = mask.sample(w2u(x), w2v(z)) > 0.4 || rnd() < 0.42 ? 1 : 0
      crownPts.push({ x, z, y: y + r * 0.6 })
    }
    crowns.instanceMatrix.needsUpdate = true
    crowns.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1))
    crowns.geometry.setAttribute('aCut', new THREE.InstancedBufferAttribute(cut, 1))
  }
  scene.add(crowns)

  /* ---------------- the water: vapour → cloud → rain ---------------- */

  const home = new Float32Array(PARTS * 3)
  const cloud = new Float32Array(PARTS * 3)
  const seeds = new Float32Array(PARTS)
  const sizes = new Float32Array(PARTS)
  for (let i = 0; i < PARTS; i++) {
    const src = crownPts[(rnd() * crownPts.length) | 0]
    home[i * 3] = src.x + (rnd() - 0.5) * 14
    home[i * 3 + 1] = src.y
    home[i * 3 + 2] = src.z + (rnd() - 0.5) * 14
    // the cloud deck sits above and downwind, drifting as one sheet
    cloud[i * 3] = (rnd() - 0.5) * R * 3.2
    cloud[i * 3 + 1] = CLOUD_Y + (rnd() - 0.5) * 90
    cloud[i * 3 + 2] = (rnd() - 0.5) * R * 2.4
    seeds[i] = rnd()
    sizes[i] = 0.5 + rnd() * 1.8
  }

  const U = {
    uTime: { value: 0 },
    uVapour: { value: 0 },
    uCloud: { value: 0 },
    uRain: { value: 0 },
    uDry: { value: 0 },
    uFade: { value: 1 },
  }

  const water = new THREE.Points(
    (() => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(home.slice(), 3))
      g.setAttribute('aHome', new THREE.BufferAttribute(home, 3))
      g.setAttribute('aCloud', new THREE.BufferAttribute(cloud, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
      g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
      return g
    })(),
    new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute vec3 aHome, aCloud; attribute float aSeed, aSize;',
        'uniform float uTime, uVapour, uCloud, uRain, uDry;',
        'varying float vSeed, vPhase, vDepth, vLive;',
        'void main(){',
        '  vSeed = aSeed;',
        '  float s = aSeed * 100.0;',
        // the loop only carries as much water as there is canopy to lift it
        '  vLive = step(aSeed, 1.0 - uDry * 0.82);',
        '  float rise = fract(aSeed * 7.3 + uTime * 0.055);',
        '  float lift = mix(1.0, 0.24, uDry);',
        '  vec3 pVap = vec3(',
        '    aHome.x + sin(uTime * 0.5 + s) * (3.0 + rise * 26.0),',
        '    aHome.y + rise * (CLOUDY) * lift,',
        '    aHome.z + cos(uTime * 0.42 + s) * (3.0 + rise * 26.0));',
        '  vec3 pCld = aCloud + vec3(sin(uTime * 0.12 + s) * 26.0, sin(uTime * 0.3 + s) * 9.0, uTime * 5.0);',
        '  pCld.z = mod(pCld.z + 900.0, 1800.0) - 900.0;',
        '  float fall = fract(aSeed * 11.7 + uTime * 0.42);',
        '  vec3 pRn = vec3(aCloud.x * 0.5, mix(CLOUDY, -6.0, fall), aCloud.z * 0.6 + sin(uTime + s) * 8.0);',
        '  vec3 p = pVap;',
        '  p = mix(p, pCld, uCloud);',
        '  p = mix(p, pRn, uRain);',
        '  vPhase = uRain;',
        '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
        '  vDepth = -mv.z;',
        '  gl_Position = projectionMatrix * mv;',
        '  float grow = mix(1.0, 2.4, uCloud) * mix(1.0, 0.44, uRain);',
        '  gl_PointSize = clamp(aSize * grow * (220.0 / max(1.0, -mv.z)), 1.0, 46.0);',
        '}',
      ]
        .join('\n')
        .replace(/CLOUDY/g, CLOUD_Y.toFixed(1)),
      fragmentShader: [
        'uniform float uVapour, uCloud, uRain, uDry, uFade, uTime;',
        'varying float vSeed, vPhase, vDepth, vLive;',
        'void main(){',
        '  if (vLive < 0.5) discard;',
        '  vec2 q = gl_PointCoord - 0.5;',
        // rain reads as a streak, vapour and cloud as soft volume
        '  q.y *= mix(1.0, 0.11, vPhase);',
        '  float d = length(q);',
        '  if (d > 0.5) discard;',
        '  float soft = smoothstep(0.5, 0.02, d);',
        '  vec3 vap = mix(vec3(0.62,0.82,0.78), vec3(0.94,0.98,0.96), vSeed);',
        '  vec3 cld = mix(vec3(0.52,0.62,0.72), vec3(0.86,0.90,0.96), vSeed);',
        '  vec3 rn  = mix(vec3(0.58,0.80,0.92), vec3(0.82,0.94,1.0), vSeed);',
        '  vec3 col = mix(vap, cld, uCloud);',
        '  col = mix(col, rn, uRain);',
        '  col = mix(col, vec3(0.62,0.54,0.38), uDry * 0.5);',
        '  float far = smoothstep(2600.0, 60.0, vDepth);',
        '  float a = soft * uFade * (0.10 + uCloud * 0.20 + uRain * 0.28) * far;',
        '  if (a < 0.004) discard;',
        '  gl_FragColor = vec4(col, a);',
        '}',
      ].join('\n'),
    }),
  )
  water.frustumCulled = false
  scene.add(water)

  /* ---------------- foreground droplets on the lens ---------------- */

  const dropU = { uOn: { value: 1 }, uTime: { value: 0 } }
  const drops = new THREE.Points(
    (() => {
      const g = new THREE.BufferGeometry()
      const pos = new Float32Array(DROPS * 3)
      const sd = new Float32Array(DROPS)
      for (let i = 0; i < DROPS; i++) {
        pos[i * 3] = (rnd() - 0.5) * 2.4
        pos[i * 3 + 1] = (rnd() - 0.5) * 1.5
        pos[i * 3 + 2] = -1.6 - rnd() * 0.8
        sd[i] = rnd()
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1))
      return g
    })(),
    new THREE.ShaderMaterial({
      uniforms: dropU,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute float aSeed; uniform float uTime; varying float vS;',
        'void main(){ vS = aSeed; vec3 p = position;',
        '  p.y -= mod(uTime * 0.12 + aSeed, 1.4) * 0.5;',
        '  vec4 mv = modelViewMatrix * vec4(p,1.0);',
        '  gl_PointSize = (30.0 + aSeed * 90.0);',
        '  gl_Position = projectionMatrix * mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform float uOn; varying float vS;',
        'void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;',
        '  float rim = smoothstep(0.5, 0.36, d) * smoothstep(0.18, 0.42, d);',
        '  float body = smoothstep(0.5, 0.1, d) * 0.22;',
        '  float a = (rim * 0.5 + body) * uOn;',
        '  if (a < 0.01) discard;',
        '  gl_FragColor = vec4(vec3(0.72,0.92,0.88) * (0.6 + vS * 0.6), a); }',
      ].join('\n'),
    }),
  )
  drops.frustumCulled = false
  const dropRig = new THREE.Group()
  dropRig.add(drops)
  scene.add(dropRig)

  /* ---------------- frame ---------------- */

  const SKY_WET = new THREE.Color(0x0d211d)
  const SKY_HIGH = new THREE.Color(0x16303c)
  const SKY_STORM = new THREE.Color(0x1b2732)
  const SKY_DRY = new THREE.Color(0x2b2418)
  const bg = new THREE.Color()
  const target = new THREE.Vector3()
  let time = 0
  let state = { altitude: 16, flux: 0 }

  function update(p: number, dt: number) {
    time += dt

    const dry = smoothstep(seg(p, 0.6, 0.78))
    const vapour = smoothstep(seg(p, 0.08, 0.2))
    const cloudT = smoothstep(seg(p, 0.34, 0.48)) * (1 - smoothstep(seg(p, 0.62, 0.76)) * 0.85)
    const rainT = smoothstep(seg(p, 0.5, 0.6)) * (1 - smoothstep(seg(p, 0.6, 0.72)))

    U.uTime.value = time
    U.uVapour.value = vapour
    U.uCloud.value = cloudT
    U.uRain.value = rainT
    U.uDry.value = dry
    U.uFade.value = lerp(0.5, 1, vapour)

    crownU.uDry.value = dry
    crownU.uWet.value = 1 - smoothstep(seg(p, 0.56, 0.72))
    crownU.uTime.value = time

    dropU.uTime.value = time
    dropU.uOn.value = (1 - smoothstep(seg(p, 0.08, 0.2))) + smoothstep(seg(p, 0.5, 0.58)) * (1 - smoothstep(seg(p, 0.62, 0.7)))

    // the flux the copy quotes, falling away with the canopy
    state = { altitude: altitudeAt(p), flux: lerp(20.1, 6.4, dry) }

    /* camera: up the column, across the river, down with the rain */
    const alt = altitudeAt(p)
    const az = 0.7 + p * 1.9 + Math.sin(time * 0.04) * 0.02
    const back = lerp(52, 520, smoothstep(seg(p, 0.1, 0.5))) * lerp(1, 1.5, smoothstep(seg(p, 0.82, 1)))
    camera.position.set(Math.cos(az) * back, alt, Math.sin(az) * back)
    target.set(
      Math.cos(az + 2.4) * back * 0.12,
      lerp(alt * 0.55, alt * 0.94, smoothstep(seg(p, 0.3, 0.5))),
      Math.sin(az + 2.4) * back * 0.12,
    )
    camera.lookAt(target)
    camera.rotation.z = Math.sin(time * 0.08) * 0.008
    dropRig.position.copy(camera.position)
    dropRig.quaternion.copy(camera.quaternion)

    bg.copy(SKY_WET).lerp(SKY_HIGH, smoothstep(seg(p, 0.2, 0.44)))
    bg.lerp(SKY_STORM, smoothstep(seg(p, 0.46, 0.58)))
    bg.lerp(SKY_DRY, dry)
    ;(scene.background as THREE.Color).copy(bg)
    fog.color.copy(bg)
    fog.density = lerp(0.0042, 0.0007, smoothstep(seg(p, 0.12, 0.44))) * lerp(1, 1.5, rainT)
    sun.intensity = lerp(1.7, 0.9, rainT) + dry * 0.8

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
    renderer.dispose()
  }

  return { update, resize, dispose, readState: () => state }
}

export const easeRe = easeInOutCubic

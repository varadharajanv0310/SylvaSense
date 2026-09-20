import * as THREE from 'three'
import { clamp01, easeInOutCubic, lerp, mulberry32, seg, smoothstep } from '../lib/math'
import { makeLeafTexture } from '../lib/textures'
import { perfTier } from '../lib/narrative'

/**
 * Concept 06 goes the one direction nothing else does: down.
 *
 * Roughly half of a tropical forest's carbon is below the surface, in root
 * mass and soil organic matter, and none of it has ever been photographed.
 * The scroll is depth. The camera sinks through litter, through the root
 * plate, through the fungal network, into the carbon itself — and the
 * clearing happens overhead, where you cannot see it.
 */

export const MAX_DEPTH = 9.4

/**
 * Scroll → depth, keyframed so the camera is standing in the horizon the copy
 * is describing. An eased sweep runs ahead of the text in the middle third.
 */
const DESCENT: [number, number][] = [
  [0.0, -0.9],
  [0.08, 0.0],
  [0.22, 0.6],
  [0.32, 1.4],
  [0.44, 3.4],
  [0.56, 5.4],
  [0.62, 6.8],
  [0.74, 8.8],
  [1.0, 8.8],
]

export function depthForScroll(p: number): number {
  const t = clamp01(p)
  let i = 0
  while (i < DESCENT.length - 2 && DESCENT[i + 1][0] < t) i++
  const [pa, da] = DESCENT[i]
  const [pb, db] = DESCENT[i + 1]
  const k = pb === pa ? 0 : clamp01((t - pa) / (pb - pa))
  return lerp(da, db, k * k * (3 - 2 * k))
}

export interface RootsScene {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
  readDepth: () => number
}

interface Seg {
  a: THREE.Vector3
  b: THREE.Vector3
  r: number
  order: number
}

/** Recursive root architecture: downward and outward, thinning as it goes. */
function growRoots(rnd: () => number, budget: number): { segs: Seg[]; nodes: THREE.Vector3[] } {
  const segs: Seg[] = []
  const nodes: THREE.Vector3[] = []
  const up = new THREE.Vector3(0, 1, 0)

  const branch = (p: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, order: number) => {
    if (segs.length > budget || rad < 0.012 || p.y < -MAX_DEPTH) return
    const b = p.clone().addScaledVector(dir, len)
    // roots never climb; keep everything under the surface
    if (b.y > -0.05) b.y = -0.05 - rnd() * 0.1
    segs.push({ a: p.clone(), b, r: rad, order })
    nodes.push(b.clone())

    const children = rad > 0.09 ? (rnd() < 0.62 ? 3 : 2) : rnd() < 0.5 ? 2 : 1
    for (let i = 0; i < children; i++) {
      const d = dir.clone()
      // splay outward, and bias downward more strongly with depth
      const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()
      d.applyAxisAngle(axis, (0.35 + rnd() * 0.75) * (i === 0 ? 0.5 : 1))
      d.addScaledVector(up, -0.22 - rnd() * 0.3)
      d.normalize()
      branch(b, d, len * (0.66 + rnd() * 0.18), rad * (0.58 + rnd() * 0.16), order + 1)
    }
  }

  // a plate of primary roots leaving the stump
  const primaries = 7
  for (let i = 0; i < primaries; i++) {
    const a = (i / primaries) * Math.PI * 2 + rnd() * 0.4
    const dir = new THREE.Vector3(Math.cos(a), -0.45 - rnd() * 0.4, Math.sin(a)).normalize()
    branch(new THREE.Vector3(0, -0.12, 0), dir, 1.5 + rnd() * 0.7, 0.3 + rnd() * 0.12, 0)
  }
  // plus a taproot
  branch(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0.04, -1, 0.02).normalize(), 1.8, 0.34, 0)
  return { segs, nodes }
}

export function createRootsScene(canvas: HTMLCanvasElement): RootsScene {
  const tier = perfTier()
  const BUDGET = tier === 'low' ? 1600 : tier === 'mid' ? 3600 : 6000
  const MYC = tier === 'low' ? 1400 : tier === 'mid' ? 3200 : 5200
  const GRAINS = tier === 'low' ? 1800 : tier === 'mid' ? 4200 : 7000
  const LITTER = tier === 'low' ? 60 : 140

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 1.2 : 1.7))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0906)
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 160)

  const rnd = mulberry32(606)
  const { segs, nodes } = growRoots(rnd, BUDGET)

  /* ---------------- roots ---------------- */

  const rPos = new Float32Array(segs.length * 6)
  const rDepth = new Float32Array(segs.length * 2)
  const rRad = new Float32Array(segs.length * 2)
  const rSeed = new Float32Array(segs.length * 2)
  segs.forEach((s, i) => {
    rPos.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6)
    rDepth[i * 2] = -s.a.y
    rDepth[i * 2 + 1] = -s.b.y
    rRad[i * 2] = s.r
    rRad[i * 2 + 1] = s.r * 0.85
    const sd = rnd()
    rSeed[i * 2] = sd
    rSeed[i * 2 + 1] = sd
  })

  const rootU = {
    uDepth: { value: 0 }, // where the camera is
    uReveal: { value: 0 }, // how much of the system has been drawn in
    uDie: { value: 0 }, // the clearing, felt from below
    uModel: { value: 0 }, // redrawn as an inferred estimate
    uTime: { value: 0 },
  }

  const roots = new THREE.LineSegments(
    (() => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(rPos, 3))
      g.setAttribute('aDepth', new THREE.BufferAttribute(rDepth, 1))
      g.setAttribute('aRad', new THREE.BufferAttribute(rRad, 1))
      g.setAttribute('aSeed', new THREE.BufferAttribute(rSeed, 1))
      return g
    })(),
    new THREE.ShaderMaterial({
      uniforms: rootU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute float aDepth, aRad, aSeed;',
        'uniform float uDepth, uReveal, uDie, uTime;',
        'varying float vD, vR, vS, vDist;',
        'void main(){',
        '  vD = aDepth; vR = aRad; vS = aSeed;',
        '  vec3 p = position;',
        // as the stand is cleared the fine roots shrivel toward their parent
        '  float shrink = uDie * (1.0 - smoothstep(0.0, 0.22, aRad));',
        '  p *= (1.0 - shrink * 0.5);',
        '  p.x += sin(uTime * 0.7 + aSeed * 30.0) * 0.006;',
        '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
        '  vDist = -mv.z;',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float uDepth, uReveal, uDie, uModel, uTime;',
        'varying float vD, vR, vS, vDist;',
        'void main(){',
        // the system draws in from the surface downward as you descend
        '  if (vD > uReveal) discard;',
        '  vec3 live = mix(vec3(0.72,0.44,0.16), vec3(0.94,0.74,0.42), clamp(vR*3.4, 0.0, 1.0));',
        '  vec3 dead = vec3(0.16,0.13,0.11);',
        '  vec3 model = vec3(0.30,0.94,0.62);',
        '  vec3 col = mix(live, dead, smoothstep(0.1, 0.9, uDie));',
        '  col = mix(col, model, uModel);',
        // brightest where the camera is level with them
        '  float band = 1.0 - smoothstep(0.0, 3.4, abs(vD - uDepth));',
        '  float near = smoothstep(26.0, 1.2, vDist);',
        '  float a = (0.16 + band * 0.9) * near * (0.35 + vR * 3.0);',
        '  a *= mix(1.0, 0.5, uDie);',
        '  if (a < 0.006) discard;',
        '  gl_FragColor = vec4(col * (0.7 + band * 0.7), a);',
        '}',
      ].join('\n'),
    }),
  )
  roots.frustumCulled = false
  scene.add(roots)

  /* ---------------- mycelium ---------------- */

  const mPos = new Float32Array(MYC * 6)
  const mSeed = new Float32Array(MYC * 2)
  const mDepth = new Float32Array(MYC * 2)
  const mT = new Float32Array(MYC * 2)
  for (let i = 0; i < MYC; i++) {
    const n = nodes[(rnd() * nodes.length) | 0]
    if (!n) continue
    const a = n.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.9))
    const b = a.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.5, (rnd() - 0.5) * 1.1, (rnd() - 0.5) * 1.5))
    mPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6)
    const d = rnd()
    mSeed[i * 2] = d
    mSeed[i * 2 + 1] = d
    mDepth[i * 2] = -a.y
    mDepth[i * 2 + 1] = -b.y
    mT[i * 2] = 0
    mT[i * 2 + 1] = 1
  }

  const mycU = { uDepth: { value: 0 }, uOn: { value: 0 }, uDie: { value: 0 }, uTime: { value: 0 } }
  const mycelium = new THREE.LineSegments(
    (() => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(mPos, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(mSeed, 1))
      g.setAttribute('aDepth', new THREE.BufferAttribute(mDepth, 1))
      g.setAttribute('aT', new THREE.BufferAttribute(mT, 1))
      return g
    })(),
    new THREE.ShaderMaterial({
      uniforms: mycU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute float aSeed, aDepth, aT;',
        'varying float vS, vD, vT, vDist;',
        'void main(){ vS = aSeed; vD = aDepth; vT = aT;',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0); vDist = -mv.z;',
        '  gl_Position = projectionMatrix * mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform float uDepth, uOn, uDie, uTime;',
        'varying float vS, vD, vT, vDist;',
        'void main(){',
        // a signal travels the network; it stops when the host dies
        '  float pulse = 0.35 + 0.65 * pow(max(0.0, sin((uTime * 0.9 + vS * 12.0 + vT * 0.8) * 3.1416)), 8.0);',
        '  float band = 1.0 - smoothstep(0.0, 3.0, abs(vD - uDepth));',
        '  float near = smoothstep(20.0, 1.0, vDist);',
        '  float a = uOn * near * (0.05 + band * 0.55) * mix(pulse, 0.06, uDie);',
        '  if (a < 0.005) discard;',
        '  vec3 col = mix(vec3(0.42,0.95,0.86), vec3(0.20,0.28,0.30), uDie);',
        '  gl_FragColor = vec4(col, a);',
        '}',
      ].join('\n'),
    }),
  )
  mycelium.frustumCulled = false
  scene.add(mycelium)

  /* ---------------- soil grains and carbon ---------------- */

  const gPos = new Float32Array(GRAINS * 3)
  const gSeed = new Float32Array(GRAINS)
  const gSize = new Float32Array(GRAINS)
  for (let i = 0; i < GRAINS; i++) {
    const a = rnd() * Math.PI * 2
    const r = Math.pow(rnd(), 0.5) * 9
    gPos[i * 3] = Math.cos(a) * r
    gPos[i * 3 + 1] = -rnd() * (MAX_DEPTH + 1.5)
    gPos[i * 3 + 2] = Math.sin(a) * r
    gSeed[i] = rnd()
    gSize[i] = 0.4 + rnd() * 2.2
  }
  const grainU = { uDepth: { value: 0 }, uTime: { value: 0 }, uCarbon: { value: 0 }, uRelease: { value: 0 } }
  const grains = new THREE.Points(
    (() => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(gPos, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(gSeed, 1))
      g.setAttribute('aSize', new THREE.BufferAttribute(gSize, 1))
      return g
    })(),
    new THREE.ShaderMaterial({
      uniforms: grainU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute float aSeed, aSize;',
        'uniform float uTime, uRelease, uDepth;',
        'varying float vS, vD, vDist;',
        'void main(){',
        '  vS = aSeed;',
        '  vec3 p = position;',
        '  p.x += sin(uTime*0.28 + aSeed*40.0)*0.16;',
        '  p.z += cos(uTime*0.23 + aSeed*33.0)*0.16;',
        // oxidised soil carbon leaves the ground and does not come back
        '  p.y += uRelease * mod(aSeed*70.0 + uTime*1.6, 16.0);',
        '  vD = -p.y;',
        '  vec4 mv = modelViewMatrix * vec4(p,1.0);',
        '  vDist = -mv.z;',
        '  gl_PointSize = clamp(aSize * (90.0 / max(0.4, -mv.z)), 1.0, 22.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float uDepth, uCarbon, uRelease;',
        'varying float vS, vD, vDist;',
        'void main(){',
        '  float d = length(gl_PointCoord - 0.5);',
        '  if (d > 0.5) discard;',
        '  float soft = smoothstep(0.5, 0.05, d);',
        '  vec3 soil = mix(vec3(0.34,0.22,0.12), vec3(0.58,0.42,0.24), vS);',
        '  vec3 carbon = mix(vec3(0.10,0.10,0.11), vec3(0.42,0.40,0.38), vS);',
        '  vec3 col = mix(soil, carbon, uCarbon);',
        '  float band = 1.0 - smoothstep(0.0, 4.2, abs(vD - uDepth));',
        '  float a = soft * (0.05 + band * 0.5) * smoothstep(24.0, 0.6, vDist);',
        '  if (a < 0.005) discard;',
        '  gl_FragColor = vec4(col, a);',
        '}',
      ].join('\n'),
    }),
  )
  grains.frustumCulled = false
  scene.add(grains)

  /* ---------------- the litter layer we start in ---------------- */

  const leafTex = makeLeafTexture(160, 12)
  const litter = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1.5),
    new THREE.MeshBasicMaterial({ map: leafTex, transparent: true, alphaTest: 0.14, side: THREE.DoubleSide }),
    LITTER,
  )
  litter.frustumCulled = false
  {
    const d = new THREE.Object3D()
    for (let i = 0; i < LITTER; i++) {
      const a = rnd() * Math.PI * 2
      const r = Math.pow(rnd(), 0.6) * 5.5
      d.position.set(Math.cos(a) * r, 0.02 + rnd() * 0.16, Math.sin(a) * r)
      d.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.7, rnd() * 6.28, rnd() * 6.28)
      const s = 0.3 + rnd() * 0.5
      d.scale.set(s, s, s)
      d.updateMatrix()
      litter.setMatrixAt(i, d.matrix)
      litter.setColorAt(i, new THREE.Color().setHSL(0.09 + rnd() * 0.07, 0.4 + rnd() * 0.24, 0.16 + rnd() * 0.2))
    }
    litter.instanceMatrix.needsUpdate = true
    litter.instanceColor!.needsUpdate = true
  }
  scene.add(litter)

  /* ---------------- frame ---------------- */

  const BG_SOIL = new THREE.Color(0x0a0906)
  const BG_DEEP = new THREE.Color(0x05060a)
  const BG_DEAD = new THREE.Color(0x0b0a09)
  const bg = new THREE.Color()
  const target = new THREE.Vector3()
  let time = 0
  let depth = 0

  function update(p: number, dt: number) {
    time += dt

    // the camera sinks, holds through the dying, then pulls back for the model
    const sink = clamp01(depthForScroll(p) / 8.8)
    const pull = easeInOutCubic(seg(p, 0.86, 1))
    const camY = -depthForScroll(p) + pull * 3.4
    depth = Math.max(0, -camY)

    const orbit = 0.5 + p * 1.3 + Math.sin(time * 0.06) * 0.04
    const rad = lerp(1.1, 3.0, smoothstep(seg(p, 0.2, 0.6))) + pull * 9
    camera.position.set(Math.cos(orbit) * rad, camY, Math.sin(orbit) * rad)
    target.set(
      Math.cos(orbit + 2.2) * rad * 0.25,
      camY - lerp(1.6, 0.4, sink) + pull * 2.4,
      Math.sin(orbit + 2.2) * rad * 0.25,
    )
    camera.lookAt(target)
    camera.fov = lerp(58, 46, pull)
    camera.updateProjectionMatrix()

    const die = smoothstep(seg(p, 0.78, 0.9))
    const model = smoothstep(seg(p, 0.9, 0.97))

    rootU.uDepth.value = depth
    rootU.uReveal.value = Math.max(1.2, depthForScroll(p) + 2.6)
    rootU.uDie.value = die
    rootU.uModel.value = model
    rootU.uTime.value = time

    mycU.uDepth.value = depth
    mycU.uOn.value = smoothstep(seg(p, 0.44, 0.56)) * (1 - model * 0.55)
    mycU.uDie.value = die
    mycU.uTime.value = time

    grainU.uDepth.value = depth
    grainU.uTime.value = time
    grainU.uCarbon.value = smoothstep(seg(p, 0.6, 0.72))
    grainU.uRelease.value = smoothstep(seg(p, 0.8, 0.95))

    // the litter is only there while we are still at the surface
    const litterOn = 1 - smoothstep(seg(p, 0.05, 0.16))
    litter.visible = litterOn > 0.02
    ;(litter.material as THREE.MeshBasicMaterial).opacity = litterOn
    ;(litter.material as THREE.MeshBasicMaterial).transparent = true

    bg.copy(BG_SOIL).lerp(BG_DEEP, smoothstep(seg(p, 0.3, 0.62)))
    bg.lerp(BG_DEAD, die)
    ;(scene.background as THREE.Color).copy(bg)

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
    renderer.dispose()
  }

  return { update, resize, dispose, readDepth: () => depth }
}

export const clampRe = clamp01

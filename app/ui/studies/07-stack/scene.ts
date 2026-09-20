import * as THREE from 'three'
import { clamp01, easeInOutCubic, lerp, mulberry32, seg, smoothstep } from '../lib/math'
import { makeForestMask } from '../lib/mask'
import { perfTier } from '../lib/narrative'

/**
 * Concept 07 is the actual shape of Earth observation data: x, y, and time.
 * Every observation of this cell since 1984 is a horizontal slice. Scrolling
 * falls down the time axis; the slice where the forest ended is findable, and
 * the whole cube then collapses into its own cross-section.
 */

export const FIRST = 1984.28
export const LAST = 2026.71
/** the block clear-cut lands on this date; the slice below it is still green */
export const EVENT = 2019.62
export const TOTAL_OBS = 2118

const SPAN = 200 // slice extent in world units
const GAP = 2.4 // vertical spacing between slices

export interface StackScene {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
  readState: () => { date: number; index: number; cloud: boolean; sar: boolean }
}

export function createStackScene(canvas: HTMLCanvasElement): StackScene {
  const tier = perfTier()
  const N = tier === 'low' ? 90 : tier === 'mid' ? 170 : 260

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 1.2 : 1.7))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05080c)
  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 6000)

  const mask = makeForestMask(256, 21)
  const maskTex = new THREE.CanvasTexture(mask.canvas)
  const rnd = mulberry32(1984)

  /* ---------------- slices ---------------- */

  const dates = new Float32Array(N)
  const clouds = new Float32Array(N)
  const sars = new Float32Array(N)
  const seeds = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    // index 0 is the most recent observation, at the top of the stack
    const k = i / (N - 1)
    dates[i] = lerp(LAST, FIRST, k)
    sars[i] = i % 7 === 3 && dates[i] > 2014.7 ? 1 : 0 // Sentinel-1 only exists after 2014
    // roughly two in three optical passes over wet tropics are unusable
    clouds[i] = sars[i] > 0.5 ? 0 : rnd() < 0.42 ? 0.55 + rnd() * 0.44 : 0
    seeds[i] = rnd()
  }
  // the opening frame is the one clean observation the visitor arrives on
  clouds[0] = 0
  clouds[1] = 0
  sars[0] = 0

  const sliceGeo = new THREE.PlaneGeometry(SPAN, SPAN, 1, 1)
  sliceGeo.rotateX(-Math.PI / 2)

  const U = {
    uMask: { value: maskTex },
    uSpread: { value: 0 }, // 0 = one image, 1 = a stack
    uSliver: { value: 0 }, // collapse each slice to its own cross-section
    uFocus: { value: 0 }, // world-Y the camera is passing through
    uReveal: { value: 1 },
    uQuery: { value: -999 }, // world-x of the query column
    uQueryOn: { value: 0 },
    uTime: { value: 0 },
  }

  const slices = new THREE.InstancedMesh(
    sliceGeo,
    new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      vertexShader: [
        'attribute float aDate, aCloud, aSar, aSeed, aY;',
        'uniform float uSpread, uSliver;',
        'varying float vDate, vCloud, vSar, vSeed, vY;',
        'varying vec2 vUv; varying vec3 vW;',
        'void main(){',
        '  vDate = aDate; vCloud = aCloud; vSar = aSar; vSeed = aSeed; vUv = uv;',
        '  vec3 p = position;',
        // collapsing the cube: every slice shrinks to a ribbon through its middle
        '  p.z *= mix(1.0, 0.055, uSliver);',
        '  vec4 world = instanceMatrix * vec4(p, 1.0);',
        '  world.y *= uSpread;',
        '  vY = world.y; vW = world.xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * world;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uMask; uniform float uFocus, uReveal, uTime, uQuery, uQueryOn, uSliver;',
        'varying float vDate, vCloud, vSar, vSeed, vY;',
        'varying vec2 vUv; varying vec3 vW;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
        'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
        '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }',
        'float fbm(vec2 p){ return vnoise(p)*0.55+vnoise(p*2.3)*0.29+vnoise(p*5.1)*0.16; }',
        'void main(){',
        '  vec2 uv = vec2(vUv.x, mix(vUv.y, 0.36, uSliver));',
        '  float m = texture2D(uMask, uv).r;',
        // the clearing front advances with the calendar; before 1995 nothing is cut
        '  float prog = clamp((vDate - 1995.0) / 31.0, 0.0, 1.0);',
        '  float front = smoothstep(prog + 0.1, prog - 0.1, 1.0 - uv.y);',
        '  float cut = clamp(m * front, 0.0, 1.0);',
        // the block clear-cut is a single dated event, not a gradient
        '  float inBlock = step(0.16, uv.x) * step(uv.x, 0.32) * step(0.31, uv.y) * step(uv.y, 0.42);',
        '  float block = inBlock * step(0.5, m) * step(2019.62, vDate);',
        '  cut = max(cut, block);',
        '  float n = fbm(uv * 34.0 + vSeed * 12.0);',
        '  vec3 canopy = mix(vec3(0.045,0.16,0.06), vec3(0.11,0.34,0.11), n);',
        '  vec3 bare   = mix(vec3(0.30,0.21,0.12), vec3(0.42,0.30,0.17), n);',
        '  vec3 col = mix(canopy, bare, cut);',
        // radar passes read as structure, not colour, and are never clouded
        '  float sp = 0.45 + hash(floor(uv*300.0) + vSeed*40.0)*1.05;',
        '  vec3 radar = mix(vec3(0.30,0.44,0.62)*sp, vec3(0.04,0.06,0.09), cut);',
        '  col = mix(col, radar, vSar);',
        // cloud: the observation exists but carries no information
        '  float cl = fbm(uv*7.0 + vSeed*30.0);',
        '  vec3 cloud = vec3(0.80,0.83,0.87) * (0.72 + cl*0.5);',
        '  float cloudMix = vCloud * smoothstep(0.24, 0.62, cl + vCloud*0.35);',
        // the cross-section is built from analysis-ready data: cloud is masked out
        '  col = mix(col, cloud, cloudMix * (1.0 - uSliver * 0.94));',
        // the slice the camera is level with is the one you are reading
        '  float focus = 1.0 - smoothstep(0.0, 42.0, abs(vY - uFocus));',
        '  col *= mix(0.42, 1.18, focus);',
        // plate edges
        '  vec2 e = abs(vUv - 0.5) * 2.0;',
        '  col *= mix(1.0, 1.35, uSliver);',
        '  float edge = smoothstep(0.984, 1.0, max(e.x, e.y));',
        '  col += vec3(0.45,0.72,0.78) * edge * (0.35 + focus*0.9);',
        // query column
        '  float q = 1.0 - smoothstep(0.0, 3.4, abs(vW.x - uQuery));',
        '  col += vec3(0.48,1.0,0.72) * q * uQueryOn * 0.8;',
        '  float a = uReveal * mix(1.0, 0.94, uSliver);',
        '  if (a < 0.01) discard;',
        '  gl_FragColor = vec4(col, a);',
        '}',
      ].join('\n'),
    }),
    N,
  )
  slices.frustumCulled = false
  {
    const d = new THREE.Object3D()
    const yArr = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const y = -i * GAP
      yArr[i] = y
      d.position.set(0, y, 0)
      d.rotation.set(0, 0, 0)
      d.scale.set(1, 1, 1)
      d.updateMatrix()
      slices.setMatrixAt(i, d.matrix)
    }
    slices.instanceMatrix.needsUpdate = true
    const g = slices.geometry
    g.setAttribute('aDate', new THREE.InstancedBufferAttribute(dates, 1))
    g.setAttribute('aCloud', new THREE.InstancedBufferAttribute(clouds, 1))
    g.setAttribute('aSar', new THREE.InstancedBufferAttribute(sars, 1))
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    g.setAttribute('aY', new THREE.InstancedBufferAttribute(yArr, 1))
  }
  scene.add(slices)

  /* the event marker: a ring around the last green observation */
  const eventIndex = (() => {
    let best = 0
    for (let i = 0; i < N; i++) if (dates[i] >= EVENT) best = i
    return Math.min(N - 1, best + 1)
  })()
  const markerMat = new THREE.LineBasicMaterial({ color: 0x7af0b4, transparent: true, opacity: 0, depthTest: false })
  const markerPts = [
    new THREE.Vector3(-SPAN / 2, 0, -SPAN / 2),
    new THREE.Vector3(SPAN / 2, 0, -SPAN / 2),
    new THREE.Vector3(SPAN / 2, 0, SPAN / 2),
    new THREE.Vector3(-SPAN / 2, 0, SPAN / 2),
    new THREE.Vector3(-SPAN / 2, 0, -SPAN / 2),
  ]
  const marker = new THREE.Line(new THREE.BufferGeometry().setFromPoints(markerPts), markerMat)
  marker.frustumCulled = false
  scene.add(marker)

  /* ---------------- frame ---------------- */

  const stackHeight = (N - 1) * GAP
  const target = new THREE.Vector3()
  let time = 0
  let state = { date: LAST, index: 0, cloud: false, sar: false }

  function update(p: number, dt: number) {
    time += dt

    const spread = smoothstep(seg(p, 0.1, 0.21))
    const descend = easeInOutCubic(seg(p, 0.21, 0.58))
    const collapse = smoothstep(seg(p, 0.65, 0.78))
    const side = easeInOutCubic(seg(p, 0.63, 0.8))
    const query = smoothstep(seg(p, 0.8, 0.88))

    U.uSpread.value = spread
    U.uSliver.value = collapse
    U.uTime.value = time
    U.uQueryOn.value = query * (1 - smoothstep(seg(p, 0.95, 1)))
    U.uQuery.value = -34

    // which slice is the camera level with
    const focusY = -descend * stackHeight * spread
    U.uFocus.value = lerp(focusY, -stackHeight * 0.5 * spread, side)

    const idx = Math.min(N - 1, Math.round(descend * (N - 1)))
    state = { date: dates[idx], index: idx, cloud: clouds[idx] > 0.5, sar: sars[idx] > 0.5 }

    marker.position.y = -eventIndex * GAP * spread
    markerMat.opacity =
      (1 - Math.min(1, Math.abs(idx - eventIndex) / 4)) * (1 - side) * (0.55 + 0.45 * Math.sin(time * 3.2))

    /* camera: nadir hover → fall through the stack → swing to the side */
    // start nadir on the single image, then tilt into a three-quarter view so
    // the plates below the focused one stay visible while the camera descends
    const tilt = smoothstep(seg(p, 0.1, 0.26))
    const el = lerp(1.5, 0.66, tilt)
    const orbitR = lerp(120, 205, tilt)
    const az = 0.85 + p * 0.5 + Math.sin(time * 0.05) * 0.02

    const descY = focusY + Math.sin(el) * orbitR
    const descX = Math.cos(az) * Math.cos(el) * orbitR
    const descZ = Math.sin(az) * Math.cos(el) * orbitR

    const sideY = -stackHeight * 0.5 * spread + 26
    const sideR = 330
    camera.position.set(
      lerp(descX, Math.cos(az) * sideR, side),
      lerp(descY, sideY, side),
      lerp(descZ, Math.sin(az) * sideR, side),
    )
    target.set(0, lerp(focusY - 18, -stackHeight * 0.5 * spread, side), 0)
    camera.lookAt(target)
    camera.fov = lerp(46, 34, side)
    camera.updateProjectionMatrix()

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

  return { update, resize, dispose, readState: () => state }
}

/** Decimal year → an ISO-looking date string. */
export function formatDate(year: number) {
  const y = Math.floor(year)
  const frac = year - y
  const d = new Date(y, 0, 1)
  d.setDate(d.getDate() + Math.round(frac * 364))
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

export const clamp01Re = clamp01

import * as THREE from 'three'
import { clamp01, easeInOutCubic, lerp, makeNoise2D, mulberry32, seg, smoothstep } from '../lib/math'
import { perfTier } from '../lib/narrative'
import { CELLS, health, instability, yearForScroll } from './cells'

/**
 * The canopy for concept 08. It breathes: crowns swell and colour shifts with
 * the seasonal phase, and each monitoring cell responds to its own health
 * curve, so the ground and the traces on top of it are the same data.
 */

const SPAN = 420
const COLS = 4
const ROWS = 3

export interface VitalsScene {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
}

export function createVitalsScene(canvas: HTMLCanvasElement): VitalsScene {
  const tier = perfTier()
  const CROWNS = tier === 'low' ? 1100 : tier === 'mid' ? 2600 : 4200

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 1.2 : 1.7))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2(0x061009, 0.004)
  scene.fog = fog
  scene.background = new THREE.Color(0x061009)

  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.5, 2400)

  scene.add(new THREE.HemisphereLight(0xcfeccd, 0x101c0e, 1.15))
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.9)
  sun.position.set(-90, 160, 70)
  scene.add(sun)

  const noise = makeNoise2D(808)
  const rnd = mulberry32(2308)

  const cellOf = (x: number, z: number) => {
    const c = Math.min(COLS - 1, Math.max(0, Math.floor(((x + SPAN / 2) / SPAN) * COLS)))
    const r = Math.min(ROWS - 1, Math.max(0, Math.floor(((z + SPAN / 2) / SPAN) * ROWS)))
    return r * COLS + c
  }

  /* ---------------- ground ---------------- */

  const groundU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uHealth: { value: new Float32Array(12).fill(1) },
    uPhase: { value: 0 },
    uGrid: { value: 0 },
    uTime: { value: 0 },
  })

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(SPAN, SPAN, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: groundU,
      fog: true,
      vertexShader: [
        'varying vec2 vUv; varying vec3 vW;',
        '#include <fog_pars_vertex>',
        'void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz;',
        '  vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;',
        '  #include <fog_vertex>',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float uHealth[12]; uniform float uPhase, uGrid, uTime;',
        'varying vec2 vUv; varying vec3 vW;',
        '#include <fog_pars_fragment>',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
        'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
        '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }',
        'void main(){',
        '  int c = int(floor(vUv.x*4.0)) + int(floor(vUv.y*3.0))*4;',
        '  float h = 1.0;',
        '  for (int i = 0; i < 12; i++) { if (i == c) h = uHealth[i]; }',
        '  float n = vnoise(vUv*70.0)*0.6 + vnoise(vUv*20.0)*0.4;',
        '  vec3 alive = mix(vec3(0.035,0.09,0.04), vec3(0.07,0.17,0.06), n);',
        '  vec3 gone  = mix(vec3(0.20,0.15,0.09), vec3(0.30,0.22,0.13), n);',
        '  vec3 col = mix(gone, alive, h);',
        // cell boundaries, drawn only while the monitor view is up
        '  vec2 g = abs(fract(vec2(vUv.x*4.0, vUv.y*3.0)) - 0.5);',
        '  float line = 1.0 - smoothstep(0.0, 0.006, min(g.x, g.y));',
        '  col += vec3(0.24,0.72,0.58) * line * uGrid * 0.6;',
        '  gl_FragColor = vec4(col, 1.0);',
        '  #include <fog_fragment>',
        '}',
      ].join('\n'),
    }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  /* ---------------- crowns ---------------- */

  const crownGeo = new THREE.IcosahedronGeometry(1, 1)
  {
    const pos = crownGeo.attributes.position as THREE.BufferAttribute
    const r2 = mulberry32(77)
    for (let i = 0; i < pos.count; i++) {
      const f = 0.76 + r2() * 0.42
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.82, pos.getZ(i) * f)
    }
    crownGeo.computeVertexNormals()
  }

  const U = {
    uHealth: { value: new Float32Array(12).fill(1) },
    uUnrest: { value: new Float32Array(12).fill(0) },
    uPhase: { value: 0 },
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0x061009) },
    uFogDensity: { value: 0.004 },
  }

  const crowns = new THREE.InstancedMesh(
    crownGeo,
    new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: [
        'attribute float aCell, aSeed;',
        'uniform float uHealth[12]; uniform float uUnrest[12]; uniform float uPhase, uTime;',
        'varying float vSeed, vHealth, vUnrest, vLit, vDepth; varying vec3 vN;',
        'void main(){',
        '  vSeed = aSeed;',
        '  int c = int(aCell + 0.5);',
        '  float h = 1.0; float u = 0.0;',
        '  for (int i = 0; i < 12; i++) { if (i == c) { h = uHealth[i]; u = uUnrest[i]; } }',
        '  vHealth = h; vUnrest = u;',
        // the breath: a small, regular swell, which grows ragged under stress
        '  float breath = sin((uPhase + aSeed*0.07) * 6.2831) * (0.055 + u * 0.16);',
        '  float ragged = sin(uTime*2.3 + aSeed*40.0) * u * 0.06;',
        '  float s = (1.0 + breath + ragged) * mix(0.06, 1.0, smoothstep(0.0, 0.45, h));',
        '  vec3 p = position * s;',
        '  vec4 world = instanceMatrix * vec4(p, 1.0);',
        '  vN = normalMatrix * mat3(instanceMatrix) * normal;',
        '  vec4 mv = modelViewMatrix * world;',
        '  vDepth = -mv.z;',
        '  vLit = clamp(dot(normalize(vN), normalize(vec3(-0.45,0.8,0.36)))*0.7 + 0.42, 0.0, 1.4);',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float uPhase; uniform vec3 uFogColor; uniform float uFogDensity;',
        'varying float vSeed, vHealth, vUnrest, vLit, vDepth; varying vec3 vN;',
        'void main(){',
        // seasonal greenness, then the drain as the cell is lost
        '  float season = 0.5 + 0.5*sin(uPhase*6.2831);',
        '  vec3 wet = mix(vec3(0.13,0.40,0.16), vec3(0.28,0.60,0.24), vSeed);',
        '  vec3 dry = mix(vec3(0.20,0.34,0.13), vec3(0.42,0.50,0.20), vSeed);',
        '  vec3 col = mix(dry, wet, season);',
        '  col = mix(col, mix(vec3(0.30,0.24,0.14), vec3(0.42,0.34,0.20), vSeed), 1.0 - smoothstep(0.1, 0.9, vHealth));',
        // stressed stands yellow off before they disappear
        '  col = mix(col, vec3(0.62,0.54,0.16), vUnrest * 0.4);',
        '  col *= vLit;',
        '  float f = 1.0 - exp(-pow(vDepth*uFogDensity, 2.0));',
        '  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    }),
    CROWNS,
  )
  crowns.frustumCulled = false
  {
    const d = new THREE.Object3D()
    const cellAttr = new Float32Array(CROWNS)
    const seedAttr = new Float32Array(CROWNS)
    for (let i = 0; i < CROWNS; i++) {
      const x = (rnd() - 0.5) * SPAN * 0.98
      const z = (rnd() - 0.5) * SPAN * 0.98
      const r = 3.4 + rnd() * 4.2 + noise(x * 0.01, z * 0.01) * 1.6
      d.position.set(x, r * 0.78, z)
      d.scale.set(r, r * 0.84, r)
      d.rotation.set(0, rnd() * 6.28, 0)
      d.updateMatrix()
      crowns.setMatrixAt(i, d.matrix)
      cellAttr[i] = cellOf(x, z)
      seedAttr[i] = rnd()
    }
    crowns.instanceMatrix.needsUpdate = true
    crowns.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellAttr, 1))
    crowns.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr, 1))
  }
  scene.add(crowns)

  /* ---------------- frame ---------------- */

  const target = new THREE.Vector3()
  const bg = new THREE.Color()
  const NIGHT = new THREE.Color(0x061009)
  const MONITOR = new THREE.Color(0x03090b)
  let time = 0

  function update(p: number, dt: number) {
    time += dt

    const year = yearForScroll(p)
    const phase = year % 1

    const hArr = U.uHealth.value as Float32Array
    const uArr = U.uUnrest.value as Float32Array
    for (let i = 0; i < 12; i++) {
      hArr[i] = health(CELLS[i], year)
      uArr[i] = instability(CELLS[i], year)
    }
    ;(groundU.uHealth.value as Float32Array).set(hArr)

    U.uPhase.value = phase
    U.uTime.value = time
    groundU.uPhase.value = phase
    groundU.uTime.value = time
    groundU.uGrid.value = smoothstep(seg(p, 0.7, 0.82))

    const monitor = smoothstep(seg(p, 0.66, 0.84))
    bg.copy(NIGHT).lerp(MONITOR, monitor)
    ;(scene.background as THREE.Color).copy(bg)
    fog.color.copy(bg)
    U.uFogColor.value.copy(bg)

    /* camera: low drift over the canopy, then up to see all twelve cells */
    const rise = easeInOutCubic(seg(p, 0.2, 0.78))
    const dist = lerp(52, 430, rise)
    const elev = lerp(0.2, 1.08, rise)
    const az = 0.8 + p * 0.9 + Math.sin(time * 0.04) * 0.02

    camera.position.set(
      Math.cos(az) * Math.cos(elev) * dist,
      lerp(16, 0, rise) + Math.sin(elev) * dist,
      Math.sin(az) * Math.cos(elev) * dist,
    )
    target.set(0, lerp(12, 0, rise), 0)
    camera.lookAt(target)

    fog.density = lerp(0.0078, 0.0012, rise)
    U.uFogDensity.value = fog.density
    sun.intensity = lerp(1.9, 1.15, monitor)

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

  return { update, resize, dispose }
}

export const clampRe = clamp01

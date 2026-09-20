import * as THREE from 'three'
import { clamp01, easeInOutCubic, lerp, makeNoise2D, mulberry32, seg, smoothstep } from '../lib/math'
import { perfTier } from '../lib/narrative'

/**
 * Concept 10 runs the only direction the rest of the set does not: forwards.
 *
 * The scroll is eighty years of succession on a cleared plot. Pioneers arrive
 * fast and make the ground look recovered within a decade; the species that
 * actually hold the carbon take four times as long. The gap between those two
 * facts is the entire argument, and it is why nobody funds restoration they
 * cannot watch.
 */

const R = 130
export const END_YEAR = 80

export interface SeedScene {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
  readState: () => { year: number; carbon: number; stems: number }
}

/** Scroll → year. The first decade gets a fifth of the scroll; it should drag. */
const YEARS: [number, number][] = [
  [0.0, 0],
  [0.12, 0],
  [0.22, 3],
  [0.32, 9],
  [0.46, 21],
  [0.6, 42],
  [0.7, 63],
  [0.8, 80],
  [1.0, 80],
]
export function yearAt(p: number) {
  const t = clamp01(p)
  let i = 0
  while (i < YEARS.length - 2 && YEARS[i + 1][0] < t) i++
  const [pa, a] = YEARS[i]
  const [pb, b] = YEARS[i + 1]
  const k = pb === pa ? 0 : clamp01((t - pa) / (pb - pa))
  return lerp(a, b, k * k * (3 - 2 * k))
}

/** Carbon recovery: fast-looking, slow-actually. 71% of baseline at year 80. */
export const carbonAt = (year: number) => 218.6 * 0.71 * (1 - Math.exp(-year / 26)) * (0.62 + 0.38 * clamp01(year / 80))

export function createSeedScene(canvas: HTMLCanvasElement): SeedScene {
  const tier = perfTier()
  const N = tier === 'low' ? 900 : tier === 'mid' ? 2400 : 4200

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 1.2 : 1.7))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.04

  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2(0x2a1d12, 0.006)
  scene.fog = fog
  scene.background = new THREE.Color(0x2a1d12)
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.2, 1400)

  scene.add(new THREE.HemisphereLight(0xdfe9c8, 0x2a2014, 1.1))
  const sun = new THREE.DirectionalLight(0xfff2d4, 2.0)
  sun.position.set(-90, 150, 70)
  scene.add(sun)

  const rnd = mulberry32(1010)
  const noise = makeNoise2D(1212)

  /* ---------------- ground ---------------- */

  const groundU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uYear: { value: 0 },
    uTime: { value: 0 },
  })
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 3, R * 3, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: groundU,
      fog: true,
      vertexShader: [
        'varying vec2 vUv;',
        '#include <fog_pars_vertex>',
        'void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0);',
        '  vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;',
        '  #include <fog_vertex>',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float uYear, uTime; varying vec2 vUv;',
        '#include <fog_pars_fragment>',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
        'float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
        '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }',
        'void main(){',
        '  float n = vn(vUv*140.0)*0.6 + vn(vUv*38.0)*0.4;',
        // bare laterite → litter → shaded forest floor
        '  vec3 bare = mix(vec3(0.32,0.17,0.10), vec3(0.46,0.28,0.16), n);',
        '  vec3 litter = mix(vec3(0.16,0.12,0.06), vec3(0.26,0.20,0.10), n);',
        '  vec3 shade = mix(vec3(0.045,0.07,0.035), vec3(0.09,0.13,0.06), n);',
        '  vec3 col = mix(bare, litter, smoothstep(2.0, 16.0, uYear));',
        '  col = mix(col, shade, smoothstep(14.0, 55.0, uYear));',
        '  gl_FragColor = vec4(col, 1.0);',
        '  #include <fog_fragment>',
        '}',
      ].join('\n'),
    }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  /* ---------------- stumps from the clearing ---------------- */

  const stumpGeo = new THREE.CylinderGeometry(0.5, 0.72, 1, 6)
  stumpGeo.translate(0, 0.5, 0)
  const stumps = new THREE.InstancedMesh(
    stumpGeo,
    new THREE.MeshLambertMaterial({ color: 0x241a11, transparent: true }),
    tier === 'low' ? 60 : 130,
  )
  stumps.frustumCulled = false
  {
    const d = new THREE.Object3D()
    for (let i = 0; i < stumps.count; i++) {
      const a = rnd() * Math.PI * 2
      const rad = Math.sqrt(rnd()) * R * 0.95
      d.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad)
      const s = 0.5 + rnd() * 0.7
      d.scale.set(s, 0.5 + rnd() * 1.1, s)
      d.rotation.set((rnd() - 0.5) * 0.2, rnd() * 6.28, (rnd() - 0.5) * 0.2)
      d.updateMatrix()
      stumps.setMatrixAt(i, d.matrix)
    }
    stumps.instanceMatrix.needsUpdate = true
  }
  scene.add(stumps)

  /* ---------------- succession ---------------- */

  const crownGeo = new THREE.IcosahedronGeometry(1, 1)
  {
    const pos = crownGeo.attributes.position as THREE.BufferAttribute
    const r2 = mulberry32(21)
    for (let i = 0; i < pos.count; i++) {
      const f = 0.74 + r2() * 0.46
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.84, pos.getZ(i) * f)
    }
    crownGeo.computeVertexNormals()
  }

  const treeU = {
    uYear: { value: 0 },
    uSeason: { value: 0 },
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
  }
  const SHARED = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), treeU)

  const VERT = [
    'attribute float aBirth, aMaxH, aRate, aPioneer, aSeed;',
    'uniform float uYear, uTime;',
    'uniform vec3 uCam;',
    'varying float vSeed, vPioneer, vGrow, vLit;',
    '#include <fog_pars_vertex>',
    'void main(){',
    '  vSeed = aSeed; vPioneer = aPioneer;',
    '  float age = max(0.0, uYear - aBirth);',
    // logistic growth, then pioneers are shaded out by what they sheltered
    '  float g = 1.0 - exp(-aRate * age);',
    '  float decline = mix(1.0, 1.0 - smoothstep(38.0, 74.0, uYear) * 0.72, aPioneer);',
    '  g *= decline;',
    // stand clear of the lens: a crown right on the camera reads as a green slab
    '  vec3 stem = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
    '  g *= smoothstep(7.0, 20.0, length(stem.xz - uCam.xz));',
    '  vGrow = g;',
    '  float h = aMaxH * g;',
    // crown diameter is about half the height, carried on top of the stem
    '  vec3 p = position * vec3(h * 0.5, h * 0.54, h * 0.5);',
    '  p.y += h * 0.5;',
    '  p.x += sin(uTime * 0.5 + aSeed * 30.0) * 0.05 * h;',
    '  vec4 world = instanceMatrix * vec4(p, 1.0);',
    '  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);',
    '  vLit = clamp(dot(n, normalize(vec3(-0.45,0.8,0.36))) * 0.7 + 0.42, 0.0, 1.4);',
    '  vec4 mvPosition = modelViewMatrix * world;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}',
  ].join('\n')

  const FRAG = [
    'uniform float uSeason, uYear;',
    'varying float vSeed, vPioneer, vGrow, vLit;',
    '#include <fog_pars_fragment>',
    'void main(){',
    '  if (vGrow < 0.004) discard;',
    // the seasons strobe as the years compress
    '  float season = 0.5 + 0.5 * sin(uSeason * 6.2831);',
    '  vec3 pioneerWet = mix(vec3(0.34,0.52,0.14), vec3(0.54,0.68,0.20), vSeed);',
    '  vec3 pioneerDry = mix(vec3(0.40,0.42,0.14), vec3(0.58,0.54,0.20), vSeed);',
    '  vec3 climaxWet  = mix(vec3(0.07,0.26,0.11), vec3(0.19,0.44,0.20), vSeed);',
    '  vec3 climaxDry  = mix(vec3(0.12,0.26,0.12), vec3(0.26,0.42,0.19), vSeed);',
    '  vec3 pio = mix(pioneerDry, pioneerWet, season);',
    '  vec3 cli = mix(climaxDry, climaxWet, season);',
    '  vec3 col = mix(cli, pio, vPioneer);',
    '  gl_FragColor = vec4(col * vLit, 1.0);',
    '  #include <fog_fragment>',
    '}',
  ].join('\n')

  const trees = new THREE.InstancedMesh(
    crownGeo,
    new THREE.ShaderMaterial({ uniforms: SHARED, fog: true, vertexShader: VERT, fragmentShader: FRAG }),
    N,
  )
  trees.frustumCulled = false

  const births = new Float32Array(N)
  const maxH = new Float32Array(N)
  const rate = new Float32Array(N)
  const pioneer = new Float32Array(N)
  const seed = new Float32Array(N)
  {
    const d = new THREE.Object3D()
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2
      const rad = Math.sqrt(rnd()) * R
      const x = Math.cos(a) * rad
      const z = Math.sin(a) * rad
      // two thirds arrive as pioneers; the rest are the species that hold carbon
      const isPio = rnd() < 0.64
      pioneer[i] = isPio ? 1 : 0
      births[i] = isPio ? 0.4 + rnd() * 6 : 4 + rnd() * 34
      maxH[i] = isPio ? 2.6 + rnd() * 3.4 : 6 + rnd() * 9 + noise(x * 0.01, z * 0.01) * 2
      rate[i] = isPio ? 0.26 + rnd() * 0.18 : 0.05 + rnd() * 0.05
      seed[i] = rnd()
      d.position.set(x, 0.9, z)
      d.scale.set(1, 1, 1)
      d.rotation.set(0, rnd() * 6.28, 0)
      d.updateMatrix()
      trees.setMatrixAt(i, d.matrix)
    }
    trees.instanceMatrix.needsUpdate = true
    const g = trees.geometry
    g.setAttribute('aBirth', new THREE.InstancedBufferAttribute(births, 1))
    g.setAttribute('aMaxH', new THREE.InstancedBufferAttribute(maxH, 1))
    g.setAttribute('aRate', new THREE.InstancedBufferAttribute(rate, 1))
    g.setAttribute('aPioneer', new THREE.InstancedBufferAttribute(pioneer, 1))
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1))
  }
  scene.add(trees)

  /* ---------------- frame ---------------- */

  const SKY_BARE = new THREE.Color(0x2a1d12)
  const SKY_MID = new THREE.Color(0x1d2416)
  const SKY_CLOSED = new THREE.Color(0x0c160c)
  const bg = new THREE.Color()
  const target = new THREE.Vector3()
  let time = 0
  let state = { year: 0, carbon: 0, stems: 0 }

  function update(p: number, dt: number) {
    time += dt
    const year = yearAt(p)

    treeU.uYear.value = year
    // one cycle per year: as the years compress this becomes a strobe
    treeU.uSeason.value = year
    treeU.uTime.value = time
    groundU.uYear.value = year
    groundU.uTime.value = time

    const stumpFade = 1 - smoothstep(seg(year, 10, 46))
    ;(stumps.material as THREE.MeshLambertMaterial).opacity = stumpFade
    stumps.visible = stumpFade > 0.02

    // living stems: pioneers arrive first, then thin out
    let stems = 0
    for (let i = 0; i < N; i++) {
      if (year <= births[i]) continue
      if (pioneer[i] > 0.5 && year > 60 && seed[i] > 0.42) continue
      stems++
    }
    state = { year, carbon: carbonAt(year), stems: Math.round((stems / N) * 2_417_338 * 0.42) }

    /* camera: kneeling on bare ground, rising with the canopy */
    const rise = easeInOutCubic(clamp01(year / 74))
    const pull = easeInOutCubic(seg(p, 0.84, 1))
    const az = 0.9 + p * 1.4 + Math.sin(time * 0.05) * 0.03
    const dist = lerp(22, 78, rise) + pull * 70
    const camY = lerp(1.9, 26, rise) + pull * 22
    camera.position.set(Math.cos(az) * dist, camY, Math.sin(az) * dist)
    treeU.uCam.value.copy(camera.position)
    target.set(0, lerp(1.6, 13, rise), 0)
    camera.lookAt(target)

    bg.copy(SKY_BARE).lerp(SKY_MID, smoothstep(seg(year, 2, 24)))
    bg.lerp(SKY_CLOSED, smoothstep(seg(year, 24, 70)))
    ;(scene.background as THREE.Color).copy(bg)
    fog.color.copy(bg)
    fog.density = lerp(0.0062, 0.0026, smoothstep(seg(year, 0, 40)))
    sun.intensity = lerp(2.0, 1.25, smoothstep(seg(year, 6, 50)))

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

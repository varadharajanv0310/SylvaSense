import * as THREE from 'three'
import { clamp01, easeInOutCubic, lerp, makeNoise2D, mulberry32, seg, smoothstep } from '../lib/math'
import { makeForestMask, MASK_BLOCKS } from '../lib/mask'
import { perfTier } from '../lib/narrative'

/**
 * Concept 05 maps scroll to scale.
 * The camera distance moves exponentially, so one scroll gesture covers the
 * span from a single stem to a Sentinel tile and back down again.
 */

const R = 1750 // radius of the planted disc, world units (1 unit ~ 1 m)

export interface EnumScene {
  update: (p: number, dt: number, t: number) => void
  resize: () => void
  dispose: () => void
  /** metres per raster cell at the current scroll position, for the HUD */
  readState: () => { dist: number; gsd: number; zoom: number }
}

export function createEnumScene(canvas: HTMLCanvasElement): EnumScene {
  const tier = perfTier()
  const TREES = tier === 'low' ? 5000 : tier === 'mid' ? 13000 : 24000

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 1.2 : 1.7))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x060d08)
  const fog = new THREE.Fog(0x060d08, 200, 3000)
  scene.fog = fog

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.2, 24000)

  scene.add(new THREE.HemisphereLight(0xbfe6c8, 0x14200f, 1.25))
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.1)
  sun.position.set(-120, 220, 90)
  scene.add(sun)

  const mask = makeForestMask(256, 21)
  const maskTex = new THREE.CanvasTexture(mask.canvas)
  const noise = makeNoise2D(41)
  const rnd = mulberry32(2024)

  const w2u = (x: number) => clamp01((x + R) / (2 * R))
  const w2v = (z: number) => clamp01((z + R) / (2 * R))

  /* ---------------- ground / raster ---------------- */

  const groundU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uMask: { value: maskTex },
    uCut: { value: 0 },
    uGsd: { value: 0.4 },
    uFalse: { value: 0 },
    uDrain: { value: 0 },
    uTrees: { value: 1 },
    uGrid: { value: 0 },
    uTime: { value: 0 },
  })

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 2.4, R * 2.4, 1, 1),
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
        'uniform sampler2D uMask; uniform float uCut, uGsd, uFalse, uDrain, uTrees, uGrid, uTime;',
        'varying vec2 vUv; varying vec3 vW;',
        '#include <fog_pars_fragment>',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
        'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
        '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }',
        'float fbm(vec2 p){ return vnoise(p)*0.54+vnoise(p*2.2)*0.29+vnoise(p*5.3)*0.17; }',
        'void main(){',
        // quantise world position into raster cells of uGsd metres
        '  vec2 cell = floor(vW.xz / uGsd) * uGsd + uGsd*0.5;',
        '  vec2 quv = clamp(cell / (2.0*1750.0) + 0.5, 0.0, 1.0);',
        '  float m = texture2D(uMask, quv).r;',
        '  float front = smoothstep(uCut + 0.1, uCut - 0.1, 1.0 - quv.y);',
        '  float cut = clamp(m * front, 0.0, 1.0);',
        '  float n = fbm(cell * 0.012);',
        '  vec3 canopy = mix(vec3(0.045,0.12,0.052), vec3(0.10,0.24,0.09), n);',
        '  vec3 bare   = mix(vec3(0.26,0.19,0.115), vec3(0.37,0.27,0.16), n);',
        '  vec3 col = mix(canopy, bare, cut);',
        '  col = mix(col, vec3(dot(col, vec3(0.33))) * 1.1, uDrain*0.5);',
        '  float ndvi = clamp((1.0-cut)*(0.52+n*0.6), 0.0, 1.0);',
        '  vec3 fc = ndvi < 0.35 ? mix(vec3(0.46,0.12,0.07), vec3(0.85,0.60,0.15), ndvi/0.35)',
        '                        : mix(vec3(0.85,0.60,0.15), vec3(0.09,0.55,0.24), (ndvi-0.35)/0.65);',
        '  col = mix(col, fc, uFalse);',
        // tile graticule
        '  vec2 gl = abs(fract(vW.xz/250.0) - 0.5);',
        '  float line = 1.0 - smoothstep(0.0, 0.006, min(gl.x, gl.y));',
        '  col += vec3(0.30,0.72,0.58) * line * uGrid * 0.65;',
        // pixel edges once the raster is coarse enough to see
        '  vec2 pe = abs(fract(vW.xz/uGsd) - 0.5);',
        '  float pl = 1.0 - smoothstep(0.0, 0.03, min(pe.x, pe.y));',
        '  col += vec3(0.18,0.42,0.34) * pl * uFalse * 0.5;',
        '  col *= mix(1.0, 0.6, uTrees);',
        '  gl_FragColor = vec4(col, 1.0);',
        '  #include <fog_fragment>',
        '}',
      ].join('\n'),
    }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  /* ---------------- the population ---------------- */

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.55, 1, 5, 1)
  trunkGeo.translate(0, 0.5, 0)
  const crownGeo = new THREE.IcosahedronGeometry(1, 1)
  {
    const pos = crownGeo.attributes.position as THREE.BufferAttribute
    const r2 = mulberry32(13)
    for (let i = 0; i < pos.count; i++) {
      const f = 0.74 + r2() * 0.46
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.86, pos.getZ(i) * f)
    }
    crownGeo.computeVertexNormals()
  }

  const aCut = new Float32Array(TREES)
  const aSeed = new Float32Array(TREES)
  const treePos: { x: number; z: number; h: number; r: number }[] = []
  for (let i = 0; i < TREES; i++) {
    const a = rnd() * Math.PI * 2
    // leave a glade around the origin so the opening shot is a single stem
    const rad = 30 + Math.sqrt(rnd()) * (R - 30)
    const x = Math.cos(a) * rad
    const z = Math.sin(a) * rad
    const m = mask.sample(w2u(x), w2v(z))
    const order = 1 - w2v(z)
    treePos.push({ x, z, h: 14 + rnd() * 16 + noise(x * 0.004, z * 0.004) * 6, r: 3.2 + rnd() * 3.2 })
    // 2 means "never cleared"; otherwise it goes when the front reaches it
    aCut[i] = m > 0.4 ? 0.06 + order * 0.86 + rnd() * 0.06 : 2
    aSeed[i] = rnd()
  }
  // the hero tree sits at the origin and is never cut
  treePos[0] = { x: 0, z: 0, h: 24.1, r: 5.4 }
  aCut[0] = 2

  function makeInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, crown: boolean) {
    const m = new THREE.InstancedMesh(geo, mat, TREES)
    const d = new THREE.Object3D()
    for (let i = 0; i < TREES; i++) {
      const T = treePos[i]
      if (crown) {
        d.position.set(T.x, T.h * 0.82, T.z)
        d.scale.set(T.r, T.r * 0.86, T.r)
        d.rotation.set(0, aSeed[i] * 6.28, 0)
      } else {
        d.position.set(T.x, 0, T.z)
        d.scale.set(T.r * 0.34, T.h, T.r * 0.34)
        d.rotation.set(0, 0, 0)
      }
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    m.geometry.setAttribute('aCut', new THREE.InstancedBufferAttribute(aCut, 1))
    m.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1))
    m.frustumCulled = false
    return m
  }

  const shared = { uCut: { value: 0 }, uDrain: { value: 0 }, uFade: { value: 1 } }

  function patch(mat: THREE.MeshLambertMaterial, crown: boolean) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCut = shared.uCut
      sh.uniforms.uDrain = shared.uDrain
      sh.uniforms.uFade = shared.uFade
      sh.vertexShader =
        'attribute float aCut;\nattribute float aSeed;\nuniform float uCut;\nvarying float vSeed;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          ['#include <begin_vertex>', 'vSeed = aSeed;', 'float kill = clamp((uCut - aCut) * 7.0, 0.0, 1.0);', 'transformed *= (1.0 - kill);'].join(
            '\n',
          ),
        )
      sh.fragmentShader =
        'uniform float uDrain;\nuniform float uFade;\nvarying float vSeed;\n' +
        sh.fragmentShader.replace(
          '#include <dithering_fragment>',
          [
            '#include <dithering_fragment>',
            crown
              ? 'gl_FragColor.rgb *= mix(0.72, 1.25, vSeed);'
              : 'gl_FragColor.rgb *= mix(0.85, 1.1, vSeed);',
            'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(dot(gl_FragColor.rgb, vec3(0.33)))*0.9, uDrain);',
            'gl_FragColor.a *= uFade;',
          ].join('\n'),
        )
    }
    mat.transparent = true
    return mat
  }

  const trunkMat = patch(new THREE.MeshLambertMaterial({ color: 0x2f2318 }), false)
  const crownMat = patch(new THREE.MeshLambertMaterial({ color: 0x3f8f45, flatShading: true }), true)
  const trunks = makeInstanced(trunkGeo, trunkMat, false)
  const crowns = makeInstanced(crownGeo, crownMat, true)
  scene.add(trunks, crowns)

  /* ---------------- crown polygons for the descent ---------------- */

  const polyPts: number[] = []
  const nearby = treePos.filter((T) => Math.hypot(T.x, T.z) < 130).slice(0, 420)
  nearby.forEach((T, i) => {
    const jr = mulberry32(i * 17 + 1)
    const sides = 8
    for (let s = 0; s < sides; s++) {
      const a0 = (s / sides) * Math.PI * 2
      const a1 = ((s + 1) / sides) * Math.PI * 2
      const r0 = T.r * (0.9 + jr() * 0.5)
      const r1 = T.r * (0.9 + jr() * 0.5)
      polyPts.push(T.x + Math.cos(a0) * r0, T.h * 0.82 + T.r * 0.9, T.z + Math.sin(a0) * r0)
      polyPts.push(T.x + Math.cos(a1) * r1, T.h * 0.82 + T.r * 0.9, T.z + Math.sin(a1) * r1)
    }
  })
  const polyMat = new THREE.LineBasicMaterial({ color: 0x7af0b4, transparent: true, opacity: 0, depthTest: false })
  const polygons = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(polyPts, 3)),
    polyMat,
  )
  polygons.frustumCulled = false
  scene.add(polygons)

  /* ---------------- alert boxes at orbital scale ---------------- */

  const alertMat = new THREE.LineBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0, depthTest: false })
  const alerts = new THREE.Group()
  for (const b of MASK_BLOCKS) {
    const x0 = lerp(-R, R, b[0])
    const x1 = lerp(-R, R, b[0] + b[2])
    const z0 = lerp(R, -R, b[1])
    const z1 = lerp(R, -R, b[1] + b[3])
    const pts = [
      new THREE.Vector3(x0, 6, z0),
      new THREE.Vector3(x1, 6, z0),
      new THREE.Vector3(x1, 6, z1),
      new THREE.Vector3(x0, 6, z1),
      new THREE.Vector3(x0, 6, z0),
    ]
    alerts.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), alertMat))
  }
  scene.add(alerts)

  /* ---------------- the hero tree marker ---------------- */

  const ringGeo = new THREE.RingGeometry(6.4, 6.9, 48)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7af0b4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 22
  scene.add(ring)

  /* ---------------- camera path ---------------- */

  const SKY_FOREST = new THREE.Color(0x0a1a0e)
  const SKY_DRY = new THREE.Color(0x241c12)
  const SKY_ORBIT = new THREE.Color(0x04070d)
  const tmp = new THREE.Color()
  const target = new THREE.Vector3()

  // distance in metres, log-interpolated
  const logLerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t))

  let time = 0
  let state = { dist: 38, gsd: 0.4, zoom: 20 }

  function distanceAt(p: number) {
    if (p < 0.34) return logLerp(38, 900, easeInOutCubic(seg(p, 0.015, 0.34)))
    if (p < 0.62) return logLerp(900, 2400, easeInOutCubic(seg(p, 0.34, 0.62)))
    if (p < 0.74) return logLerp(2400, 6200, easeInOutCubic(seg(p, 0.62, 0.74)))
    if (p < 0.93) return logLerp(6200, 40, easeInOutCubic(seg(p, 0.74, 0.93)))
    return logLerp(40, 32, seg(p, 0.93, 1))
  }

  function update(p: number, dt: number) {
    time += dt

    const dist = distanceAt(p)
    // elevation: near the ground when close, straight down at orbital scale
    const orb = smoothstep(clamp01((Math.log(dist) - Math.log(160)) / (Math.log(3200) - Math.log(160))))
    const elev = lerp(0.16, 1.42, orb)
    const az = 0.6 + p * 1.1 + Math.sin(time * 0.05) * 0.03

    target.set(0, lerp(15, 0, orb), 0)
    camera.position.set(
      target.x + Math.cos(az) * Math.cos(elev) * dist,
      target.y + Math.sin(elev) * dist,
      target.z + Math.sin(az) * Math.cos(elev) * dist,
    )
    camera.lookAt(target)
    camera.near = Math.max(0.2, dist * 0.004)
    camera.far = dist * 14 + 2000
    camera.updateProjectionMatrix()

    // ground sample distance follows the altitude, like a real zoom pyramid
    const gsd = clamp01(0) + Math.max(0.4, Math.min(300, dist / 24))
    const zoom = Math.round(20 - Math.log2(Math.max(1, gsd / 0.4)))
    state = { dist, gsd, zoom }

    /* colour script */
    tmp.copy(SKY_FOREST).lerp(SKY_DRY, smoothstep(seg(p, 0.44, 0.62)))
    tmp.lerp(SKY_ORBIT, smoothstep(seg(p, 0.6, 0.72)))
    tmp.lerp(SKY_FOREST, smoothstep(seg(p, 0.86, 0.97)) * 0.55)
    ;(scene.background as THREE.Color).copy(tmp)
    fog.color.copy(tmp)
    fog.near = dist * 0.55
    fog.far = dist * 5.2

    /* the cut */
    const cut = seg(p, 0.44, 0.62) * 1.02
    shared.uCut.value = cut
    shared.uDrain.value = smoothstep(seg(p, 0.46, 0.66))
    const treeFade = 1 - smoothstep(seg(p, 0.63, 0.7)) * (1 - smoothstep(seg(p, 0.77, 0.845)))
    shared.uFade.value = treeFade
    trunks.visible = crowns.visible = treeFade > 0.02

    groundU.uCut.value = cut
    groundU.uGsd.value = gsd
    groundU.uFalse.value = smoothstep(seg(p, 0.63, 0.72)) * (1 - smoothstep(seg(p, 0.79, 0.855)))
    groundU.uDrain.value = shared.uDrain.value
    groundU.uGrid.value = smoothstep(seg(p, 0.64, 0.72)) * (1 - smoothstep(seg(p, 0.78, 0.84)))
    groundU.uTrees.value = 0
    groundU.uTime.value = time

    polyMat.opacity = smoothstep(seg(p, 0.82, 0.88)) * (1 - smoothstep(seg(p, 0.95, 1)))
    alertMat.opacity = smoothstep(seg(p, 0.66, 0.72)) * (1 - smoothstep(seg(p, 0.78, 0.84))) * (0.6 + 0.4 * Math.sin(time * 4))
    ringMat.opacity = smoothstep(seg(p, 0.93, 0.97))
    ring.rotation.z = time * 0.25

    const close = smoothstep(seg(p, 0.9, 1))
    sun.intensity = 2.1 + close * 1.5
    renderer.toneMappingExposure = 1.0 + close * 0.28

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

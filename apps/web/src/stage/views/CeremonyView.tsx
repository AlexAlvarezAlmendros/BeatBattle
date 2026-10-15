import { coverContext, paintCover } from '@beatbattle/covers'
import { color, medal } from '@beatbattle/shared/tokens'
import { View } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  type Group,
  LinearFilter,
  type Material,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  PerspectiveCamera,
  Shape,
  type SpotLight,
  type Texture,
  TextureLoader,
  Vector3,
} from 'three'
import { setAnimating } from '../activity'
import {
  type CeremonyCover,
  type CeremonyPlace,
  setCeremonyLive,
  setCeremonyProjected,
  useCeremonyStage,
} from '../ceremony'
import { VIEW_PRIORITY } from './VinylView'

/**
 * La ceremonia de resultados en 3D (guía §3.8.6, §3.4.3, §3.5 capa 1; tarea 6.17b): una vista de drei pegada a
 * toda la capa de la ceremonia, con su cámara en perspectiva y fondo negro (las luces fuera). El podio de tres
 * peanas (1.º roja y la más alta en el centro), un foco por puesto (luz y haz), la portada de cada entrada en
 * pie sobre su peana con el sello «AUTORÍA OCULTA» que se arranca en dos trozos, el vinilo-medalla que baja por
 * el haz y gira, y la corona del campeón. La cámara se acerca al puesto que se revela y se aleja con el
 * campeón. Los textos (nombres, puntuaciones) son del DOM: la vista dice dónde cae el pie de cada peana.
 *
 * Los tiempos internos (el sello en 600 ms, la medalla que baja…) son de la línea de tiempo de la ceremonia
 * (§3.6), no tokens.
 */

/** Dónde va cada puesto (unidades de la escena): x, alto de la peana y lado de la portada. */
const LAYOUT = {
  1: { x: 0, height: 1.4, cover: 1.8 },
  2: { x: -3, height: 1.05, cover: 1.6 },
  3: { x: 3, height: 0.75, cover: 1.6 },
} as const
const PEDESTAL = { width: 2.6, depth: 2 }
const MEDAL_RADIUS = 0.55
/** La medalla baja por el haz (ms). */
const DESCEND_MS = 900
/** El foco se enciende (ms). */
const LIGHT_MS = 500
const CROWN_MS = 280

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3

/** Una textura de un lienzo pintado por CPU (§3.4.5), sin *mipmaps*. */
function canvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx) paint(ctx)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  return texture
}

/** La corona de la galleta del disco de oro (unidades del dibujo de 100 × 100, la de `ui/Medal`). */
const MEDAL_CROWN: readonly (readonly [number, number])[] = [
  [37, 56],
  [35, 42],
  [43, 49],
  [50, 38],
  [57, 49],
  [65, 42],
  [63, 56],
]

/** La medalla de vinilo de §3.4.3 (la de `ui/Medal`), pintada en un lienzo de `size`. */
function medalTexture(place: 1 | 2 | 3, size = 256): CanvasTexture {
  return canvasTexture(size, size, (ctx) => {
    const c = size / 2
    const u = size / 100
    const ink = color[medal[place]]
    const circle = (r: number) => {
      ctx.beginPath()
      ctx.arc(c, c, r * u, 0, Math.PI * 2)
    }
    circle(48)
    ctx.fillStyle = color.panel
    ctx.fill()
    ctx.lineWidth = 3 * u
    ctx.strokeStyle = place === 3 ? color.white : ink
    ctx.stroke()
    ctx.lineWidth = u
    ctx.strokeStyle = color.line
    for (let i = 0; i < 9; i++) {
      circle(20 + i * 3.2)
      ctx.stroke()
    }
    circle(19)
    ctx.fillStyle = ink
    ctx.fill()
    if (place === 3) {
      ctx.lineWidth = 2 * u
      ctx.strokeStyle = color.white
      ctx.stroke()
    }
    if (place === 1) {
      ctx.beginPath()
      for (const [i, [x, y]] of MEDAL_CROWN.entries())
        i === 0 ? ctx.moveTo(x * u, y * u) : ctx.lineTo(x * u, y * u)
      ctx.closePath()
      ctx.fillStyle = color.black
      ctx.fill()
    }
    circle(2.4)
    ctx.fillStyle = color.black
    ctx.fill()
  })
}

/** El frente de una peana: su número gigante en display. */
function numberTexture(place: 1 | 2 | 3): CanvasTexture {
  return canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = place === 1 ? color.red : color.panel
    ctx.fillRect(0, 0, 512, 256)
    ctx.font = 'italic 900 200px Anybody'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const text = String(place)
    if (place !== 1) {
      ctx.fillStyle = color.redCta
      ctx.fillText(text, 256 + 12, 138 + 12)
    }
    ctx.fillStyle = place === 1 ? color.black : color.white
    ctx.fillText(text, 256, 138)
  })
}

/** Un trozo del sello «AUTORÍA OCULTA»: texto blanco sobre negro con su borde. */
function sealTexture(text: string): CanvasTexture {
  return canvasTexture(512, 160, (ctx) => {
    ctx.fillStyle = color.black
    ctx.fillRect(0, 0, 512, 160)
    ctx.lineWidth = 14
    ctx.strokeStyle = color.white
    ctx.strokeRect(7, 7, 498, 146)
    ctx.font = 'italic 900 84px Anybody'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color.white
    ctx.fillText(text.toUpperCase(), 256, 84)
  })
}

/** La portada de una entrada como textura: la generativa pintada por CPU o la imagen propia. */
function coverTexture(cover: CeremonyCover, onLoad: () => void): Texture {
  if (cover.kind === 'own') {
    const loader = new TextureLoader()
    loader.setCrossOrigin('anonymous')
    const texture = loader.load(cover.url, onLoad)
    texture.colorSpace = NoColorSpace
    return texture
  }
  const texture = canvasTexture(512, 512, (ctx) => {
    paintCover(coverContext(ctx.canvas), 512, {
      seed: cover.seed,
      bpm: cover.bpm,
      musicalKey: cover.musicalKey,
    })
  })
  onLoad()
  return texture
}

/** El haz del foco: brillante arriba y apagado al llegar a la peana (sin el aro de la base del cono). */
function beamTexture(): CanvasTexture {
  return canvasTexture(4, 256, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, color.white)
    gradient.addColorStop(1, color.black)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 4, 256)
  })
}

/** La corona del campeón (el trazado de la de la página de resultados). */
function crownGeometry(): ExtrudeGeometry {
  const shape = new Shape()
  const points: [number, number][] = [
    [8, 48],
    [4, 12],
    [28, 30],
    [50, 4],
    [72, 30],
    [96, 12],
    [92, 48],
  ]
  // El trazado va en px de 100 × 52, con la y hacia abajo: se escala y se voltea.
  for (const [i, [x, y]] of points.entries()) {
    const px = (x - 50) / 100
    const py = (26 - y) / 100
    i === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py)
  }
  shape.closePath()
  return new ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false })
}

export function CeremonyView() {
  const element = useCeremonyStage((state) => state.element)
  return element ? <AnchoredCeremony element={element} /> : null
}

function AnchoredCeremony({ element }: { element: HTMLElement }) {
  const track = useMemo(() => ({ current: element }), [element])
  return (
    <View track={track} index={VIEW_PRIORITY}>
      <CeremonyScene element={element} />
    </View>
  )
}

function CeremonyScene({ element }: { element: HTMLElement }) {
  const set = useThree((state) => state.set)
  const places = useCeremonyStage((state) => state.places)
  const championAt = useCeremonyStage((state) => state.championAt)
  const camera = useMemo(() => new PerspectiveCamera(30, 1, 0.1, 100), [])
  const focus = useRef({ x: 0, z: 13 })
  const painted = useRef(false)
  const point = useMemo(() => new Vector3(), [])

  useLayoutEffect(() => {
    set({ camera })
  }, [set, camera])

  // Mientras dura, la vista se mueve: el Escenario pinta a 60 fps.
  useEffect(() => {
    setAnimating('ceremony', true, 60)
    return () => {
      setAnimating('ceremony', false)
      setCeremonyLive(false)
    }
  }, [])

  useFrame(() => {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    camera.aspect = rect.width / rect.height
    // En vertical (móvil), más lejos para que quepan las tres peanas a lo ancho (el campo horizontal se
    // estrecha con el aspecto).
    const distance = camera.aspect < 1 ? 13 / camera.aspect ** 1.3 : 13
    // La cámara va hacia el último puesto revelado; con el campeón, al centro.
    const shown = places.filter((item) => item.step !== 'hidden').sort((a, b) => b.at - a.at)[0]
    const targetX = championAt !== null || !shown ? 0 : LAYOUT[shown.place].x * 0.45
    const targetZ = shown && championAt === null ? distance * 0.93 : distance
    focus.current.x += (targetX - focus.current.x) * 0.05
    focus.current.z += (targetZ - focus.current.z) * 0.05
    // Desde arriba, mirando un poco hacia abajo: la parte de arriba queda para el anunciador y la de abajo,
    // para los nombres.
    camera.position.set(focus.current.x, 4.6, focus.current.z)
    // En vertical, más arriba: el podio baja al centro de la pantalla.
    camera.lookAt(focus.current.x * 0.8, camera.aspect < 1 ? 4.2 : 1.75, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    // Dónde cae el pie de cada peana, para los nombres del DOM.
    for (const place of [1, 2, 3] as const) {
      point.set(LAYOUT[place].x, 0, PEDESTAL.depth / 2).project(camera)
      setCeremonyProjected(place, {
        x: rect.left + ((point.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - point.y) / 2) * rect.height,
      })
    }
    if (!painted.current) {
      painted.current = true
      requestAnimationFrame(() => setCeremonyLive(true))
    }
  })

  return (
    <>
      <color attach="background" args={[color.black]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[0, 6, 8]} intensity={0.25} />
      <mesh rotation-x={-Math.PI / 2} position-y={0}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={color.wine3} roughness={1} />
      </mesh>
      {([1, 2, 3] as const).map((place) => (
        <Podium
          key={place}
          place={place}
          entry={places.find((item) => item.place === place) ?? null}
          championAt={place === 1 ? championAt : null}
        />
      ))}
    </>
  )
}

/** Una peana con su foco, su portada, su sello y su medalla. */
function Podium({
  place,
  entry,
  championAt,
}: {
  place: 1 | 2 | 3
  entry: CeremonyPlace | null
  championAt: number | null
}) {
  const invalidate = useThree((state) => state.invalidate)
  const tearMs = useCeremonyStage((state) => state.tearMs)
  const { x, height, cover: coverSize } = LAYOUT[place]
  const light = useRef<SpotLight>(null)
  const beam = useRef<Mesh>(null)
  const coverMesh = useRef<Mesh>(null)
  const sealA = useRef<Mesh>(null)
  const sealB = useRef<Mesh>(null)
  const medalGroup = useRef<Group>(null)
  const crown = useRef<Mesh>(null)
  const target = useMemo(() => new Object3D(), [])

  const assets = useMemo(() => {
    const front = numberTexture(place)
    const beamAlpha = beamTexture()
    const side = new MeshStandardMaterial({
      color: place === 1 ? color.redShade : color.ink3,
      roughness: 0.8,
    })
    const top = new MeshStandardMaterial({
      color: place === 1 ? color.faceRedTint : color.ink4,
      roughness: 0.7,
    })
    const face = new MeshStandardMaterial({ map: front, roughness: 0.9 })
    // Orden de las caras de `BoxGeometry`: +x, −x, +y, −y, +z (frente), −z.
    const pedestal: Material[] = [side, side, top, side, face, side]
    const medalFace = new MeshBasicMaterial({
      map: medalTexture(place),
      transparent: true,
      toneMapped: false,
    })
    const medalEdge = new MeshBasicMaterial({ color: color.ink4 })
    return {
      box: new BoxGeometry(PEDESTAL.width, height, PEDESTAL.depth),
      pedestal,
      cone: new ConeGeometry(1.5, 8, 32, 1, true),
      beamMaterial: new MeshBasicMaterial({
        color: color.white,
        alphaMap: beamAlpha,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
      disc: new CylinderGeometry(MEDAL_RADIUS, MEDAL_RADIUS, 0.07, 64),
      medal: [medalEdge, medalFace, medalFace] as Material[],
      sealA: new MeshBasicMaterial({ map: sealTexture('Autoría'), transparent: true, toneMapped: false }),
      sealB: new MeshBasicMaterial({ map: sealTexture('Oculta'), transparent: true, toneMapped: false }),
      crown: crownGeometry(),
      crownMaterial: new MeshStandardMaterial({ color: color.red, emissive: color.redShade, roughness: 0.4 }),
      textures: [front, beamAlpha],
    }
  }, [place, height])

  // La portada no cambia durante la ceremonia (los pasos copian el puesto con la misma `cover`).
  const cover = entry?.cover ?? null
  const coverMaterial = useMemo(
    () =>
      cover
        ? new MeshBasicMaterial({
            map: coverTexture(cover, () => invalidate()),
            transparent: true,
            opacity: 0,
            toneMapped: false,
          })
        : null,
    [cover, invalidate],
  )

  useEffect(
    () => () => {
      assets.box.dispose()
      assets.cone.dispose()
      assets.disc.dispose()
      assets.crown.dispose()
      for (const material of [
        ...assets.pedestal,
        ...assets.medal,
        assets.beamMaterial,
        assets.sealA,
        assets.sealB,
        assets.crownMaterial,
      ])
        material.dispose()
      for (const texture of assets.textures) texture.dispose()
      coverMaterial?.map?.dispose()
      coverMaterial?.dispose()
    },
    [assets, coverMaterial],
  )

  useEffect(() => {
    if (light.current) light.current.target = target
  }, [target])

  useFrame(() => {
    const now = performance.now()
    const step = entry?.step ?? 'hidden'
    const since = entry ? now - entry.at : 0
    const lit = step === 'hidden' ? 0 : step === 'spot' ? easeOut(since / LIGHT_MS) : 1
    if (light.current) light.current.intensity = lit * 9
    assets.beamMaterial.opacity = lit * 0.22
    if (coverMaterial) coverMaterial.opacity = lit
    // La medalla baja por el haz y gira despacio.
    const descend = step === 'spot' ? easeOut(since / DESCEND_MS) : step === 'hidden' ? 0 : 1
    const rest = height + coverSize + 0.62
    if (medalGroup.current) {
      medalGroup.current.visible = step !== 'hidden'
      medalGroup.current.position.y = rest + (1 - descend) * 6
      medalGroup.current.rotation.z = -(now / 2400) * Math.PI * 2
    }
    // El sello: entero hasta arrancarse; al arrancarse, los dos trozos se despegan y caen.
    const torn = step === 'tear' ? clamp01(since / tearMs) : step === 'name' ? 1 : 0
    for (const [mesh, side] of [
      [sealA.current, -1],
      [sealB.current, 1],
    ] as const) {
      if (!mesh) continue
      mesh.visible = step !== 'hidden' && torn < 1
      mesh.position.set(
        side * (0.42 + torn * 1.2),
        height + coverSize / 2 - torn * torn * 2.2,
        0.32 + torn * 0.8,
      )
      mesh.rotation.z = side * (0.08 + torn * 1.4)
      const material = mesh.material as MeshBasicMaterial
      material.opacity = lit * (1 - torn)
    }
    // La corona, estampada sobre la medalla del 1.º.
    if (crown.current) {
      const shownCrown = championAt !== null
      crown.current.visible = shownCrown
      if (shownCrown) {
        const pop = easeOut((now - championAt) / CROWN_MS)
        crown.current.scale.setScalar(0.4 + pop * 0.8)
      }
    }
  })

  return (
    <group position-x={x}>
      <mesh geometry={assets.box} material={assets.pedestal} position-y={height / 2} />
      <primitive object={target} position={[0, height, 0]} />
      <spotLight
        ref={light}
        position={[0, 9, 3]}
        angle={0.32}
        penumbra={0.6}
        decay={0}
        intensity={0}
        color={color.white}
      />
      <mesh ref={beam} geometry={assets.cone} material={assets.beamMaterial} position-y={height + 4.5} />
      {coverMaterial && (
        <mesh
          ref={coverMesh}
          material={coverMaterial}
          position={[0, height + coverSize / 2 + 0.05, 0.25]}
          rotation-x={-0.06}
        >
          <planeGeometry args={[coverSize, coverSize]} />
        </mesh>
      )}
      <mesh ref={sealA} material={assets.sealA}>
        <planeGeometry args={[0.95, 0.3]} />
      </mesh>
      <mesh ref={sealB} material={assets.sealB}>
        <planeGeometry args={[0.95, 0.3]} />
      </mesh>
      <group ref={medalGroup} position-z={0.4}>
        <mesh geometry={assets.disc} material={assets.medal} rotation-x={Math.PI / 2} />
      </group>
      {place === 1 && (
        <mesh
          ref={crown}
          geometry={assets.crown}
          material={assets.crownMaterial}
          position={[0, height + coverSize + 1.3, 0.4]}
        />
      )}
    </group>
  )
}

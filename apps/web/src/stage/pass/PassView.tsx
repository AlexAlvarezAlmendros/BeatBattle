import { color, length, spring } from '@beatbattle/shared/tokens'
import { View } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  type CanvasTexture,
  CircleGeometry,
  CustomBlending,
  DoubleSide,
  FrontSide,
  type Group,
  type Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcColorFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from 'three'
import {
  CARD_BASE_WIDTH,
  type CardFace,
  cardArtBox,
  cardHeight,
  loadCardAssets,
  loadImage,
  paintCardBack,
  paintCardFace,
} from '../../ui/ProducerCard/cardCanvas'
import { cardBack } from '../../ui/ProducerCard/cardModel'
import { setAnimating } from '../activity'
import { type StagePass, setViewLive } from '../runtime'
import { VIEW_PRIORITY, type ViewStats } from '../views/VinylView'
import {
  cardCut,
  cardToWorld,
  clampTarget,
  hitCard,
  PASS,
  type PassLayout,
  passLayout,
  strandAnchors,
  strandPoints,
  strandRestLength,
  type Vec2,
} from './passModel'
import {
  applyForces,
  buildPass,
  cardState,
  chainPoints,
  type PassBodies,
  type PassInput,
  passAwake,
  removePass,
} from './passPhysics'
import { canvasTexture, foilTexture, metalTexture, ribbonTexture } from './passTextures'

/**
 * La carta de luchador colgada de su pase de torneo (guía §3.4.4, §3.5 capa 1; tarea 7.23): una vista anclada del
 * Escenario (drei `View`, en el lienzo único) sobre la carta plana del perfil, con su física (`@react-three/rapier`).
 * Va en un trozo diferido propio, con Rapier y su WASM: el Escenario lo pide solo cuando una pantalla registra el pase.
 *
 * - **La carta** sale del mismo modelo que la plana (`cardModel`) y del mismo pintor por CPU que la tarjeta para
 *   *stories* (`cardCanvas`), a su ancho y a la densidad del lienzo: el anverso por capas (el retrato, la lámina que se
 *   mueve con la inclinación y lo de encima) y el reverso (`paintCardBack`). Descansa donde está la plana, girada −3°,
 *   y el relevo no se nota.
 * - **El pase**: un remache metálico, la cinta roja con «OTP.» en Λ y la pinza ancha que muerde el canto de arriba.
 * - **Arrastrar**: se agarra la carta (o la pinza) con el puntero y se lleva hasta donde da la cinta; al soltarla, se
 *   balancea y vuelve a colgar a −3°. Con C, media vuelta con el muelle (`spring.interaction`) y un vaivén.
 * - **Bajo demanda**: mientras algo se mueve, el Escenario pinta a 60 fps (`setAnimating`); quieta, se duerme y no
 *   pide fotogramas.
 */
export default function PassView({ pass, stats }: { pass: StagePass; stats: ViewStats | null }) {
  const track = useMemo(() => ({ current: pass.element }), [pass.element])
  return (
    <View track={track} index={VIEW_PRIORITY}>
      <PassScene pass={pass} stats={stats} />
    </View>
  )
}

/** Medidas del DOM: la vista y la carta plana (sin su giro), relativas a la vista. */
function measure(pass: StagePass): PassLayout | null {
  const view = pass.element
  const card = pass.card
  const viewBox = view.getBoundingClientRect()
  if (viewBox.width === 0 || card.offsetWidth === 0) return null
  // `offset*` no cuenta el giro de la carta (`rotate`): es su caja de maqueta. La vista y la carta cuelgan del mismo
  // hueco, así que basta con la diferencia de sus `offsetLeft/Top`.
  return passLayout({
    viewW: viewBox.width,
    viewH: viewBox.height,
    cardLeft: card.offsetLeft - view.offsetLeft,
    cardTop: card.offsetTop - view.offsetTop,
    cardW: card.offsetWidth,
    cardH: card.offsetHeight,
  })
}

/** Las fuentes, la foto (con CORS: va a un lienzo que sube a WebGL) y la pegatina de la carta, ya cargadas. */
function useCardAssets(avatarUrl: string | null): Pick<CardFace, 'photo' | 'slap'> | null {
  const [assets, setAssets] = useState<Pick<CardFace, 'photo' | 'slap'> | null>(null)
  useEffect(() => {
    let active = true
    void loadCardAssets(avatarUrl).then((loaded) => {
      if (active) setAssets(loaded)
    })
    return () => {
      active = false
    }
  }, [avatarUrl])
  return assets
}

/** El QR del reverso: mientras llega, nada (el papel blanco); si no llega, `failed`. */
function useQr(src: string | null): { image: HTMLImageElement | null; failed: boolean } {
  const [state, setState] = useState<{ image: HTMLImageElement | null; failed: boolean }>({
    image: null,
    failed: false,
  })
  useEffect(() => {
    setState({ image: null, failed: false })
    if (!src) return
    let active = true
    void loadImage(src).then((image) => {
      if (active) setState({ image, failed: image === null })
    })
    return () => {
      active = false
    }
  }, [src])
  return state
}

/** Una textura de la carta (sin pintar todavía) a `width` px de ancho. */
const cardTexture = (width: number) => canvasTexture(width, cardHeight(width), () => undefined)

/** Repinta una textura de la carta: la borra entera (las esquinas del chaflán quedan transparentes) y la marca. */
function repaint(texture: CanvasTexture, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = texture.image as HTMLCanvasElement
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  paint(ctx)
  texture.needsUpdate = true
}

function PassScene({ pass, stats }: { pass: StagePass; stats: ViewStats | null }) {
  const set = useThree((state) => state.set)
  const invalidate = useThree((state) => state.invalidate)
  const [camera] = useState(() => new PerspectiveCamera(PASS.fov, 1, 0.01, 100))
  const [layout, setLayout] = useState<PassLayout | null>(() => measure(pass))

  useLayoutEffect(() => {
    set({ camera })
  }, [set, camera])

  // La escena sale del DOM: se vuelve a medir al cambiar de tamaño la vista o la carta.
  useEffect(() => {
    const update = () => {
      const next = measure(pass)
      setLayout((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
      invalidate()
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(pass.element)
    observer.observe(pass.card)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [pass, invalidate])

  // La cámara: el plano z = 0 llena la vista con la escala de la carta plana (1 unidad = `ppu` px).
  useEffect(() => {
    if (!layout) return
    const distance = layout.view.h / 2 / Math.tan((PASS.fov * Math.PI) / 360)
    camera.position.set(0, 0, distance)
    camera.near = distance / 10
    camera.far = distance * 10
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, layout, invalidate])

  // Un fotograma cada vez que la vista se mueve (desplazar la página) aunque la carta esté quieta.
  useEffect(() => {
    const redraw = () => invalidate()
    const options = { passive: true, capture: true } as const
    window.addEventListener('scroll', redraw, options)
    return () => window.removeEventListener('scroll', redraw, options)
  }, [invalidate])

  if (!layout) return null
  // Una cinta de otro largo es otro péndulo: se rehace (pasa al cambiar de tamaño la ventana).
  const key = `${layout.ribbon.toFixed(3)}:${layout.peg.x.toFixed(3)}:${layout.peg.y.toFixed(3)}`
  return (
    <Physics gravity={[0, -PASS.gravity, 0]} timeStep={STEP} colliders={false}>
      <PassRig key={key} pass={pass} layout={layout} stats={stats} />
    </Physics>
  )
}

/** Una tira (la mitad de la Λ): `samples` pares de vértices a lo largo, con u a lo largo y v a lo ancho. */
function stripGeometry(samples: number): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(samples * 2 * 3), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(samples * 2 * 2), 2))
  const index: number[] = []
  for (let i = 0; i < samples - 1; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  geometry.setIndex(index)
  return geometry
}

/**
 * Escribe la tira sobre una polilínea: cada punto, desplazado media anchura a cada lado de su tangente. `reverse` da la
 * vuelta al impreso (u y v): la cinta es una sola doblada en el remache, así que en el tramo izquierdo «OTP.» se lee
 * subiendo y en el derecho, bajando.
 */
function writeStrip(
  geometry: BufferGeometry,
  points: readonly Vec2[],
  width: number,
  z: number,
  reverse: boolean,
) {
  const position = geometry.getAttribute('position') as BufferAttribute
  const uv = geometry.getAttribute('uv') as BufferAttribute
  const lengths: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const p = points[i] as Vec2
    const prev = points[i - 1] as Vec2
    lengths.push((lengths[i - 1] as number) + Math.hypot(p.x - prev.x, p.y - prev.y))
  }
  const total = lengths.at(-1) as number
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as Vec2
    const prev = points[Math.max(0, i - 1)] as Vec2
    const next = points[Math.min(points.length - 1, i + 1)] as Vec2
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const along = lengths[i] as number
    const u = (reverse ? total - along : along) / PASS.ribbon.tile
    position.setXYZ(i * 2, p.x - (nx * width) / 2, p.y - (ny * width) / 2, z)
    position.setXYZ(i * 2 + 1, p.x + (nx * width) / 2, p.y + (ny * width) / 2, z)
    uv.setXY(i * 2, u, reverse ? 1 : 0)
    uv.setXY(i * 2 + 1, u, reverse ? 0 : 1)
  }
  position.needsUpdate = true
  uv.needsUpdate = true
  geometry.computeBoundingSphere()
}

/** Las coordenadas de textura de una forma, a su caja (`ShapeGeometry` las deja en unidades de la forma). */
function fitUv(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const position = geometry.getAttribute('position') as BufferAttribute
  const uv = geometry.getAttribute('uv') as BufferAttribute
  if (!box) return geometry
  const w = box.max.x - box.min.x || 1
  const h = box.max.y - box.min.y || 1
  for (let i = 0; i < position.count; i++)
    uv.setXY(i, (position.getX(i) - box.min.x) / w, (position.getY(i) - box.min.y) / h)
  uv.needsUpdate = true
  return geometry
}

/** Material plano, sin luces ni tono: el color del token tal cual (el lienzo es `flat linear`). */
function flat(options: ConstructorParameters<typeof MeshBasicMaterial>[0] = {}) {
  return new MeshBasicMaterial({
    transparent: true,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    ...options,
  })
}

/** Forma de un rectángulo con el chaflán del marco (arriba a la izquierda y abajo a la derecha), centrado. */
function chamferShape(w: number, h: number, cut: number): Shape {
  const shape = new Shape()
  // En la escena y sube: arriba a la izquierda es (−w/2, h/2).
  shape.moveTo(-w / 2 + cut, h / 2)
  shape.lineTo(w / 2, h / 2)
  shape.lineTo(w / 2, -h / 2 + cut)
  shape.lineTo(w / 2 - cut, -h / 2)
  shape.lineTo(-w / 2, -h / 2)
  shape.lineTo(-w / 2, h / 2 - cut)
  shape.closePath()
  return shape
}

/** El retrato: su chaflán solo va arriba a la izquierda (el de abajo es del marco), centrado. */
function artShape(w: number, h: number, cut: number): Shape {
  const shape = new Shape()
  shape.moveTo(-w / 2 + cut, h / 2)
  shape.lineTo(w / 2, h / 2)
  shape.lineTo(w / 2, -h / 2)
  shape.lineTo(-w / 2, -h / 2)
  shape.lineTo(-w / 2, h / 2 - cut)
  shape.closePath()
  return shape
}

/** Muestras de cada tramo de la cinta y paso fijo de la física (el de `<Physics>`). */
const SAMPLES = 14
const STEP = 1 / 60

function PassRig({ pass, layout, stats }: { pass: StagePass; layout: PassLayout; stats: ViewStats | null }) {
  const { world, rapier } = useRapier()
  const invalidate = useThree((state) => state.invalidate)
  const dpr = useThree((state) => state.viewport.dpr)
  const bodies = useRef<PassBodies | null>(null)
  const input = useRef<PassInput>({ drag: null, kick: 0 })
  const cardGroup = useRef<Group>(null)
  const faceGroup = useRef<Group>(null)
  const shadow = useRef<Mesh>(null)
  const flip = useRef({ angle: pass.side === 'back' ? Math.PI : 0, velocity: 0 })
  const tilt = useRef({ x: 0, y: 0 })
  const live = useRef(false)
  const { ppu } = layout

  // El pase, en reposo y dormido; se quita al irse (o al rehacerse con otro largo de cinta).
  useLayoutEffect(() => {
    const built = buildPass(world, rapier, layout.peg, layout.ribbon)
    bodies.current = built
    invalidate()
    return () => {
      removePass(world, built)
      bodies.current = null
    }
  }, [world, rapier, layout, invalidate])

  // Cada paso: el arrastre, el empujón de C y nada más (la amortiguación es de los cuerpos).
  useBeforePhysicsStep(() => {
    const built = bodies.current
    if (!built) return
    applyForces(built, STEP, input.current)
    input.current.kick = 0
  })

  // ── Texturas: la carta, del mismo modelo y con el mismo pintor por CPU que la plana y la tarjeta para stories ─────
  const assets = useCardAssets(pass.face.avatarUrl)
  const ready = assets !== null
  const [backSeen, setBackSeen] = useState(pass.side === 'back')
  useEffect(() => {
    if (pass.side === 'back') setBackSeen(true)
  }, [pass.side])
  // El QR, como en la plana: se pide la primera vez que se gira la carta.
  const qr = useQr(backSeen ? pass.face.back.qrSrc : null)
  // La textura, al ancho de la plana y a la densidad del lienzo (hasta 2, como la trama).
  const texW = Math.round(ppu * Math.min(2, dpr))

  const faces = useMemo(
    () => ({ art: cardTexture(texW), marks: cardTexture(texW), back: cardTexture(texW) }),
    [texW],
  )
  useEffect(
    () => () => {
      for (const texture of Object.values(faces)) texture.dispose()
    },
    [faces],
  )

  // El anverso por capas: el retrato sin lámina, y encima de la lámina (si la hay) las placas, el nombre y lo demás. Se
  // repinta al cambiar lo que dice (la variante); el reverso, aparte, también cuando llega el QR.
  const frontKey = JSON.stringify(pass.face.front)
  const backKey = `${frontKey}|${pass.face.back.profileUrl}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: `frontKey` resume `pass.face.front`
  useEffect(() => {
    if (!assets) return
    const front: CardFace = { ...pass.face.front, ...assets }
    repaint(faces.art, (ctx) => paintCardFace(ctx, front, texW, 'art'))
    repaint(faces.marks, (ctx) => paintCardFace(ctx, front, texW, 'marks'))
    invalidate()
  }, [assets, frontKey, faces, texW, invalidate])
  // biome-ignore lint/correctness/useExhaustiveDependencies: `backKey` resume el reverso
  useEffect(() => {
    if (!assets) return
    const back = cardBack(pass.face.front, pass.face.back.profileUrl)
    repaint(faces.back, (ctx) =>
      paintCardBack(ctx, { ...back, qr: qr.image, qrFailed: qr.failed, slap: assets.slap }, texW),
    )
    invalidate()
  }, [assets, backKey, qr, faces, texW, invalidate])

  const variant = pass.face.front.variant
  const foiled = variant === 'holo' || variant === 'champion'
  // El retrato en unidades de la carta (la lámina va encima, con su chaflán arriba a la izquierda).
  const art = useMemo(() => {
    const box = cardArtBox(texW)
    const sx = PASS.card.w / texW
    const sy = PASS.card.h / cardHeight(texW)
    const cut = (length.cutLg - length.strokeCursor * 0.586) * (texW / CARD_BASE_WIDTH)
    return { w: box.w * sx, h: box.h * sy, y: PASS.card.h / 2 - (box.y + box.h / 2) * sy, cut: cut * sx }
  }, [texW])
  const foil = useMemo(() => (foiled ? foilTexture(variant, texW) : null), [foiled, variant, texW])
  useEffect(() => () => foil?.dispose(), [foil])

  const ribbon = useMemo(() => (ready ? ribbonTexture(PASS.ribbon.tile / PASS.ribbon.width) : null), [ready])
  const metal = useMemo(() => metalTexture(), [])
  useEffect(
    () => () => {
      ribbon?.dispose()
      metal.dispose()
    },
    [ribbon, metal],
  )

  // ── Geometrías y materiales ───────────────────────────────────────────────────────────────────────────────────
  const parts = useMemo(() => {
    const cut = cardCut()
    const clipH = PASS.clip.rise + PASS.clip.bite
    return {
      card: new PlaneGeometry(PASS.card.w, PASS.card.h),
      shadow: new ShapeGeometry(chamferShape(PASS.card.w, PASS.card.h, cut)),
      foil: fitUv(new ShapeGeometry(artShape(art.w, art.h, art.cut))),
      clip: fitUv(new ShapeGeometry(chamferShape(PASS.clip.half * 2, clipH, PASS.clip.cut))),
      clipY: PASS.card.h / 2 + PASS.clip.rise - clipH / 2,
      slot: new PlaneGeometry(PASS.ribbon.width * 1.15, PASS.clip.rise * 0.28),
      rivet: new CircleGeometry(PASS.clip.rise * 0.18, 20),
      // El remache: cabeza de tornillo hexagonal (la arena es de chaflanes, no de círculos) con su arandela.
      stud: new CircleGeometry(PASS.stud.r, 6, Math.PI / 6),
      studRim: new CircleGeometry(PASS.stud.r * 1.3, 6),
      strands: [stripGeometry(SAMPLES), stripGeometry(SAMPLES)] as const,
    }
  }, [art])
  useEffect(
    () => () => {
      for (const geometry of Object.values(parts).flat())
        if (geometry instanceof BufferGeometry) geometry.dispose()
    },
    [parts],
  )

  const materials = useMemo(() => {
    const screen = {
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcColorFactor,
    } as const
    return {
      art: flat({ map: faces.art, side: FrontSide }),
      marks: flat({ map: faces.marks, side: FrontSide }),
      back: flat({ map: faces.back, side: FrontSide }),
      shadow: flat({ color: color.black, opacity: PASS.shadow.opacity }),
      foil: flat({ map: foil, side: FrontSide, ...screen }),
      ribbon: flat({ map: ribbon, side: DoubleSide }),
      metal: flat({ map: metal, side: DoubleSide }),
      slot: flat({ color: color.black }),
      rim: flat({ color: color.ink4 }),
    }
  }, [faces, foil, ribbon, metal])
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose()
    },
    [materials],
  )

  const restLengths = useMemo(
    () => [strandRestLength(layout.ribbon, -1), strandRestLength(layout.ribbon, 1)] as const,
    [layout.ribbon],
  )

  // ── El puntero: agarrar, arrastrar y soltar ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const element = pass.element
    const toScene = (event: PointerEvent): Vec2 => {
      const box = element.getBoundingClientRect()
      return {
        x: (event.clientX - box.left - box.width / 2) / ppu,
        y: -(event.clientY - box.top - box.height / 2) / ppu,
      }
    }
    const hit = (event: PointerEvent) => {
      const built = bodies.current
      if (!built) return null
      const { center, angle } = cardState(built.card)
      return hitCard(toScene(event), center, angle)
    }
    let pointer: number | null = null
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      const grab = hit(event)
      if (!grab) return
      event.preventDefault()
      pointer = event.pointerId
      element.setPointerCapture(event.pointerId)
      element.style.cursor = 'grabbing'
      input.current.drag = { grab, target: clampTarget(toScene(event), layout) }
      invalidate()
    }
    const move = (event: PointerEvent) => {
      if (pointer === event.pointerId && input.current.drag) {
        input.current.drag.target = clampTarget(toScene(event), layout)
        invalidate()
      } else if (pointer === null) {
        element.style.cursor = hit(event) ? 'grab' : ''
      }
    }
    const up = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return
      pointer = null
      input.current.drag = null
      element.style.cursor = hit(event) ? 'grab' : ''
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
      invalidate()
    }
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    element.addEventListener('lostpointercapture', up)
    return () => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('lostpointercapture', up)
      element.style.cursor = ''
      input.current.drag = null
    }
  }, [pass.element, ppu, layout, invalidate])

  // El giroscopio (las tabletas en apaisado, donde hay dos columnas): la cara se inclina con el aparato, como la plana
  // con el puntero, en pasos de un grado (el ruido del sensor no tiene a la carta pintando sin parar).
  const gyro = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const step = PASS.tilt.max / 6
    const onTilt = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return
      const clampTilt = (value: number) => Math.max(-PASS.tilt.max, Math.min(PASS.tilt.max, value))
      const y = Math.round(clampTilt((event.gamma / 45) * PASS.tilt.max) / step) * step
      const x = Math.round(clampTilt(((event.beta - 45) / 45) * PASS.tilt.max) / step) * step
      if (x === gyro.current.x && y === gyro.current.y) return
      gyro.current = { x, y }
      invalidate()
    }
    window.addEventListener('deviceorientation', onTilt)
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [invalidate])

  // C: media vuelta con el muelle, y un vaivén.
  const side = pass.side
  const firstSide = useRef(side)
  useEffect(() => {
    if (side === firstSide.current) return
    firstSide.current = side
    input.current.kick = side === 'back' ? 2.4 : -2.4
    invalidate()
  }, [side, invalidate])

  useEffect(
    () => () => {
      setAnimating(`pass-${pass.id}`, false)
      setViewLive(pass.id, false)
    },
    [pass.id],
  )

  // ── Cada fotograma: leer la física y colocar las piezas ──────────────────────────────────────────────────────
  useFrame((_, delta) => {
    const built = bodies.current
    const group = cardGroup.current
    const faceGroupNow = faceGroup.current
    if (!built || !group || !faceGroupNow) return
    const dt = Math.min(delta, 1 / 30)
    const { center, angle } = cardState(built.card)
    group.position.set(center.x, center.y, 0)
    group.rotation.z = angle

    // Media vuelta (C) con el muelle de interacción.
    const target = side === 'back' ? Math.PI : 0
    const f = flip.current
    const accel = spring.interaction.stiffness * (target - f.angle) - spring.interaction.damping * f.velocity
    f.velocity += accel * dt
    f.angle += f.velocity * dt
    const flipping = Math.abs(target - f.angle) > 1e-3 || Math.abs(f.velocity) > 1e-3
    if (!flipping) {
      f.angle = target
      f.velocity = 0
    }

    // Inclinación de la cara con la velocidad (solo dibujo), hasta el doble del giro de la carta.
    const v = built.card.linvel()
    const clampTilt = (value: number) => Math.max(-PASS.tilt.max, Math.min(PASS.tilt.max, value))
    const tiltTarget = {
      y: clampTilt(v.x * PASS.tilt.perSpeed + gyro.current.y),
      x: clampTilt(-v.y * PASS.tilt.perSpeed + gyro.current.x),
    }
    tilt.current.y += (tiltTarget.y - tilt.current.y) * Math.min(1, dt * 10)
    tilt.current.x += (tiltTarget.x - tilt.current.x) * Math.min(1, dt * 10)
    const tilting = Math.abs(tiltTarget.y - tilt.current.y) + Math.abs(tiltTarget.x - tilt.current.x) > 1e-4
    faceGroupNow.rotation.set(tilt.current.x, f.angle + tilt.current.y, 0)

    // La lámina sigue la inclinación (como la plana sigue al puntero).
    if (foil) {
      const shift = Math.max(-1, Math.min(1, (angle - PASS.rest) * 2 + tilt.current.y * 4))
      const rest = foil.userData.rest as number
      foil.offset.set(rest * (1 - shift * 0.8), 0)
    }

    // La sombra dura, desplazada en la pantalla (la luz no gira con la carta) y estrecha al girar.
    if (shadow.current) {
      shadow.current.position.set(center.x + PASS.shadow.x / ppu, center.y - PASS.shadow.y / ppu, 0)
      shadow.current.rotation.z = angle
      shadow.current.scale.x = Math.max(0.02, Math.abs(Math.cos(f.angle + tilt.current.y)))
    }

    // La cinta: de la cadena a las ranuras de la pinza, que se acercan al eje cuando la carta gira (la pinza lleva
    // un giratorio: de espaldas, la Λ vuelve a abrirse sin cruzarse).
    const chain = chainPoints(built)
    const squeeze = Math.abs(Math.cos(f.angle + tilt.current.y))
    const anchors = strandAnchors()
    ;([-1, 1] as const).forEach((sideSign, index) => {
      const anchor = anchors[index] as Vec2
      const end = cardToWorld({ x: anchor.x * squeeze, y: anchor.y }, center, angle)
      const points = strandPoints(chain, end, sideSign, restLengths[index] as number, SAMPLES)
      writeStrip(parts.strands[index] as BufferGeometry, points, PASS.ribbon.width, 0, sideSign < 0)
    })

    const awake = passAwake(built) || flipping || tilting || input.current.drag !== null
    setAnimating(`pass-${pass.id}`, awake)

    const box = pass.element.getBoundingClientRect()
    const visible = box.bottom > 0 && box.top < window.innerHeight && box.width > 0
    if (visible && stats) stats.frames[pass.id] = (stats.frames[pass.id] ?? 0) + 1
    if (visible && ready && !live.current) {
      live.current = true
      // Tras pintar este fotograma: la carta plana ya se puede apartar.
      requestAnimationFrame(() => setViewLive(pass.id, true))
    }
  })

  const peg = layout.peg
  // Hasta tener las fuentes y las imágenes, nada: la cinta no sale en blanco ni la carta con la letra de reserva.
  return (
    <group visible={ready}>
      <mesh ref={shadow} geometry={parts.shadow} material={materials.shadow} renderOrder={0} />
      <mesh geometry={parts.strands[0]} material={materials.ribbon} renderOrder={1} />
      <mesh geometry={parts.strands[1]} material={materials.ribbon} renderOrder={1} />
      <group ref={cardGroup}>
        <group ref={faceGroup}>
          <mesh
            geometry={parts.card}
            material={materials.art}
            position={[0, 0, PASS.card.depth / 2]}
            renderOrder={2}
          />
          <mesh
            geometry={parts.card}
            material={materials.back}
            position={[0, 0, -PASS.card.depth / 2]}
            rotation={[0, Math.PI, 0]}
            renderOrder={2}
          />
          {foil && (
            <mesh
              geometry={parts.foil}
              material={materials.foil}
              position={[0, art.y, PASS.card.depth / 2 + 0.001]}
              renderOrder={3}
            />
          )}
          <mesh
            geometry={parts.card}
            material={materials.marks}
            position={[0, 0, PASS.card.depth / 2 + 0.002]}
            renderOrder={3}
          />
          <group position={[0, parts.clipY, 0]}>
            <mesh geometry={parts.clip} material={materials.metal} renderOrder={4} />
            {strandAnchors().map((anchor) => (
              <mesh
                key={anchor.x}
                geometry={parts.slot}
                material={materials.slot}
                position={[anchor.x, anchor.y - parts.clipY, 0.001]}
                renderOrder={5}
              />
            ))}
            <mesh
              geometry={parts.rivet}
              material={materials.rim}
              position={[0, -PASS.clip.bite * 0.1, 0.001]}
              renderOrder={5}
            />
          </group>
        </group>
      </group>
      <mesh
        geometry={parts.studRim}
        material={materials.rim}
        position={[peg.x, peg.y, 0.01]}
        renderOrder={6}
      />
      <mesh
        geometry={parts.stud}
        material={materials.metal}
        position={[peg.x, peg.y, 0.011]}
        renderOrder={7}
      />
    </group>
  )
}

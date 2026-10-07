import { color } from '@beatbattle/shared/tokens'
import { advance, Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type Mesh, PlaneGeometry, RawShaderMaterial } from 'three'
import { neededFps, useStageActivity } from './activity'
import { defaultGrid, SHAPE_INDEX, type StageShapeName, type Vec2 } from './arenaMath'
import { type ParticleStats, Particles } from './particles/Particles'
import { medianFps, PROBE_MS, qualityFromFps, stageDpr, useStageQuality } from './quality'
import { useReactiveDots } from './reactivity'
import { setStageRunning, useStageRuntime } from './runtime'
import styles from './Stage.module.css'
import fragmentShader from './shaders/arenaHalftone.frag.glsl?raw'
import vertexShader from './shaders/fullscreen.vert.glsl?raw'
import { type ViewStats, VinylView } from './views/VinylView'

/**
 * Contadores para las pruebas (solo en desarrollo): fotogramas dibujados y estado de la sonda. Sin DOM: así
 * no despiertan a nadie que observe la arena.
 */
interface StageDebug {
  frames: number
  probing: boolean
  probeFps: number | null
  /** Llamadas de dibujo del último fotograma (§4.17: < 120). */
  drawCalls: number
  /** Algo se mueve: el Escenario pinta sin esperar a que cambie nada. */
  animating: boolean
  /** Fps como mucho mientras algo se mueve (30 la trama, 60 las vistas y las partículas). */
  fps: number
  /** Escala de punto de la trama (reactividad al audio, 1.6) y su historia reciente. */
  dotScale: number
  dotScales: { t: number; scale: number }[]
  particles: ParticleStats
  views: ViewStats
}

declare global {
  interface Window {
    __bbStage?: StageDebug
  }
}

const debug: StageDebug | null = import.meta.env.DEV
  ? {
      frames: 0,
      probing: false,
      probeFps: null,
      drawCalls: 0,
      animating: false,
      fps: 0,
      dotScale: 1,
      dotScales: [],
      particles: { bursts: 0, alive: 0 },
      views: { frames: {} },
    }
  : null
if (debug) window.__bbStage = debug

/** Sondas que la arena pone en el borde de la cuña (`ArenaBackdrop`): la diagonal y un punto de dentro. */
export const EDGE_PROBE = 'data-stage-edge'

export interface StageProps {
  /** La arena (`ArenaBackdrop`): de ella salen el tamaño y la diagonal, que pone el CSS. */
  arena: HTMLElement
  /** Forma de la trama (la misma que la estática). */
  shape: StageShapeName | null
  /** Celda de la rejilla (px CSS; la misma que la estática). */
  cell: number
  /** Primer fotograma pintado: la arena ya puede esconder la trama estática. */
  onLive: () => void
}

/** `#rrggbb` → componentes sRGB en [0, 1], sin gestión de color (el lienzo escribe el token tal cual). */
function srgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

interface ArenaGeometry {
  size: Vec2
  a: Vec2
  b: Vec2
  inside: Vec2
}

/** Lee la diagonal de las sondas: el CSS sigue siendo quien decide la geometría de la cuña. */
function measure(arena: HTMLElement): ArenaGeometry | null {
  const point = (name: string): Vec2 | null => {
    const probe = arena.querySelector(`[${EDGE_PROBE}="${name}"]`)
    if (!probe) return null
    const rect = probe.getBoundingClientRect()
    return { x: rect.left, y: rect.top }
  }
  const a = point('a')
  const b = point('b')
  const inside = point('in')
  const box = arena.getBoundingClientRect()
  if (!a || !b || !inside || box.width === 0 || box.height === 0) return null
  return { size: { x: box.width, y: box.height }, a, b, inside }
}

const sameGeometry = (x: ArenaGeometry | null, y: ArenaGeometry | null) =>
  JSON.stringify(x) === JSON.stringify(y)

function ArenaLayer({ arena, shape, cell, onLive }: StageProps) {
  const invalidate = useThree((state) => state.invalidate)
  const mesh = useRef<Mesh>(null)
  const live = useRef(false)
  const ready = useRef(false)

  const { material, uniforms } = useMemo(() => {
    const grid = defaultGrid(() => 0)
    const uniforms = {
      uSize: { value: [1, 1] },
      uScale: { value: [1, 1] },
      uCell: { value: grid.cell },
      uAngle: { value: (grid.angle * Math.PI) / 180 },
      uMax: { value: grid.max },
      uMin: { value: grid.min },
      uDotScale: { value: 1 },
      uShape: { value: 0 },
      uInk: { value: srgb(color.red) },
      uEdgeA: { value: [0, 0] },
      uEdgeB: { value: [0, 1] },
      uInside: { value: [1, 0] },
    }
    const material = new RawShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms,
    })
    return { material, uniforms }
  }, [])
  const geometry = useMemo(() => new PlaneGeometry(2, 2), [])

  useEffect(
    () => () => {
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )

  useEffect(() => {
    uniforms.uCell.value = cell
    uniforms.uShape.value = shape ? SHAPE_INDEX[shape] : 0
    if (mesh.current) mesh.current.visible = shape !== null
    invalidate()
  }, [uniforms, shape, cell, invalidate])

  // La geometría la pone el CSS: se vuelve a medir al cambiar el tamaño de la ventana, la cuña o las
  // variables que la mueven (`--screen-piece-*` y compañía, en el `style` de `<html>`).
  useEffect(() => {
    let current: ArenaGeometry | null = null
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = measure(arena)
        if (!next || sameGeometry(next, current)) {
          if (next) ready.current = true
          return
        }
        current = next
        uniforms.uSize.value = [next.size.x, next.size.y]
        uniforms.uEdgeA.value = [next.a.x, next.a.y]
        uniforms.uEdgeB.value = [next.b.x, next.b.y]
        uniforms.uInside.value = [next.inside.x, next.inside.y]
        ready.current = true
        invalidate()
      })
    }
    const resize = new ResizeObserver(update)
    resize.observe(arena)
    const mutations = new MutationObserver(update)
    mutations.observe(document.documentElement, { attributes: true })
    mutations.observe(arena, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-wedge', 'class', 'style'],
    })
    update()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
    }
  }, [arena, uniforms, invalidate])

  useFrame((state) => {
    if (debug) debug.frames++
    const { width, height } = state.size
    // Píxeles reales del búfer por px CSS (con el redondeo del tamaño del búfer).
    const canvas = state.gl.domElement
    uniforms.uScale.value = [canvas.width / (width || 1), canvas.height / (height || 1)]
    if (!live.current && ready.current && width > 0 && height > 0) {
      live.current = true
      // Tras pintar este fotograma: el relevo con la trama estática no deja ningún hueco.
      requestAnimationFrame(() => onLive())
    }
  })

  useReactiveDots(uniforms.uDotScale, debug)

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * Sonda de rendimiento y pausa (§3.5 «Sonda», `RNF-PERF-05`; tarea 1.2). Sin calidad todavía, dibuja sin
 * parar durante 2 s de pestaña visible y decide la calidad por la mediana de los fotogramas. Con la pestaña
 * oculta, el bucle se para del todo (`never`) y la sonda espera.
 */
function Loop() {
  const setFrameloop = useThree((state) => state.setFrameloop)
  const invalidate = useThree((state) => state.invalidate)
  const quality = useStageQuality((state) => state.quality)
  const setProbed = useStageQuality((state) => state.setProbed)
  const probing = quality === null
  const deltas = useRef<number[]>([])
  const elapsed = useRef(0)

  // Algo se mueve: el Escenario pinta él mismo con `advance`, a los fps del animador más exigente (la trama
  // que reacciona al audio, 30; un vinilo o una ráfaga, 60), también en pantallas de 120 Hz (§4.7.5: «el
  // fondo a 30 fps, las vistas a 60 cuando hay algo animándose y nada cuando no»). Si no, bajo demanda; la
  // sonda, sin parar; oculta, nada.
  const fps = useStageActivity((state) => neededFps(state.animators))
  const animating = fps > 0
  useEffect(() => {
    if (debug) {
      debug.probing = probing
      debug.animating = animating
      debug.fps = fps
    }
    // Con un margen para el temporizador: a 60 Hz, 30 fps es uno de cada dos fotogramas.
    const minFrameMs = animating ? 1000 / fps - 2 : 0
    let frame = 0
    let last = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < minFrameMs) return
      last = now
      advance(now)
    }
    const apply = () => {
      cancelAnimationFrame(frame)
      if (document.hidden) setFrameloop('never')
      else if (probing) setFrameloop('always')
      else if (animating) {
        setFrameloop('never')
        frame = requestAnimationFrame(tick)
      } else {
        setFrameloop('demand')
        invalidate()
      }
    }
    apply()
    document.addEventListener('visibilitychange', apply)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', apply)
    }
  }, [probing, animating, fps, setFrameloop, invalidate])

  useFrame((_, delta) => {
    if (!probing || document.hidden) return
    // Los primeros fotogramas (compilar el shader, subir texturas) no cuentan.
    elapsed.current += delta * 1000
    if (elapsed.current > 250) deltas.current.push(delta)
    if (elapsed.current >= PROBE_MS + 250) {
      const fps = medianFps(deltas.current)
      if (debug) debug.probeFps = fps
      setProbed(qualityFromFps(fps))
    }
  })

  return null
}

/**
 * Pase principal (§4.7.5): la arena y las partículas, con el lienzo entero limpio. Las vistas de drei
 * pintan después, cada una en su recorte (prioridad 2); con ellas, R3F ya no pinta la escena por su cuenta.
 */
function RenderPass() {
  useFrame(({ gl, scene, camera, size }) => {
    gl.info.reset()
    // drei deja el *viewport* de la última vista (solo restaura el recorte): el pase es del lienzo entero.
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.autoClear = true
    gl.render(scene, camera)
  }, 1)
  // Al final del fotograma: las llamadas de dibujo de todo él (§4.17: < 120).
  useFrame(({ gl }) => {
    if (debug) debug.drawCalls = gl.info.render.calls
  }, 3)
  return null
}

/** Las vistas ancladas que han pedido las pantallas (`useStageView`). */
function StageViews() {
  const anchors = useStageRuntime((state) => state.anchors)
  return anchors.map((anchor) => <VinylView key={anchor.id} anchor={anchor} stats={debug?.views ?? null} />)
}

/**
 * El Escenario (guía §3.5): un único lienzo de React Three Fiber detrás del contenido, a pantalla
 * completa. En la tarea 1.1 pinta la capa 0, la trama de la cuña; la 1.3 le añade las vistas ancladas y
 * las partículas. Dibuja bajo demanda: solo cuando cambia algo de lo que depende.
 */
export function Stage(props: StageProps) {
  const quality = useStageQuality((state) => state.quality)
  useEffect(() => {
    setStageRunning(true)
    return () => setStageRunning(false)
  }, [])
  return (
    <Canvas
      className={styles.stage}
      dpr={stageDpr(quality)}
      frameloop="demand"
      flat
      linear
      eventSource={document.body}
      eventPrefix="client"
      data-stage=""
      gl={{ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' }}
      aria-hidden="true"
      // Las llamadas de dibujo se cuentan por fotograma (pase principal y vistas), no por `render`.
      onCreated={({ gl }) => {
        gl.info.autoReset = false
      }}
    >
      <ArenaLayer {...props} />
      <Particles quality={quality ?? 'alta'} stats={debug?.particles ?? null} />
      <StageViews />
      <RenderPass />
      <Loop />
    </Canvas>
  )
}

export default Stage

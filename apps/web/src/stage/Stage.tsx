import { color } from '@beatbattle/shared/tokens'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type Mesh, PlaneGeometry, RawShaderMaterial } from 'three'
import { defaultGrid, SHAPE_INDEX, type StageShapeName, type Vec2 } from './arenaMath'
import styles from './Stage.module.css'
import fragmentShader from './shaders/arenaHalftone.frag.glsl?raw'
import vertexShader from './shaders/fullscreen.vert.glsl?raw'

/**
 * Píxeles del búfer por px CSS de la capa 0 en calidad alta (§3.5): el dpr del dispositivo, entre 1 y 2.
 * No 0,75 (el valor del Silk del sello): los puntos de la trama tienen borde nítido y a 0,75 se emborronan
 * en una pantalla de densidad 2. Como dibuja bajo demanda, cuesta poco. Los niveles de calidad (1.2) lo
 * bajan.
 */
export const STAGE_DPR: [number, number] = [1, 2]

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

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * El Escenario (guía §3.5): un único lienzo de React Three Fiber detrás del contenido, a pantalla
 * completa. En la tarea 1.1 pinta la capa 0, la trama de la cuña; la 1.3 le añade las vistas ancladas y
 * las partículas. Dibuja bajo demanda: solo cuando cambia algo de lo que depende.
 */
export function Stage(props: StageProps) {
  return (
    <Canvas
      className={styles.stage}
      dpr={STAGE_DPR}
      frameloop="demand"
      flat
      linear
      eventSource={document.body}
      eventPrefix="client"
      data-stage=""
      gl={{ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' }}
      aria-hidden="true"
    >
      <ArenaLayer {...props} />
    </Canvas>
  )
}

export default Stage

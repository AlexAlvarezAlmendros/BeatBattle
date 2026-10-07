import { loopVinylMs } from '@beatbattle/shared/tokens'
import { View } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, LinearFilter, type Mesh, NoColorSpace, OrthographicCamera } from 'three'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { useLoops } from '../../ui/loops'
import { paintVinyl } from '../../ui/VinylSun/paintVinyl'
import { setAnimating } from '../activity'
import { type StageAnchor, setViewLive } from '../runtime'

/** Las vistas se pintan después de la arena y las partículas (el pase principal va con prioridad 1). */
export const VIEW_PRIORITY = 2

/** Contadores para las pruebas (solo en desarrollo). */
export interface ViewStats {
  /** Fotogramas pintados por cada vista, por su id. */
  frames: Record<number, number>
}

/**
 * Vista anclada del vinilo-sol (guía §3.5 capa 1, tarea 1.3): drei `View` dentro del lienzo único,
 * recortada a la caja de su elemento del DOM. Pinta el mismo disco que `VinylSun` (el mismo pintor, al
 * mismo tamaño y densidad), así que el relevo con el lienzo 2D no se nota, y gira una vuelta por compás
 * en fase con el reloj del documento. Solo pinta si su elemento se ve; con «reducir movimiento» o con la
 * pausa de la barra, quieto.
 */
export function VinylView({ anchor, stats }: { anchor: StageAnchor; stats: ViewStats | null }) {
  const track = useMemo(() => ({ current: anchor.element }), [anchor.element])
  return (
    <View track={track} index={VIEW_PRIORITY}>
      <VinylScene anchor={anchor} stats={stats} />
    </View>
  )
}

function VinylScene({ anchor, stats }: { anchor: StageAnchor; stats: ViewStats | null }) {
  const { label, sub, bpm } = anchor.props
  const set = useThree((state) => state.set)
  const invalidate = useThree((state) => state.invalidate)
  const reduced = useReducedMotion()
  const paused = useLoops((state) => state.paused)
  const mesh = useRef<Mesh>(null)
  const [size, setSize] = useState(() => anchor.element.getBoundingClientRect().width)
  const [shown, setShown] = useState(false)
  const live = useRef(false)
  // Lo que lleva parado el giro por la pausa de la barra (ms): al reanudar, sigue desde donde se quedó.
  const held = useRef({ total: 0, since: 0 })

  // Cámara de la vista: ortográfica en px CSS (drei la ajusta a la caja del elemento).
  useLayoutEffect(() => {
    const camera = new OrthographicCamera()
    camera.position.z = 10
    set({ camera })
  }, [set])

  const dpr = useThree((state) => state.viewport.dpr)
  const [texture, setTexture] = useState<CanvasTexture | null>(null)

  // El disco, pintado como el del DOM: mismo tamaño en px CSS y misma densidad (la del lienzo). Una
  // textura nueva por tamaño: three reserva la memoria de la textura con su primer tamaño
  // (`texStorage2D`), y subirle después un lienzo de otro tamaño la deja vacía.
  useEffect(() => {
    if (size <= 0) return
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const next = new CanvasTexture(canvas)
    next.colorSpace = NoColorSpace
    // Un texel por píxel (mismo tamaño y densidad que el lienzo): sin *mipmaps*, que solo emborronan.
    next.generateMipmaps = false
    next.minFilter = LinearFilter
    const paint = () => {
      // Por CPU (como las portadas, §3.4.5): con la GPU, un lienzo 2D que no cuelga del DOM puede llegar
      // vacío a la textura (pasaba con la iGPU AMD por Vulkan: el vinilo no salía).
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintVinyl(ctx, size, label, sub)
      next.needsUpdate = true
      invalidate()
    }
    paint()
    setTexture(next)
    let cancelled = false
    // Las fuentes de la galleta pueden llegar después: mismo tamaño, se repinta en la misma textura.
    void document.fonts?.ready.then(() => {
      if (!cancelled) paint()
    })
    return () => {
      cancelled = true
      next.dispose()
    }
  }, [dpr, size, label, sub, invalidate])

  // Bajo demanda (sin giro): un fotograma al llegar la textura y cada vez que el elemento se mueve o
  // cambia de tamaño (desplazar la página, redimensionar la ventana).
  // biome-ignore lint/correctness/useExhaustiveDependencies: un fotograma también cuando cambia la textura
  useEffect(() => {
    const redraw = () => invalidate()
    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(anchor.element)
    const options = { passive: true, capture: true } as const
    window.addEventListener('scroll', redraw, options)
    window.addEventListener('resize', redraw)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', redraw, options)
      window.removeEventListener('resize', redraw)
    }
  }, [anchor.element, invalidate, texture])

  useEffect(() => {
    if (paused) held.current.since = performance.now()
    else if (held.current.since) {
      held.current.total += performance.now() - held.current.since
      held.current.since = 0
    }
  }, [paused])

  const spinning = shown && !reduced && !paused
  useEffect(() => {
    const key = `vinyl-${anchor.id}`
    setAnimating(key, spinning)
    return () => setAnimating(key, false)
  }, [anchor.id, spinning])

  useEffect(() => () => setViewLive(anchor.id, false), [anchor.id])

  useFrame(() => {
    const rect = anchor.element.getBoundingClientRect()
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    if (visible !== shown) setShown(visible)
    if (Math.abs(rect.width - size) > 0.5) setSize(rect.width)
    if (!mesh.current) return
    mesh.current.scale.set(rect.width, rect.height, 1)
    if (!reduced) {
      const now = held.current.since || performance.now()
      const phase = ((now - held.current.total) % loopVinylMs(bpm)) / loopVinylMs(bpm)
      // Como `rotate` en CSS: en el sentido de las agujas del reloj.
      mesh.current.rotation.z = -phase * Math.PI * 2
    }
    if (visible && stats) stats.frames[anchor.id] = (stats.frames[anchor.id] ?? 0) + 1
    if (visible && !live.current && texture) {
      live.current = true
      // Tras pintar este fotograma: el lienzo 2D ya se puede apartar.
      requestAnimationFrame(() => setViewLive(anchor.id, true))
    }
  })

  return (
    <mesh ref={mesh} visible={texture !== null}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

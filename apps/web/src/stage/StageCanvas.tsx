import {
  events as createPointerEvents,
  createRoot,
  extend,
  type ReconcilerRoot,
  type RenderProps,
  type RootState,
} from '@react-three/fiber'
import {
  Component,
  type ReactNode,
  Suspense,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { STAGE_CATALOGUE } from './catalogue'

extend(STAGE_CATALOGUE)

/** Lo que el lienzo deja configurar (lo de `Canvas` que usa el Escenario). */
export type StageCanvasConfig = Pick<
  RenderProps<HTMLCanvasElement>,
  'dpr' | 'frameloop' | 'flat' | 'linear' | 'gl' | 'onCreated'
>

export interface StageCanvasProps extends StageCanvasConfig {
  children: ReactNode
  className?: string
}

interface Box {
  width: number
  height: number
  top: number
  left: number
}

/** Un error del árbol de three sube al de la página (como en el `Canvas` de R3F): lo lanza el componente de fuera. */
class Relay extends Component<
  { onError: (error: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(error: unknown) {
    this.props.onError(error)
  }
  override render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * El lienzo único del Escenario (guía §3.5, §4.7.5; tarea 7.34): lo que hace el `Canvas` de React Three Fiber, con
 * `createRoot` y el catálogo de `STAGE_CATALOGUE` en vez del espacio de nombres entero de three (§4.17: así three se
 * queda en lo que se usa y el trozo baja de 253,5 a 208,2 kB gz).
 *
 * - Un `<canvas>` a todo lo que mide su caja (la arena, fija a la ventana); la caja se mide con `ResizeObserver`.
 * - Los eventos de puntero, del `body` con las coordenadas de la ventana (`eventSource` y `eventPrefix: 'client'` del
 *   Escenario): las vistas ancladas los reciben aunque el lienzo no coja el puntero.
 * - Lo de dentro no ve los contextos de React de fuera (el Escenario solo lee almacenes de Zustand, que no los
 *   necesitan); un error de dentro se lanza fuera, y la raíz se libera al desmontarse de verdad (con el efecto de
 *   inserción, que el modo estricto no repite, como R3F).
 */
export function StageCanvas({ children, className, ...config }: StageCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const root = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [error, setError] = useState<unknown>(null)
  if (error) throw error

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setBox((current) =>
        current &&
        current.width === rect.width &&
        current.height === rect.height &&
        current.top === rect.top &&
        current.left === rect.left
          ? current
          : { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useInsertionEffect(
    () => () => {
      root.current?.unmount()
      root.current = null
    },
    [],
  )

  // Como el `Canvas` de R3F: cada render configura la raíz y le pasa los hijos.
  useLayoutEffect(() => {
    const element = canvas.current
    if (!element || !box || box.width === 0 || box.height === 0) return
    root.current ??= createRoot(element)
    const { onCreated, ...rest } = config
    root.current
      .configure({
        ...rest,
        size: box,
        events: createPointerEvents,
        onCreated: (state: RootState) => {
          state.events.connect?.(document.body)
          state.setEvents({
            compute: (event, current) => {
              current.pointer.set(
                (event.clientX / current.size.width) * 2 - 1,
                -(event.clientY / current.size.height) * 2 + 1,
              )
              current.raycaster.setFromCamera(current.pointer, current.camera)
            },
          })
          onCreated?.(state)
        },
      })
      .catch(setError)
    if (root.current.ready.status === 'fulfilled')
      root.current.render(
        <Relay onError={setError}>
          <Suspense fallback={null}>{children}</Suspense>
        </Relay>,
      )
  })

  return (
    <div ref={host} className={className} data-stage="" aria-hidden="true">
      <canvas ref={canvas} style={{ display: 'block' }} />
    </div>
  )
}

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Huecos del marco de juego (tarea 0.23): sitios del HUD, de la barra de controles y de la arena que
 * una pantalla rellena con lo suyo (el reloj de ronda en el centro del HUD, el jugador, el número de
 * semana en la cuña, la crónica en la barra). El marco pinta el destino y lo que trae por defecto; la
 * pantalla pinta `<FrameSlot name="…">`, que lleva su contenido allí con un portal y le quita el sitio
 * al de por defecto.
 *
 * El destino se registra con un `ref` y la reclamación va en un efecto de diseño: las dos cosas
 * ocurren en el mismo *commit*, antes de pintar, así que no hay un fotograma con el contenido de
 * por defecto (ni hueco vacío).
 */

export type FrameSlotName = 'hudPlayer' | 'hudCenter' | 'hudRight' | 'controlsRight' | 'arena'

type Targets = Partial<Record<FrameSlotName, HTMLElement>>
type Claims = Partial<Record<FrameSlotName, number>>

interface SlotsApi {
  register: (name: FrameSlotName, element: HTMLElement | null) => void
  claim: (name: FrameSlotName) => () => void
}

/** Funciones estables (no cambian nunca): así el `ref` del destino no se rehace en cada render. */
const SlotsApiContext = createContext<SlotsApi | null>(null)
/** Destinos registrados y cuántas pantallas reclaman cada hueco. */
const SlotsStateContext = createContext<{ targets: Targets; claims: Claims }>({ targets: {}, claims: {} })

export function FrameSlotsProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<Targets>({})
  const [claims, setClaims] = useState<Claims>({})

  const api = useMemo<SlotsApi>(
    () => ({
      register: (name, element) =>
        setTargets((current) => {
          if (element ? current[name] === element : !current[name]) return current
          const next = { ...current }
          if (element) next[name] = element
          else delete next[name]
          return next
        }),
      claim: (name) => {
        setClaims((current) => ({ ...current, [name]: (current[name] ?? 0) + 1 }))
        return () => setClaims((current) => ({ ...current, [name]: Math.max(0, (current[name] ?? 0) - 1) }))
      },
    }),
    [],
  )
  const state = useMemo(() => ({ targets, claims }), [targets, claims])

  return (
    <SlotsApiContext.Provider value={api}>
      <SlotsStateContext.Provider value={state}>{children}</SlotsStateContext.Provider>
    </SlotsApiContext.Provider>
  )
}

/**
 * Destino de un hueco (lo pinta el marco). `fallback` se ve mientras ninguna pantalla lo reclama.
 */
export function FrameSlotTarget({
  name,
  fallback,
  className,
}: {
  name: FrameSlotName
  fallback?: ReactNode
  className?: string
}) {
  const api = useContext(SlotsApiContext)
  const { claims } = useContext(SlotsStateContext)
  const ref = useCallback((element: HTMLElement | null) => api?.register(name, element), [api, name])
  const claimed = (claims[name] ?? 0) > 0
  return (
    <div ref={ref} className={className} data-frame-slot={name} data-claimed={claimed || undefined}>
      {!claimed && fallback}
    </div>
  )
}

/** Contenido de una pantalla para un hueco del marco. Fuera del marco (tests de una pieza), no pinta nada. */
export function FrameSlot({ name, children }: { name: FrameSlotName; children: ReactNode }) {
  const api = useContext(SlotsApiContext)
  const { targets } = useContext(SlotsStateContext)
  useLayoutEffect(() => api?.claim(name), [api, name])
  const target = targets[name]
  return target ? createPortal(children, target) : null
}

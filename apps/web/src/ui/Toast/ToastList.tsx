import { duration, ease, reducedDuration, spring } from '@beatbattle/shared/tokens'
import { AnimatePresence, domAnimation, type FeatureBundle, LazyMotion, m, useIsPresent } from 'motion/react'
import { type FocusEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { Toast } from './Toast'
import styles from './Toast.module.css'
import type { ToastData } from './useToasts'

/** Distancia desde la que entra un aviso por la derecha, en px. */
const ENTER_OFFSET_PX = 48

export interface ToastListProps {
  /** Avisos de una de las dos regiones vivas (la lista va dentro de su `<ol>`). */
  toasts: readonly ToastData[]
  onDismiss: (id: string) => void
  /** Un aviso empieza a irse con el foco dentro: `ToastViewport` decide adónde va el foco. */
  onFocusLost: (item: HTMLElement) => void
}

let motionFeatures: FeatureBundle | undefined

/**
 * Funciones de Motion de los avisos (animaciones, gestos y `layout`, que recoloca los que quedan al
 * irse uno), en un trozo aparte que pide `LazyMotion` al montarse la lista. Si no llega, las de
 * `domAnimation`, que ya van en el trozo inicial (el menú móvil): entran y salen igual, sin recolocarse
 * con animación.
 */
export function loadToastMotion(): Promise<FeatureBundle> {
  return import('./toastMotion').then(
    (module) => {
      motionFeatures = module.default
      return module.default
    },
    () => domAnimation,
  )
}

/**
 * La parte animada de la zona de avisos (§3.3), que `ToastViewport` carga en diferido: los `<li>` de
 * una región viva, con su entrada desde la derecha y su salida (`AnimatePresence`), la pieza visible
 * (`Toast`) y el cierre automático.
 */
export function ToastList({ toasts, onDismiss, onFocusLost }: ToastListProps) {
  return (
    <LazyMotion features={motionFeatures ?? loadToastMotion}>
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => onDismiss(toast.id)}
            onFocusLost={onFocusLost}
          />
        ))}
      </AnimatePresence>
    </LazyMotion>
  )
}

/**
 * Un aviso en la zona: entra desde la derecha con el muelle de interacción (sin movimiento, fundido)
 * y se cierra solo a los `duration` ms, con la cuenta en pausa mientras el ratón está encima o el
 * foco dentro (WCAG 2.2.1).
 */
function ToastItem({
  toast,
  onDismiss,
  onFocusLost,
}: {
  toast: ToastData
  onDismiss: () => void
  onFocusLost: (item: HTMLElement) => void
}) {
  const reduced = useReducedMotion()
  const itemRef = useRef<HTMLLIElement>(null)
  const isPresent = useIsPresent()
  const focusLostRef = useRef(onFocusLost)
  focusLostRef.current = onFocusLost

  // Al empezar a salir (cerrado o expulsado por el tope), si tenía el foco, lo pasa. En la fase de
  // diseño: el aviso sigue en el DOM durante la salida y el foco no llega a caer en `<body>`.
  useLayoutEffect(() => {
    const item = itemRef.current
    if (!isPresent && item?.contains(document.activeElement)) focusLostRef.current(item)
  }, [isPresent])
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  const remaining = useRef(toast.duration ?? 0)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (toast.duration === null || paused) return
    const startedAt = Date.now()
    const timer = setTimeout(() => dismissRef.current(), Math.max(0, remaining.current))
    return () => {
      clearTimeout(timer)
      remaining.current -= Date.now() - startedAt
    }
  }, [paused, toast.duration])

  const fade = {
    duration: (reduced ? reducedDuration.fast : duration.fast) / 1000,
    ease: [...ease.out] as [number, number, number, number],
  }
  const offset = reduced ? 0 : ENTER_OFFSET_PX

  return (
    <m.li
      ref={itemRef}
      className={styles.item}
      layout={!reduced}
      initial={{ opacity: 0, x: offset }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: offset }}
      transition={{ ...fade, x: reduced ? fade : { type: 'spring', ...spring.interaction } }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event: FocusEvent<HTMLLIElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
      data-paused={paused || undefined}
      data-toast-item=""
      data-exiting={isPresent ? undefined : ''}
    >
      <Toast toast={toast} onDismiss={onDismiss} />
    </m.li>
  )
}

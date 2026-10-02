import { duration, ease, reducedDuration, spring } from '@beatbattle/shared/tokens'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { type FocusEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { t } from '../../i18n'
import { Toast } from './Toast'
import styles from './Toast.module.css'
import { type ToastData, useToasts } from './useToasts'

/** Distancia desde la que entra un aviso por la derecha, en px. */
const ENTER_OFFSET_PX = 48

/**
 * Zona de avisos (§3.3): esquina inferior derecha (arriba en móvil), en un portal. Hay dos regiones
 * vivas que existen desde el principio, para que los lectores de pantalla anuncien lo que entra:
 * `polite` para información y éxito, y `assertive` para errores (RNF-A11Y-07).
 *
 * Foco (RNF-A11Y-01, WCAG 2.4.3): si se va un aviso que tiene el foco (cerrado con el teclado o
 * expulsado por el tope de avisos), el foco pasa al botón de cerrar del siguiente o del anterior y,
 * si no queda ninguno, vuelve al elemento que lo tenía antes de entrar en la zona de avisos.
 *
 * Se monta una vez en el marco de la app (la galería la monta por su cuenta mientras tanto).
 */
export function ToastViewport() {
  const toasts = useToasts((state) => state.toasts)
  const dismiss = useToasts((state) => state.dismiss)
  const viewportRef = useRef<HTMLElement>(null)
  // Dónde estaba el foco antes de entrar en la zona de avisos (para devolverlo al irse el último).
  const returnFocus = useRef<HTMLElement | null>(null)
  if (typeof document === 'undefined') return null

  const polite = toasts.filter((toast) => toast.tone !== 'error')
  const assertive = toasts.filter((toast) => toast.tone === 'error')

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const from = event.relatedTarget
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) returnFocus.current = from
  }

  /** `leaving` se va con el foco dentro: al siguiente aviso, al anterior o a donde estaba. */
  const handOffFocus = (leaving: HTMLElement) => {
    const items = [...(viewportRef.current?.querySelectorAll<HTMLElement>('[data-toast-item]') ?? [])]
    const index = items.indexOf(leaving)
    const staying = (item: HTMLElement) => item !== leaving && !item.hasAttribute('data-exiting')
    const neighbour = items.slice(index + 1).find(staying) ?? items.slice(0, index).reverse().find(staying)
    const target = neighbour?.querySelector<HTMLElement>('button') ?? returnFocus.current
    if (target?.isConnected) target.focus({ preventScroll: true })
  }

  return createPortal(
    <section
      ref={viewportRef}
      className={styles.viewport}
      aria-label={t('ui.toast.region')}
      onFocus={onFocus}
    >
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ol role="list" className={styles.stack} aria-live="polite" aria-relevant="additions text">
        <AnimatePresence initial={false}>
          {polite.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onDismiss={() => dismiss(toast.id)}
              onFocusLost={handOffFocus}
            />
          ))}
        </AnimatePresence>
      </ol>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ol role="list" className={styles.stack} aria-live="assertive" aria-relevant="additions text">
        <AnimatePresence initial={false}>
          {assertive.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onDismiss={() => dismiss(toast.id)}
              onFocusLost={handOffFocus}
            />
          ))}
        </AnimatePresence>
      </ol>
    </section>,
    document.body,
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
  /** El aviso empieza a irse con el foco dentro. */
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
    <motion.li
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
    </motion.li>
  )
}

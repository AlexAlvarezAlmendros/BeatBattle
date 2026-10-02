import { duration, ease, reducedDuration } from '@beatbattle/shared/tokens'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import {
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { t } from '../../i18n'
import { Button } from '../Button'
import { cx } from '../forceState'
import { isTopModalLayer, lockScroll, pushModalLayer, trapTab } from './focus'
import styles from './Modal.module.css'

export type ModalSurfaceKind = 'glass' | 'solid'

/** Escala de entrada del modal (§3.3: «entra con escala 0,96 → 1»). */
export const MODAL_ENTER_SCALE = 0.96

export interface ModalSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** Ids para `aria-labelledby` y `aria-describedby` (los pone `Modal`). */
  titleId?: string
  descriptionId?: string
  /** Botón de cerrar arriba a la derecha (con su `aria-label`). */
  onClose?: () => void
  footer?: ReactNode
  /** `glass` (por defecto) o `solid` para calidad baja. */
  surface?: ModalSurfaceKind
  titleAs?: 'h2' | 'h3' | 'h4'
  children?: ReactNode
  ref?: RefObject<HTMLDivElement | null>
}

/**
 * La pieza visible del modal, sin comportamiento: cristal (`--bb-glass-card` + desenfoque, borde
 * `--bb-line-strong`, radio `md`), título, descripción, cuerpo y pie. `Modal` la usa dentro del
 * diálogo; la galería la enseña quieta.
 */
export function ModalSurface({
  title,
  description,
  titleId,
  descriptionId,
  onClose,
  footer,
  surface = 'glass',
  titleAs: TitleTag = 'h2',
  className,
  children,
  ...rest
}: ModalSurfaceProps) {
  return (
    <div
      {...rest}
      className={cx(styles.surface, surface === 'glass' ? styles.glass : styles.solid, className)}
      data-surface={surface}
    >
      <header className={styles.header}>
        <TitleTag id={titleId} className={styles.title}>
          {title}
        </TitleTag>
        {onClose && (
          <Button
            variant="icon"
            size="sm"
            icon="close"
            aria-label={t('ui.modal.close')}
            onClick={onClose}
            className={styles.close}
          />
        )}
      </header>
      {description && (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      )}
      {children && <div className={styles.body}>{children}</div>}
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  )
}

export interface ModalProps {
  open: boolean
  /** Se llama con Esc, con el botón de cerrar y al pulsar fuera (si `dismissible`). */
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children?: ReactNode
  surface?: ModalSurfaceKind
  /** Cerrar al pulsar el fondo (por defecto, sí). Esc y el botón de cerrar funcionan siempre. */
  dismissible?: boolean
  /** Elemento que recibe el foco al abrir; por defecto, el propio diálogo (se lee el título). */
  initialFocus?: RefObject<HTMLElement | null>
}

/**
 * Modal (§3.3): cristal sobre `--bb-scrim` con desenfoque, en un portal.
 *
 * - `role="dialog"` + `aria-modal` + `aria-labelledby` (y `aria-describedby` con descripción).
 * - Trampa de foco, Esc para cerrar, el foco vuelve a donde estaba al cerrar y la página no hace
 *   scroll mientras está abierto (el bloqueo se quita en cuanto empieza a cerrarse).
 * - Se pueden apilar (un modal abierto desde otro): solo el de arriba atiende Tab, Esc y el foco.
 * - Entra con escala 0,96 → 1 y fundido del fondo; con «reducir movimiento», solo fundido (Anexo E).
 * - El sonido (`ui.open`) lo cablea la Fase 1.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  surface = 'glass',
  dismissible = true,
  initialFocus,
}: ModalProps) {
  // Dónde estaba el foco antes de abrir (lo anota la capa justo antes de mover el foco al diálogo).
  const returnFocus = useRef<HTMLElement | null>(null)

  // Al cerrar, el foco vuelve en el acto, sin esperar a la animación de salida. Tiene que ser en la
  // fase de diseño: en la limpieza de un efecto (fase de mutación), React devolvería el foco al
  // diálogo, que sigue en el DOM mientras sale, al restaurar la selección tras el commit.
  useLayoutEffect(() => {
    if (open) return
    const target = returnFocus.current
    returnFocus.current = null
    if (target?.isConnected) target.focus({ preventScroll: true })
  }, [open])

  // Si el modal entero desaparece abierto (p. ej. al cambiar de ruta), el foco también vuelve.
  useLayoutEffect(
    () => () => {
      const target = returnFocus.current
      if (target?.isConnected) target.focus({ preventScroll: true })
    },
    [],
  )

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <ModalLayer
          key="modal"
          returnFocus={returnFocus}
          onClose={onClose}
          title={title}
          description={description}
          footer={footer}
          surface={surface}
          dismissible={dismissible}
          initialFocus={initialFocus}
        >
          {children}
        </ModalLayer>
      )}
    </AnimatePresence>,
    document.body,
  )
}

type ModalLayerProps = Omit<ModalProps, 'open'> & { returnFocus: RefObject<HTMLElement | null> }

function ModalLayer({
  returnFocus,
  onClose,
  title,
  description,
  footer,
  children,
  surface,
  dismissible,
  initialFocus,
}: ModalLayerProps) {
  const reduced = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  // Identidad de esta capa en la pila de modales (solo la de arriba atiende el teclado y el foco).
  const [layer] = useState(() => ({}))
  // Mientras sale (animación de cierre), el foco ya ha vuelto fuera y no hay que retenerlo.
  const isPresent = useIsPresent()

  // Bloqueo del scroll, capa en la pila y foco inicial (anotando antes dónde estaba, para `Modal`).
  // En un efecto de diseño y no pasivo: la limpieza corre en el mismo commit en el que el modal
  // empieza a salir o desaparece, nunca después, así que en cuanto se cierra la página vuelve a hacer
  // scroll y la capa de abajo manda.
  useLayoutEffect(() => {
    if (!isPresent) return
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement
    const releaseScroll = lockScroll()
    const releaseLayer = pushModalLayer(layer)
    const target = initialFocus?.current ?? dialogRef.current
    target?.focus({ preventScroll: true })
    return () => {
      releaseLayer()
      releaseScroll()
    }
  }, [isPresent, initialFocus, layer, returnFocus])

  // Si el foco se escapa (un clic fuera de la ventana y vuelta), regresa al diálogo de arriba. No
  // cuenta el foco que cae en un modal que está saliendo (React lo devuelve allí un instante al
  // cerrarse, antes de que vuelva a su sitio).
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const dialog = dialogRef.current
      if (!dialog || !isTopModalLayer(layer)) return
      if (!(event.target instanceof Element) || dialog.contains(event.target)) return
      if (event.target.closest('[data-modal-exiting]')) return
      dialog.focus()
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [layer])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Con modales apilados (un modal abierto desde otro), el evento de React sube por el árbol de
    // componentes hasta el de abajo: solo responde la capa de arriba.
    if (!isTopModalLayer(layer)) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'Tab' && dialogRef.current && trapTab(dialogRef.current, event.shiftKey)) {
      event.preventDefault()
    }
  }

  const fade = {
    duration: (reduced ? reducedDuration.base : duration.base) / 1000,
    ease: [...ease.out] as [number, number, number, number],
  }
  const scale = reduced ? 1 : MODAL_ENTER_SCALE

  return (
    <motion.div
      className={styles.scrim}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
      // El fondo solo cierra con el puntero; con teclado se cierra con Esc (el foco está atrapado dentro).
      onPointerDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
      data-modal-scrim=""
      data-modal-exiting={isPresent ? undefined : ''}
    >
      <motion.div
        className={styles.frame}
        initial={{ opacity: 0, scale }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale }}
        transition={fade}
      >
        <ModalSurface
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          data-focus-target=""
          onKeyDown={onKeyDown}
          title={title}
          titleId={titleId}
          description={description}
          descriptionId={descriptionId}
          onClose={onClose}
          footer={footer}
          surface={surface}
        >
          {children}
        </ModalSurface>
      </motion.div>
    </motion.div>
  )
}

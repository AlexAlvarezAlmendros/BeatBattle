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
import { t } from '../../i18n'
import { Button } from '../Button'
import { frameAttributes } from '../Frame'
import { cx } from '../forceState'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { Icon } from '../Icon'
import { Skeleton, SkeletonGroup } from '../Skeleton'
import { isTopModalLayer, lockScroll, pushModalLayer, trapTab } from './focus'
import styles from './Modal.module.css'

/** Distancia desde la que entra la ventana, deslizándose desde la diagonal (§3.3, en px). */
export const MODAL_ENTER_OFFSET_PX = 32

export interface ModalSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** Ids para `aria-labelledby` y `aria-describedby` (los pone `Modal`). */
  titleId?: string
  descriptionId?: string
  /** Botón de cerrar arriba a la derecha (con su `aria-label`). */
  onClose?: () => void
  footer?: ReactNode
  titleAs?: 'h2' | 'h3' | 'h4'
  children?: ReactNode
  /** El cuerpo está cargando: esqueleto en su lugar y `aria-busy` (§3.3, estado «cargando»). */
  busy?: boolean
  /** El cuerpo no ha cargado: este mensaje, con el icono de peligro, en su lugar (estado «error»). */
  error?: ReactNode
  /** Estado forzado del botón de cerrar, para la galería (el foco atrapado empieza ahí). */
  closeState?: 'rest' | 'focus'
  ref?: RefObject<HTMLDivElement | null>
}

/**
 * La pieza visible del modal, sin comportamiento: la **ventana de juego** (guía §3.3), un panel
 * `--bb-panel-veil` con marco blanco y chaflán `--bb-cut-lg`, título en display, descripción, cuerpo y
 * las teclas de acción en el pie. `Modal` la usa dentro del diálogo; la galería la enseña quieta.
 */
export function ModalSurface({
  title,
  description,
  titleId,
  descriptionId,
  onClose,
  footer,
  titleAs: TitleTag = 'h2',
  className,
  children,
  busy = false,
  error,
  closeState,
  ...rest
}: ModalSurfaceProps) {
  const body = busy ? (
    <SkeletonGroup>
      <Skeleton shape="text" width="85%" />
      <Skeleton shape="text" />
      <Skeleton shape="text" width="60%" />
    </SkeletonGroup>
  ) : error ? (
    <p className={styles.error} role="alert">
      <Icon name="alert" className={styles.errorIcon} />
      <span>{error}</span>
    </p>
  ) : (
    children
  )
  const content = (
    <>
      <header className={styles.header}>
        <TitleTag id={titleId} className={cx('bb-display', styles.title)}>
          {title}
        </TitleTag>
        {onClose && (
          <Button
            variant="outline"
            size="sm"
            iconOnly
            icon="close"
            aria-label={t('ui.modal.close')}
            onClick={onClose}
            state={closeState === 'focus' ? 'focus' : undefined}
            className={styles.close}
          />
        )}
      </header>
      {description && (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      )}
      {body && (
        <div className={styles.body} aria-busy={busy || undefined}>
          {body}
        </div>
      )}
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </>
  )
  return (
    <div
      {...rest}
      {...frameAttributes({ variant: 'title', cut: 'lg' })}
      className={cx(styles.surface, className)}
    >
      {content}
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
  /** Cerrar al pulsar el fondo (por defecto, sí). Esc y el botón de cerrar funcionan siempre. */
  dismissible?: boolean
  /** Elemento que recibe el foco al abrir; por defecto, el propio diálogo (se lee el título). */
  initialFocus?: RefObject<HTMLElement | null>
}

/**
 * Modal (§3.3, «ventana de juego»): sobre `--bb-scrim`, en un portal.
 *
 * - `role="dialog"` + `aria-modal` + `aria-labelledby` (y `aria-describedby` con descripción).
 * - Trampa de foco, Esc para cerrar, el foco vuelve a donde estaba al cerrar y la página no hace
 *   scroll mientras está abierto (el bloqueo se quita en cuanto empieza a cerrarse).
 * - Se pueden apilar (un modal abierto desde otro): solo el de arriba atiende Tab, Esc y el foco.
 * - Entra con la diagonal: se desliza desde la izquierda con fundido (`--bb-dur-base`); con «reducir
 *   movimiento», solo fundido (Anexo E).
 * - El sonido (`ui.open`) lo cablea la Fase 1.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
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
    // Lo que ya está dentro del diálogo no cuenta: en modo estricto el efecto se repite al montar y
    // para entonces el foco ya está en el diálogo.
    const active = document.activeElement
    if (active instanceof HTMLElement && !dialogRef.current?.contains(active)) returnFocus.current = active
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
  const offset = reduced ? 0 : -MODAL_ENTER_OFFSET_PX

  return (
    <motion.div
      className={styles.scrim}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
      // El fondo solo cierra con el puntero; con teclado se cierra con Esc (el foco está atrapado dentro).
      onPointerDown={(event) => {
        if (!dismissible || event.target !== event.currentTarget) return
        // Sin el mousedown que sigue: haría caer el foco en <body>, recién devuelto al botón.
        event.preventDefault()
        onClose()
      }}
      data-modal-scrim=""
      data-modal-exiting={isPresent ? undefined : ''}
    >
      <motion.div
        className={styles.frame}
        initial={{ opacity: 0, x: offset }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: offset }}
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
        >
          {children}
        </ModalSurface>
      </motion.div>
    </motion.div>
  )
}

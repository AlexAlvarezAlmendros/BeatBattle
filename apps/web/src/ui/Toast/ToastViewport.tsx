import { type ComponentType, type FocusEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../i18n'
import { whenIdleAfterFirstPaint } from '../afterFirstPaint'
import type { ToastListProps } from './ToastList'
import styles from './ToastViewport.module.css'
import { type ToastData, useToasts } from './useToasts'

type ToastListComponent = ComponentType<ToastListProps>

let loadedList: ToastListComponent | undefined
let pendingList: Promise<ToastListComponent> | undefined

/**
 * Pide la parte animada de los avisos (`ToastList`: Motion, la pieza `Toast` y el botón de cerrar), que
 * va en su propio trozo para no cargar el inicial (§4.17). Una sola petición, compartida; si falla (sin
 * red, despliegue nuevo), se queda la lista sin animar de este fichero.
 */
export function loadToastList(): Promise<ToastListComponent> {
  pendingList ??= import('./ToastList').then(
    (module) => module.ToastList,
    () => PlainToastList,
  )
  return pendingList.then((component) => {
    loadedList = component
    return component
  })
}

/**
 * La parte animada, si ya está (`null` mientras no). Se pide tras la primera pintura, cuando el
 * navegador queda libre, o, si llega antes un aviso, en ese momento.
 */
function useToastList(needed: boolean): ToastListComponent | null {
  const [list, setList] = useState<ToastListComponent | null>(() => loadedList ?? null)
  useEffect(() => {
    if (list) return
    let active = true
    const load = () => {
      void loadToastList().then((component) => {
        if (active) setList(() => component)
      })
    }
    if (needed) {
      load()
      return () => {
        active = false
      }
    }
    const cancel = whenIdleAfterFirstPaint(load)
    return () => {
      active = false
      cancel()
    }
  }, [list, needed])
  return list
}

/**
 * Zona de avisos (§3.3): esquina inferior derecha (arriba en móvil), en un portal. Se monta una sola
 * vez, en el marco de la app (`RootLayout`).
 *
 * Las dos regiones vivas se pintan vacías desde el principio, para que los lectores de pantalla
 * anuncien lo que entra (RNF-A11Y-07): `polite` para información y éxito, y `assertive` para errores.
 * Lo animado (`ToastList`, con Motion) llega en diferido y pinta los avisos dentro de ellas; un aviso
 * lanzado antes sale en cuanto llega.
 *
 * Foco (RNF-A11Y-01, WCAG 2.4.3): si se va un aviso que tiene el foco (cerrado con el teclado o
 * expulsado por el tope de avisos), el foco pasa al botón de cerrar del siguiente o del anterior y,
 * si no queda ninguno, vuelve al elemento que lo tenía antes de entrar en la zona de avisos.
 */
export function ToastViewport() {
  const toasts = useToasts((state) => state.toasts)
  const dismiss = useToasts((state) => state.dismiss)
  const List = useToastList(toasts.length > 0)
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
        {List && <List toasts={polite} onDismiss={dismiss} onFocusLost={handOffFocus} />}
      </ol>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ol role="list" className={styles.stack} aria-live="assertive" aria-relevant="additions text">
        {List && <List toasts={assertive} onDismiss={dismiss} onFocusLost={handOffFocus} />}
      </ol>
    </section>,
    document.body,
  )
}

/**
 * Si la parte animada no llega, los avisos salen igual, sin animar: texto con su tono en palabras,
 * botón de cerrar y cierre automático (sin pausa).
 */
function PlainToastList({ toasts, onDismiss }: ToastListProps) {
  return toasts.map((toast) => (
    <PlainToast key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
  ))
}

function PlainToast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    if (toast.duration === null) return
    const timer = setTimeout(() => dismissRef.current(), toast.duration)
    return () => clearTimeout(timer)
  }, [toast.duration])
  return (
    <li className={styles.plain} data-toast-item="">
      <p>
        <strong>{t(`ui.toast.tone.${toast.tone}`)}:</strong> {toast.title}
      </p>
      {toast.message && <p className={styles.plainMessage}>{toast.message}</p>}
      <button type="button" className={styles.plainClose} onClick={onDismiss}>
        {t('ui.toast.close')}
      </button>
    </li>
  )
}

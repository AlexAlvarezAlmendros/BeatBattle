import { type RefObject, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n'
import { Frame } from '../../ui/Frame'
import { Icon } from '../../ui/Icon'
import { useShortcuts } from '../../ui/shortcuts'
import { TitlePlate } from '../../ui/TitlePlate'
import { paths } from '../paths'
import styles from './Hud.module.css'
import type { ScreenConfig } from './screen'
import { FrameSlotTarget } from './slots'
import { useSound } from './soundStore'

/**
 * HUD superior del marco de juego (guía §3.4.1; tarea 0.23): rejilla de tres columnas.
 *
 * - **Izquierda, el jugador** (hueco `hudPlayer`): sin sesión, «1P · PULSA PARA UNIRTE», que lleva a
 *   entrar. Con sesión, la pantalla pone su ficha (avatar, nivel, medidor de XP).
 * - **Centro, el contexto** (hueco `hudCenter`): la placa de título de las pantallas interiores (de la
 *   configuración de la ruta) o lo que ponga la pantalla (el reloj de ronda en el menú).
 * - **Derecha** (hueco `hudRight`, temporada y racha) y el **botón de sonido** (44 px, `aria-pressed`,
 *   tecla M).
 *
 * En el marco simple (§3.8.14) no hay capa de juego: ni jugador ni temporada; quedan el título y el
 * sonido.
 */
export function Hud({ screen }: { screen: ScreenConfig }) {
  const ref = useRef<HTMLElement>(null)
  useHudStack(ref)
  return (
    <header ref={ref} className={styles.hud}>
      <FrameSlotTarget
        name="hudPlayer"
        className={styles.player}
        fallback={screen.simple ? null : <JoinPrompt />}
      />
      <FrameSlotTarget
        name="hudCenter"
        className={styles.center}
        fallback={
          screen.plate ? (
            <TitlePlate aria-hidden="true" kicker={t(screen.plate.kicker)} title={t(screen.plate.title)} />
          ) : null
        }
      />
      <div className={styles.right}>
        <FrameSlotTarget name="hudRight" className={styles.extras} />
        <SoundButton />
      </div>
    </header>
  )
}

/**
 * Apila el HUD (`data-stacked`: el jugador y la derecha arriba, el centro debajo) cuando sus tres piezas
 * no caben en una fila (§3.4.1): en una fila, cada lado mide como poco su contenido, así que no caben si
 * la última pieza se sale del HUD. Depende de lo que lleve cada hueco (la ficha del jugador, el reloj y
 * la temporada del menú; «1P · PULSA PARA UNIRTE» y la placa de título de las pantallas interiores), no
 * de un ancho fijo: de 721 a unos 1000 px en el menú.
 *
 * Se mide en una fila (sin el atributo) y se vuelve a poner en el mismo paso, sin pintar entre medias.
 * Cuando cambia el tamaño del HUD o de una pieza (la letra que llega, una pantalla que rellena un hueco)
 * se vuelve a medir en el fotograma siguiente: hacerlo dentro del aviso de `ResizeObserver` cambiaría lo
 * observado en el mismo fotograma, un bucle que el navegador corta con un error.
 */
export function useHudStack(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const hud = ref.current
    if (!hud) return
    const update = () => {
      hud.removeAttribute('data-stacked')
      const last = hud.lastElementChild?.getBoundingClientRect()
      const end = hud.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(hud).paddingRight)
      hud.toggleAttribute('data-stacked', last !== undefined && last.right > end + 0.5)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    })
    observer.observe(hud)
    for (const piece of hud.children) observer.observe(piece)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [ref])
}

/** «1P · PULSA PARA UNIRTE» (§3.4.1, sin sesión): lleva a entrar. */
export function JoinPrompt() {
  return (
    <Link to={paths.signIn()} className={styles.join} aria-label={t('frame.hud.joinLabel')}>
      <span className={styles.p1} aria-hidden="true">
        {t('ui.cursor.player')}
      </span>
      <Frame as="span" cut="md" className={styles.joinAvatar} aria-hidden="true">
        <Icon name="plus" />
      </Frame>
      <span className={styles.joinText}>{t('frame.hud.join')}</span>
    </Link>
  )
}

/**
 * Botón de sonido del HUD (§3.4.1, `RD-SND-06`): 44 px, conmutador con `aria-pressed` y tecla M. Con los
 * atajos de una tecla apagados (WCAG 2.1.4, `ui/shortcuts.ts`) la M no hace nada y el nombre no la cita.
 */
export function SoundButton() {
  const enabled = useSound((state) => state.enabled)
  const toggle = useSound((state) => state.toggle)
  const shortcuts = useShortcuts((state) => state.enabled)
  return (
    <Frame
      as="button"
      type="button"
      cut="md"
      className={styles.sound}
      aria-pressed={enabled}
      aria-label={t(shortcuts ? 'frame.hud.sound' : 'frame.hud.soundNoKey')}
      aria-keyshortcuts={shortcuts ? 'M' : undefined}
      onClick={toggle}
      data-sound={enabled ? 'on' : 'off'}
    >
      <Icon name={enabled ? 'soundOn' : 'soundOff'} />
    </Frame>
  )
}

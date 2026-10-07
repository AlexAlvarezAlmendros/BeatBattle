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
  useHudPlayerBox(ref)
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
 * de un ancho fijo: de 721 a unos 1000 px en el menú. En móvil (≤ 720 px) con teclado y ratón, donde el
 * centro baja a la pantalla, apilado es el jugador y el sonido arriba y la temporada y la racha en una
 * segunda fila (a 390 px no caben al lado del jugador; a 720, sí). En el móvil táctil no se apila: el
 * pliegue quita las teselas (§3.4.1 v0.6.6).
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
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const resize = new ResizeObserver(schedule)
    // Se observa también lo que lleva cada pieza: apilado, el jugador se estira y la derecha no hace caja
    // (`display: contents`), así que lo único que cambia cuando el contenido encoge (la letra que llega,
    // una ficha que cambia) es el contenido. Sin esto, apilado una vez, se quedaba apilado (la letra de
    // reserva de la CI no cabe a 320 px: sobraban los 12 px de la fila vacía de la temporada).
    const observe = () => {
      resize.disconnect()
      resize.observe(hud)
      for (const piece of hud.children) {
        resize.observe(piece)
        for (const content of piece.children) resize.observe(content)
      }
    }
    observe()
    // Los huecos se llenan y se vacían (la ficha del jugador, las teselas de la temporada). Solo sus hijos
    // directos: el reloj del menú cambia su texto cada segundo y no tiene por qué volver a medir.
    const mutations = new MutationObserver(() => {
      observe()
      schedule()
    })
    for (const piece of hud.children) mutations.observe(piece, { childList: true })
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
    }
  }, [ref])
}

/**
 * Variables con la caja del jugador del HUD (su borde derecho y su borde de abajo, en px desde la esquina
 * de arriba a la izquierda de la página): la arena apaga ahí sus rayos (`ArenaBackdrop`).
 */
export const HUD_PLAYER_RIGHT_VAR = '--hud-player-right'
export const HUD_PLAYER_BOTTOM_VAR = '--hud-player-bottom'

/**
 * Publica la caja del jugador del HUD (la ficha o «1P · PULSA PARA UNIRTE») para que la arena apague los
 * rayos debajo: es la única pieza del HUD cuyo texto va directamente sobre el fondo (el reloj, la placa
 * de título, la temporada, la racha y el sonido van en su panel). Ningún texto sobre rayos (`RD-VIS-05`,
 * §3.2; jurado de la 0.28, L12: «LILBRU», «NV 7 · BEATMAKER» y el XP iban sobre sus bandas). Sigue a la
 * pieza cuando cambia de tamaño o de sitio (la ficha que llega, el HUD apilado, el medianil de móvil). Sin
 * jugador (marco simple), no hay caja.
 */
export function useHudPlayerBox(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const player = ref.current?.querySelector<HTMLElement>('[data-frame-slot="hudPlayer"]')
    if (!player) return
    const root = document.documentElement
    const clear = () => {
      root.style.removeProperty(HUD_PLAYER_RIGHT_VAR)
      root.style.removeProperty(HUD_PLAYER_BOTTOM_VAR)
    }
    const update = () => {
      const box = player.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return clear()
      root.style.setProperty(HUD_PLAYER_RIGHT_VAR, `${Math.ceil(box.right + window.scrollX)}px`)
      root.style.setProperty(HUD_PLAYER_BOTTOM_VAR, `${Math.ceil(box.bottom + window.scrollY)}px`)
    }
    update()
    // Cambiar las variables no cambia el tamaño de la pieza: se puede actualizar dentro del aviso.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(player)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      clear()
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

import { Link } from 'react-router'
import { t } from '../../i18n'
import { Frame } from '../../ui/Frame'
import { Icon } from '../../ui/Icon'
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
  return (
    <header className={styles.hud}>
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

/** Botón de sonido del HUD (§3.4.1, `RD-SND-06`): 44 px, conmutador con `aria-pressed` y tecla M. */
export function SoundButton() {
  const enabled = useSound((state) => state.enabled)
  const toggle = useSound((state) => state.toggle)
  return (
    <Frame
      as="button"
      type="button"
      cut="md"
      className={styles.sound}
      aria-pressed={enabled}
      aria-label={t('frame.hud.sound')}
      onClick={toggle}
      data-sound={enabled ? 'on' : 'off'}
    >
      <Icon name={enabled ? 'soundOn' : 'soundOff'} />
    </Frame>
  )
}

import { Link } from 'react-router'
import { type SimpleMessageKey, t } from '../../i18n'
import { Key } from '../../ui/Key'
import { OTP_SIGNATURE_HREF, OtpSlapImage } from '../../ui/OtpSlap'
import { useShortcuts } from '../../ui/shortcuts'
import { paths } from '../paths'
import styles from './ControlsBar.module.css'
import type { ControlKey, ScreenConfig } from './screen'
import { FrameSlotTarget } from './slots'

/** Una tecla: lo que se ve y, si el dibujo no se lee bien, su nombre para los lectores de pantalla. */
interface KeyGlyph {
  glyph: SimpleMessageKey
  label?: SimpleMessageKey
}

const ARROW_UP: KeyGlyph = { glyph: 'frame.keys.glyph.up', label: 'frame.keys.glyph.upLabel' }
const ARROW_DOWN: KeyGlyph = { glyph: 'frame.keys.glyph.down', label: 'frame.keys.glyph.downLabel' }
const ARROW_LEFT: KeyGlyph = { glyph: 'frame.keys.glyph.left', label: 'frame.keys.glyph.leftLabel' }
const ARROW_RIGHT: KeyGlyph = { glyph: 'frame.keys.glyph.right', label: 'frame.keys.glyph.rightLabel' }

/** Teclas de cada grupo y su verbo (§3.4.1: `[↑][↓] ELEGIR · [INTRO] ENTRAR · [ESC] VOLVER · [M] SONIDO`). */
export const CONTROL_KEYS: Readonly<
  Record<ControlKey, { keys: readonly KeyGlyph[]; verb: SimpleMessageKey }>
> = {
  choose: { keys: [ARROW_UP, ARROW_DOWN], verb: 'frame.keys.choose' },
  move: { keys: [ARROW_LEFT, ARROW_UP, ARROW_DOWN, ARROW_RIGHT], verb: 'frame.keys.move' },
  section: {
    keys: [{ glyph: 'frame.keys.glyph.q' }, { glyph: 'frame.keys.glyph.e' }],
    verb: 'frame.keys.section',
  },
  enter: { keys: [{ glyph: 'frame.keys.glyph.enter' }], verb: 'frame.keys.enter' },
  back: { keys: [{ glyph: 'frame.keys.glyph.escape' }], verb: 'frame.keys.back' },
  sound: { keys: [{ glyph: 'frame.keys.glyph.m' }], verb: 'frame.keys.sound' },
}

/**
 * Barra de controles inferior (guía §3.4.1; tarea 0.23): 58 px, negra, con filete rojo y línea
 * discontinua encima. A la izquierda, las teclas de la pantalla; en el centro, la **firma** («Un juego
 * de [OTP.] Other People Records», enlazada al sello, `RF-OTP-01`); a la derecha, un dato (hueco
 * `controlsRight`: la crónica de la arena en el menú; «Legal» por defecto). En táctil y en móvil las
 * teclas desaparecen y queda la firma.
 */
export function ControlsBar({ screen }: { screen: ScreenConfig }) {
  // Con los atajos de una tecla apagados (WCAG 2.1.4), M no hace nada: no se enseña.
  const shortcuts = useShortcuts((state) => state.enabled)
  const keys = shortcuts ? screen.keys : screen.keys.filter((id) => id !== 'sound')
  return (
    <footer className={styles.bar}>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className={styles.keys} aria-label={t('frame.keys.label')}>
        {keys.map((id) => {
          const { keys, verb } = CONTROL_KEYS[id]
          return (
            <li key={id} className={styles.control} data-control={id}>
              {keys.map((key) => (
                <Key key={key.glyph} label={key.label ? t(key.label) : undefined}>
                  {t(key.glyph)}
                </Key>
              ))}
              <span>{t(verb)}</span>
            </li>
          )
        })}
      </ul>
      <Signature />
      <FrameSlotTarget
        name="controlsRight"
        className={styles.right}
        fallback={
          <Link to={paths.legal('bases')} className={styles.legal}>
            {t('frame.controls.legal')}
          </Link>
        }
      />
    </footer>
  )
}

/** La firma de la barra (§3.1 «La firma»): pegatina de 30 px (24 en móvil) enlazada al sello. */
export function Signature() {
  return (
    <a
      className={styles.signature}
      href={OTP_SIGNATURE_HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('frame.controls.signatureLabel')}
      data-otp-signature=""
    >
      <span aria-hidden="true">{t('frame.controls.signatureBefore')}</span>
      <OtpSlapImage size="bar" />
      <span aria-hidden="true">{t('frame.controls.signatureAfter')}</span>
    </a>
  )
}

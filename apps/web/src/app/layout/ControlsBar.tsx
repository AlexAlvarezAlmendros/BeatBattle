import { useLayoutEffect, useRef } from 'react'
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
 * `controlsRight`: la crónica de la arena en el menú; «Legal» por defecto, que en móvil va al lado de
 * la firma con un filete en medio). En táctil y en móvil las teclas desaparecen y queda la firma. Con
 * teclado, si las teclas no caben al lado de la firma, van en su propia fila encima (`useBarLayout`). Va
 * pegada al pie de la ventana con su alto real como margen del foco, salvo en ventanas bajas, donde se
 * despega.
 */
export function ControlsBar({ screen }: { screen: ScreenConfig }) {
  // Con los atajos de una tecla apagados (WCAG 2.1.4), M no hace nada: no se enseña.
  const shortcuts = useShortcuts((state) => state.enabled)
  const keys = shortcuts ? screen.keys : screen.keys.filter((id) => id !== 'sound')
  const barRef = useRef<HTMLElement>(null)
  const keysRef = useRef<HTMLUListElement>(null)
  useBarLayout(barRef, keysRef, keys.join(' '))
  return (
    <footer ref={barRef} className={styles.bar}>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul ref={keysRef} role="list" className={styles.keys} aria-label={t('frame.keys.label')}>
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
          <>
            {/* Filete que separa «Legal» de la firma cuando van juntos (móvil): sin él se leía como
                parte del nombre del sello, «Other People Records Legal». Decorativo. */}
            <span className={styles.rule} aria-hidden="true" data-controls-rule="" />
            <Link to={paths.legal('bases')} className={styles.legal}>
              {t('frame.controls.legal')}
            </Link>
          </>
        }
      />
    </footer>
  )
}

/**
 * Parte del alto de la ventana a partir de la cual la barra deja de ir pegada al pie (§3.4.1): en una
 * ventana baja con teclado (móvil apaisado, escritorio al 400 %) la barra, con sus teclas en una fila
 * aparte, llegaba a tapar casi la mitad de la pantalla (WCAG 1.4.10 y 2.4.11).
 */
export const CONTROLS_MAX_VIEWPORT_SHARE = 0.25

/** Variable con el alto real de la barra pegada: el margen del foco de `global.css` (0 si no va pegada). */
export const CONTROLS_HEIGHT_VAR = '--controls-pinned-h'

/**
 * Compone y mide la barra (§3.4.1):
 *
 * - **Teclas en su fila** (`data-keys-row`): con teclado, si las teclas no caben en una línea en su
 *   columna, al lado de la firma, van en su propia fila encima y parten si hace falta (jurado de la
 *   0.28, L7: antes, las que no cabían pasaban a una línea oculta y, de 721 a unos 1400 px, faltaban
 *   «ESC VOLVER» o «M SONIDO»). Depende de lo que cabe de verdad (las teclas de la pantalla, la letra,
 *   el zoom), no de un ancho fijo: se mide en la composición de una fila (sin el atributo) y se vuelve a
 *   poner en el mismo paso, sin pintar entre medias, como el HUD (`useHudStack`). En táctil las teclas
 *   no se ven y no cuentan.
 * - **Alto real** en `CONTROLS_HEIGHT_VAR`, para que ningún control enfocado quede debajo de la barra
 *   (§3.3): con las teclas en su fila crece y un margen fijo no basta. Si la barra pasa de
 *   `CONTROLS_MAX_VIEWPORT_SHARE` del alto de la ventana, se despega (`data-unpinned`): va al final de la
 *   pantalla y el margen vuelve a ser el de siempre.
 *
 * Cuando cambia el tamaño de la barra o de una tecla (la letra que llega) se vuelve a medir en el
 * fotograma siguiente: dentro del aviso de `ResizeObserver` cambiaría lo observado en el mismo fotograma.
 */
function useBarLayout(
  ref: { current: HTMLElement | null },
  keysRef: { current: HTMLElement | null },
  keyIds: string,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `keyIds` vuelve a medir y a observar si cambian las teclas
  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar) return
    const keys = keysRef.current
    const root = document.documentElement
    const update = () => {
      bar.removeAttribute('data-keys-row')
      const shown =
        !!keys && getComputedStyle(keys).visibility === 'visible' && keys.getClientRects().length > 0
      bar.toggleAttribute('data-keys-row', shown && keys.scrollHeight > keys.clientHeight + 0.5)
      const height = bar.getBoundingClientRect().height
      const unpinned = height > window.innerHeight * CONTROLS_MAX_VIEWPORT_SHARE
      bar.toggleAttribute('data-unpinned', unpinned)
      root.style.setProperty(CONTROLS_HEIGHT_VAR, `${unpinned ? 0 : Math.ceil(height)}px`)
    }
    update()
    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later)
    observer?.observe(bar)
    for (const key of keys?.children ?? []) observer?.observe(key)
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', later)
      root.style.removeProperty(CONTROLS_HEIGHT_VAR)
    }
  }, [ref, keysRef, keyIds])
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

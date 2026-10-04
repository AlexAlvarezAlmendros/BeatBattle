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
 * la firma con un filete en medio si cabe y, si no, debajo). La firma va siempre centrada. En táctil y
 * en móvil las teclas desaparecen y queda la firma. Con teclado, si las teclas no caben al lado de la
 * firma, van en su propia fila encima (`useBarLayout`). Va pegada al pie de la ventana con su alto real
 * como margen del foco, salvo si ocupa demasiado de la ventana, donde se despega.
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

/**
 * La misma parte con teclado y ratón en una ventana pequeña (`SMALL_WINDOW_QUERY`): ahí la barra lleva
 * las teclas en su fila (y en el menú, la crónica en otra) y, pegada, se comía la primera vista (jurado
 * de la 0.28, L8: a 360 × 640 medía 154 px, el 24 %, y el menú no enseñaba ninguna placa; en su
 * revisión, a 390 × 844 medía 158 px, el 18,7 %, y la barra empezaba en mitad de «JUGAR»). En táctil no
 * lleva teclas y sigue el límite general.
 */
export const CONTROLS_MAX_VIEWPORT_SHARE_SMALL = 0.15

/**
 * Ventana pequeña: estrecha (720 px de ancho o menos, la composición de móvil), sea cual sea su alto, o
 * baja (700 px de alto o menos, el corte del «móvil bajo» de §3.8.3; también el escritorio ampliado al
 * 175 % o más). En una ventana de escritorio de tamaño normal (1024 × 768) la barra sigue pegada.
 */
export const SMALL_WINDOW_QUERY = '(max-width: 720px), (max-height: 700px)'

/** Táctil (sin teclas en la barra): el mismo criterio que su CSS. */
const TOUCH_QUERY = '(hover: none), (pointer: coarse)'

/** El límite que toca ahora: el de las ventanas pequeñas con teclado o el general. */
function maxViewportShare(): number {
  if (typeof window.matchMedia !== 'function') return CONTROLS_MAX_VIEWPORT_SHARE
  const keyboard = !window.matchMedia(TOUCH_QUERY).matches
  return keyboard && window.matchMedia(SMALL_WINDOW_QUERY).matches
    ? CONTROLS_MAX_VIEWPORT_SHARE_SMALL
    : CONTROLS_MAX_VIEWPORT_SHARE
}

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
 * - **Dato debajo** (`data-right-row`): si lo que va a la derecha («Legal» con su filete) no cabe en su
 *   columna al lado de la firma centrada, baja a su propia fila, centrado (jurado de la 0.28, M3r: en
 *   móvil se centraba el grupo y la firma quedaba descentrada). Igual: lo que cabe de verdad. La crónica
 *   del menú no se mide: llena su columna y acaba en «…», y por debajo de 1200 px va siempre en su fila.
 * - **Alto real** en `CONTROLS_HEIGHT_VAR`, para que ningún control enfocado quede debajo de la barra
 *   (§3.3): con las teclas en su fila crece y un margen fijo no basta. Si la barra pasa de
 *   `CONTROLS_MAX_VIEWPORT_SHARE` del alto de la ventana (`CONTROLS_MAX_VIEWPORT_SHARE_SMALL` con teclado
 *   en una ventana pequeña), se despega (`data-unpinned`): va al final de la pantalla y el margen vuelve a
 *   ser el de siempre.
 *
 * Cuando cambia el tamaño de la barra, de una tecla, de la firma o del dato (la letra que llega, una
 * pantalla que reclama el hueco) se vuelve a medir en el fotograma siguiente: dentro del aviso de
 * `ResizeObserver` cambiaría lo observado en el mismo fotograma.
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
    const signature = bar.querySelector<HTMLElement>('[data-otp-signature]')
    const right = bar.querySelector<HTMLElement>('[data-frame-slot="controlsRight"]')
    const root = document.documentElement
    const update = () => {
      bar.removeAttribute('data-keys-row')
      bar.removeAttribute('data-right-row')
      bar.toggleAttribute('data-keys-row', !!keys && keysOverflow(keys))
      bar.toggleAttribute('data-right-row', !!signature && !!right && rightOverflows(bar, signature, right))
      const height = bar.getBoundingClientRect().height
      const unpinned = height > window.innerHeight * maxViewportShare()
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
    for (const piece of [bar, signature, right, ...(keys?.children ?? [])])
      if (piece) observer?.observe(piece)
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', later)
      root.style.removeProperty(CONTROLS_HEIGHT_VAR)
    }
  }, [ref, keysRef, keyIds])
}

/**
 * ¿Se ven las teclas (con teclado) y no caben en una línea en su columna? O parten de línea (sobra alto)
 * o una tecla sola es más ancha que la columna (sobra ancho): con una sola tecla no hay otra que baje de
 * línea, y la columna la recortaba (revisión de L7: con los atajos de una tecla apagados, en /entrar a
 * 390 px solo quedaba «ESC VOLVER» en una columna de 16 px y asomaba una «E»).
 */
function keysOverflow(keys: HTMLElement): boolean {
  const shown = getComputedStyle(keys).visibility === 'visible' && keys.getClientRects().length > 0
  return shown && (keys.scrollHeight > keys.clientHeight + 0.5 || keys.scrollWidth > keys.clientWidth + 0.5)
}

/**
 * ¿El dato de la derecha se sale de su columna? Pisa la firma (con el hueco entre columnas) o pasa del
 * borde de la barra. No cuenta si está vacío o lo ha reclamado la pantalla (la crónica).
 */
function rightOverflows(bar: HTMLElement, signature: HTMLElement, right: HTMLElement): boolean {
  if (right.hasAttribute('data-claimed') || right.getClientRects().length === 0) return false
  const box = right.getBoundingClientRect()
  if (box.width < 1) return false
  const style = getComputedStyle(bar)
  const end = bar.getBoundingClientRect().right - Number.parseFloat(style.paddingRight)
  const gap = Number.parseFloat(style.columnGap) || 0
  return box.left < signature.getBoundingClientRect().right + gap - 0.5 || box.right > end + 0.5
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

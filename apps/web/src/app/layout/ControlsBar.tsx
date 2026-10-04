import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router'
import { type SimpleMessageKey, t } from '../../i18n'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { Key } from '../../ui/Key'
import { OTP_SIGNATURE_HREF, OtpSlapImage } from '../../ui/OtpSlap'
import { useShortcuts } from '../../ui/shortcuts'
import { paths } from '../paths'
import { LoopsPause } from './Chronicle'
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
 * firma, primero se aprietan y, si aun así no caben, van en su propia fila encima (`useBarLayout`). Va
 * pegada al pie de la ventana con su alto real como margen del foco, salvo si pasa del 15 % de la
 * ventana, donde se despega todo menos la fila de la firma, que sigue pegada (§3.4.1 v0.6.6 y v0.6.7).
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
            {screen.loops && <ScreenLoopsPause />}
          </>
        }
      />
    </footer>
  )
}

/**
 * «Pausar las animaciones» de una pantalla con bucles (`ScreenConfig.loops`, la galería; §3.6 y §3.4.1:
 * «aparece en las pantallas con bucles»), al lado de «Legal». Con «reducir movimiento» los bucles ya
 * están parados (`global.css`, Anexo E) y no hay nada que pausar: no se enseña, como en la crónica sin
 * rotación.
 */
function ScreenLoopsPause() {
  const reduced = useReducedMotion()
  return reduced ? null : <LoopsPause className={styles.loopsPause} />
}

/**
 * Parte del alto de la ventana a partir de la cual la barra deja de ir pegada al pie (§3.4.1): el 15 %,
 * **en cualquier ventana y con cualquier entrada** (v0.6.7). Con las teclas en su fila (y en el menú, la
 * crónica en otra), pegada entera se comía la primera vista: a 360 × 640 con teclado medía 154 px, el
 * 24 %, y el menú no enseñaba ninguna placa (jurado de la 0.28, L8); a 1024 × 768 con teclado, 127 px
 * (16,5 %), y tapaba el dato de la placa 06, el panel de ayuda y el play, la onda y el reto de la
 * tarjeta, porque fuera de las ventanas pequeñas el límite era el 25 % (tercer pase sobre la v0.6.6, B1).
 * En táctil, la de las interiores (firma y «Legal» debajo) mide 98 px: el 15,3 % a 360 × 640.
 */
export const CONTROLS_MAX_VIEWPORT_SHARE = 0.15

/**
 * Variable con el alto real de lo que va pegado al pie: el margen del foco de `global.css`. La barra
 * entera o, despegada, la fila de la firma (§3.4.1 v0.6.6).
 */
export const CONTROLS_HEIGHT_VAR = '--controls-pinned-h'

/** Variable de la barra despegada: lo que mide de más que la fila de la firma (su `bottom` negativo). */
const BAR_TAIL_VAR = '--bar-tail'

/**
 * Compone y mide la barra (§3.4.1):
 *
 * - **Teclas apretadas** (`data-keys-tight`) **o en su fila** (`data-keys-row`): con teclado, si las teclas
 *   no caben en una línea en su columna, al lado de la firma y con `--bar-gap` antes de ella, primero se
 *   aprietan sus huecos y, si aun así no caben, van en su propia fila encima y parten si hace falta
 *   (cuarto pase del jurado, F1: de ~1362 a ~1407 px «M SONIDO» se pegaba a la firma; jurado de la
 *   0.28, L7: antes, las que no cabían pasaban a una línea oculta y, de 721 a unos 1400 px, faltaban
 *   «ESC VOLVER» o «M SONIDO»). Depende de lo que cabe de verdad (las teclas de la pantalla, la letra,
 *   el zoom), no de un ancho fijo: se mide en la composición de una fila (sin el atributo) y se vuelve a
 *   poner en el mismo paso, sin pintar entre medias, como el HUD (`useHudStack`). En táctil las teclas
 *   no se ven y no cuentan.
 * - **Dato debajo** (`data-right-row`): si lo que va a la derecha («Legal» con su filete) no cabe en su
 *   columna al lado de la firma centrada, baja a su propia fila, centrado (jurado de la 0.28, M3r: en
 *   móvil se centraba el grupo y la firma quedaba descentrada). Igual: lo que cabe de verdad. La crónica
 *   del menú no se mide: llena su columna (si un mensaje no cabe en una línea, parte en dos dentro del
 *   alto de su botón de pausa) y por debajo de 1200 px va siempre en su fila.
 * - **Alto real** en `CONTROLS_HEIGHT_VAR`, para que ningún control enfocado quede debajo de la barra
 *   (§3.3): con las teclas en su fila crece y un margen fijo no basta. Si la barra pasa de
 *   `CONTROLS_MAX_VIEWPORT_SHARE` del alto de la ventana (el 15 %, en cualquier ventana y con cualquier
 *   entrada), se despega (`data-unpinned`): las teclas, «Legal» y la crónica van al final de la pantalla y
 *   solo sigue pegada la fila de la firma (§3.4.1 v0.6.6 y v0.6.7), así que el margen pasa a ser el alto de
 *   esa fila.
 * - **Foco en lo despegado** (`revealUnpinned`): con Tab hasta «Legal» o la pausa, que despegadas quedan
 *   por debajo de la ventana dentro de una barra `sticky`, el navegador no desplaza lo bastante (lo que
 *   mueve, la barra lo sigue) y el control quedaba entero fuera de la ventana (revisión del cuarto pase,
 *   a 360 × 640 en /como-funciona). Se baja al final de la pantalla, donde la barra está entera.
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
      // Se mide siempre en la composición pegada (despegada, la firma va arriba y hay aire entre filas).
      bar.removeAttribute('data-unpinned')
      bar.removeAttribute('data-keys-tight')
      bar.removeAttribute('data-keys-row')
      bar.removeAttribute('data-right-row')
      if (keys && keysOverflow(keys)) {
        // Primero se aprietan; si aun así no caben, a su fila (con sus huecos de siempre).
        bar.setAttribute('data-keys-tight', '')
        if (keysOverflow(keys)) {
          bar.removeAttribute('data-keys-tight')
          bar.setAttribute('data-keys-row', '')
        }
      }
      bar.toggleAttribute('data-right-row', !!signature && !!right && rightOverflows(bar, signature, right))
      const height = bar.getBoundingClientRect().height
      const unpinned = height > window.innerHeight * CONTROLS_MAX_VIEWPORT_SHARE
      bar.toggleAttribute('data-unpinned', unpinned)
      // Despegada, sigue pegada la fila de la firma (arriba): lo demás queda por debajo de la ventana.
      const pinned = Math.ceil(unpinned && signature ? signatureRowHeight(bar, signature, right) : height)
      const tail = unpinned ? Math.max(0, Math.floor(bar.getBoundingClientRect().height - pinned)) : 0
      bar.style.setProperty(BAR_TAIL_VAR, `${tail}px`)
      root.style.setProperty(CONTROLS_HEIGHT_VAR, `${pinned}px`)
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
    const reveal = (event: FocusEvent) => revealUnpinned(bar, event.target)
    bar.addEventListener('focusin', reveal)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', later)
      bar.removeEventListener('focusin', reveal)
      root.style.removeProperty(CONTROLS_HEIGHT_VAR)
      bar.style.removeProperty(BAR_TAIL_VAR)
    }
  }, [ref, keysRef, keyIds])
}

/**
 * Con la barra despegada, un control suyo que recibe el foco por debajo de la ventana («Legal», la pausa
 * de la crónica: van en la parte que cuelga, `--bar-tail`) se trae a la vista bajando al final de la
 * pantalla, donde la barra está en su sitio y entera (§3.4.1: «pegada o no, ningún control enfocado queda
 * debajo de ella… el anillo del cursor de sus piezas cabe entero en la ventana»; WCAG 2.4.11). El
 * desplazamiento del navegador no basta: la barra es `sticky` y sigue a lo que se desplaza. Es un salto,
 * como el del foco, sin animación (también con «reducir movimiento»). Se decide antes de que el navegador
 * desplace (`focusin` llega antes), así que no hay ningún fotograma con el control fuera.
 */
function revealUnpinned(bar: HTMLElement, target: EventTarget | null): void {
  if (!bar.hasAttribute('data-unpinned') || !(target instanceof Element)) return
  const ring = Number.parseFloat(getComputedStyle(bar).paddingBottom) || 0
  if (target.getBoundingClientRect().bottom + ring <= window.innerHeight + 0.5) return
  const page = document.scrollingElement ?? document.documentElement
  page.scrollTo({ top: page.scrollHeight, behavior: 'instant' })
}

/**
 * Alto de lo que sigue pegado con la barra despegada (§3.4.1 v0.6.6): del borde de arriba de la barra (con
 * su filete) al pie de la fila de la firma (con «Legal» o la crónica si van a su lado), más el aire del
 * anillo del foco (`--bar-ring`, el relleno de abajo de la barra y el hueco entre filas al despegarse).
 */
function signatureRowHeight(bar: HTMLElement, signature: HTMLElement, right: HTMLElement | null): number {
  const top = bar.getBoundingClientRect().top
  const row = signature.getBoundingClientRect()
  let bottom = row.bottom
  const beside = right?.getBoundingClientRect()
  if (beside && beside.height > 0 && beside.top < row.bottom - 0.5 && beside.bottom > row.top + 0.5)
    bottom = Math.max(bottom, beside.bottom)
  return bottom - top + Number.parseFloat(getComputedStyle(bar).paddingBottom)
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

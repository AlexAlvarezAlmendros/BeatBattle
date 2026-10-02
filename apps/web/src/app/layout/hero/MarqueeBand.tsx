import { ease, loop, reducedDuration, toCssCubicBezier } from '@beatbattle/shared/tokens'
import { type Ref, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { PauseIcon, PlayIcon } from '../icons'

interface MarqueeBandProps {
  /** Palabras de la banda, ya traducidas. */
  items: readonly string[]
  /** Nombre accesible de la banda (p. ej. «Teletipo de la batalla»). */
  label: string
  /**
   * Nombre accesible del botón de pausa (p. ej. «Pausar el teletipo»). Es fijo: el estado lo da
   * `aria-pressed` (un botón conmutador no cambia de nombre al pulsarlo).
   */
  pauseLabel: string
  className?: string
}

/** Copias de la lista en el bucle: con tres, la banda siempre llena la pantalla aunque la lista sea corta. */
const LOOP_COPIES = 3

interface MarqueeListProps {
  items: readonly string[]
  /** Copia del bucle: fuera del árbol accesible. */
  hidden?: boolean
  /** Rotación visual de la lista estática: la palabra `offset` va primera. */
  offset?: number
  listRef?: Ref<HTMLUListElement>
}

function MarqueeList({ items, hidden = false, offset, listRef }: MarqueeListProps) {
  return (
    // `role="list"` explícito: Safari y VoiceOver quitan la semántica de lista con `list-style: none`.
    <ul
      ref={listRef}
      className="marquee__group"
      role={hidden ? undefined : 'list'}
      aria-hidden={hidden || undefined}
    >
      {items.map((item, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: la posición es la identidad (una palabra puede repetirse)
          key={index}
          className="marquee__item"
          // La rotación es solo visual (`order` de flex): el DOM y el árbol accesible no cambian, así que
          // el lector de pantalla no pierde la posición cada 5 s.
          style={offset === undefined ? undefined : { order: (index - offset + items.length) % items.length }}
        >
          <span className="marquee__dot" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  )
}

/**
 * Banda de marquee del sello (guía §3.1 y §3.8.3; Hero.css `.hero-marquee`): puntos rojos y palabras
 * en mayúsculas espaciadas, entre filetes rojos, sobre cristal oscuro. En la Fase 3 será el teletipo
 * vivo de la batalla.
 *
 * - Con movimiento: desplazamiento continuo (`--bb-loop-marquee`). Las copias del bucle llevan
 *   `aria-hidden`: el lector de pantalla lee la lista una vez.
 * - Con «reducir movimiento» (Anexo E): lista estática que rota una posición cada 5 s
 *   (`loop.tickerStep`) con un fundido de opacidad. La rotación es solo visual: no se vuelve a montar
 *   nada.
 * - Pausa (WCAG 2.2.2 «Pausar, detener, ocultar», §2.17): en los dos modos, con el ratón encima y con el
 *   botón de pausa (`aria-pressed`), que funciona con teclado y en táctil (44 × 44 px). La pausa del
 *   botón es del usuario y no la deshace el hover.
 *
 * `role="marquee"`: región viva sin anuncios (`aria-live` implícito `off`), así el lector no interrumpe
 * cada vez que cambia.
 */
export function MarqueeBand({ items, label, pauseLabel, className }: MarqueeBandProps) {
  const reduced = useReducedMotion()
  const [offset, setOffset] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [paused, setPaused] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const shownOffset = useRef(offset)
  const halted = paused || hovered

  useEffect(() => {
    if (!reduced || halted || items.length < 2) return
    const timer = window.setInterval(() => setOffset((value) => (value + 1) % items.length), loop.tickerStep)
    return () => window.clearInterval(timer)
  }, [reduced, halted, items.length])

  // Fundido de la lista al rotar (solo opacidad, ≤ 200 ms: Anexo E), sin volver a montarla.
  useEffect(() => {
    if (shownOffset.current === offset) return
    shownOffset.current = offset
    const list = listRef.current
    if (!list || typeof list.animate !== 'function') return
    const fade = list.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reducedDuration.fast,
      easing: toCssCubicBezier(ease.out),
    })
    return () => fade.cancel()
  }, [offset])

  return (
    <div
      role="marquee"
      aria-label={label}
      className={className ? `marquee ${className}` : 'marquee'}
      data-static={reduced || undefined}
      data-paused={paused || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="marquee__viewport">
        {reduced ? (
          <div className="marquee__track marquee__track--static">
            <MarqueeList items={items} offset={offset % Math.max(items.length, 1)} listRef={listRef} />
          </div>
        ) : (
          <div className="marquee__track">
            {Array.from({ length: LOOP_COPIES }, (_, copy) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: las copias son fijas y nunca se reordenan
              <MarqueeList key={copy} items={items} hidden={copy > 0} />
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="marquee__toggle"
        aria-label={pauseLabel}
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
      >
        <span className="marquee__toggle-face" aria-hidden="true">
          {paused ? (
            <PlayIcon className="marquee__toggle-icon" />
          ) : (
            <PauseIcon className="marquee__toggle-icon" />
          )}
        </span>
      </button>
    </div>
  )
}

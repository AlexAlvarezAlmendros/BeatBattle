import { loop } from '@beatbattle/shared/tokens'
import { useEffect, useState } from 'react'
import { useReducedMotion } from '../../../ui/glass'

interface MarqueeBandProps {
  /** Palabras de la banda, ya traducidas. */
  items: readonly string[]
  /** Nombre accesible de la banda (p. ej. «Teletipo de la batalla»). */
  label: string
  className?: string
}

/** Copias de la lista en el bucle: con tres, la banda siempre llena la pantalla aunque la lista sea corta. */
const LOOP_COPIES = 3

function MarqueeList({ items, hidden = false }: { items: readonly string[]; hidden?: boolean }) {
  return (
    // `role="list"` explícito: Safari y VoiceOver quitan la semántica de lista con `list-style: none`.
    <ul className="marquee__group" role={hidden ? undefined : 'list'} aria-hidden={hidden || undefined}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: una palabra puede repetirse en la banda
        <li key={`${index}-${item}`} className="marquee__item">
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
 * - Con movimiento: desplazamiento continuo (`--bb-loop-marquee`) que se pausa con el ratón encima o
 *   con el foco dentro. Las copias del bucle llevan `aria-hidden`: el lector de pantalla lee la lista
 *   una vez.
 * - Con «reducir movimiento» (Anexo E): lista estática que rota una posición cada 5 s
 *   (`loop.tickerStep`), también en pausa con el ratón encima.
 *
 * `role="marquee"`: región viva sin anuncios (`aria-live` implícito `off`), así el lector no interrumpe
 * cada vez que cambia.
 */
export function MarqueeBand({ items, label, className }: MarqueeBandProps) {
  const reduced = useReducedMotion()
  const [offset, setOffset] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!reduced || paused || items.length < 2) return
    const timer = window.setInterval(() => setOffset((value) => (value + 1) % items.length), loop.tickerStep)
    return () => window.clearInterval(timer)
  }, [reduced, paused, items.length])

  const rotated =
    items.length > 0 ? [...items.slice(offset % items.length), ...items.slice(0, offset % items.length)] : []

  return (
    <div
      role="marquee"
      aria-label={label}
      className={className ? `marquee ${className}` : 'marquee'}
      data-static={reduced || undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {reduced ? (
        <div className="marquee__track marquee__track--static" key={offset}>
          <MarqueeList items={rotated} />
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
  )
}

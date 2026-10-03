import { loop } from '@beatbattle/shared/tokens'
import { useEffect, useState } from 'react'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import styles from './Chronicle.module.css'

/**
 * Crónica de la arena (guía §3.8.3; la pieza propia que sustituye al teletipo, §3.1): una
 * línea en el hueco derecho de la barra de controles que cambia de mensaje cada 5 s por fundido
 * (`--bb-loop-chronicle`). En voto ciego nunca dice quién ha subido (§1.3): solo hechos de la semana.
 *
 * - Se para con el ratón encima y con «reducir movimiento» (los bucles se paran,
 *   §3.6): entonces se queda el primer mensaje.
 * - No es una región viva (`aria-live="off"`): cambiar cada 5 s no se anuncia; quien lo recorre lee el
 *   mensaje del momento.
 */
export function Chronicle({ messages, label }: { messages: readonly string[]; label: string }) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const rotates = !reduced && !paused && messages.length > 1

  useEffect(() => {
    if (!rotates) return
    const timer = setInterval(() => setIndex((current) => (current + 1) % messages.length), loop.chronicle)
    return () => clearInterval(timer)
  }, [rotates, messages.length])

  const current = messages[index % Math.max(1, messages.length)] ?? ''
  return (
    <p
      className={styles.chronicle}
      aria-live="off"
      data-chronicle=""
      data-static={reduced || undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <span className="sr-only">{label}: </span>
      <span key={index} className={styles.message}>
        {current}
      </span>
    </p>
  )
}

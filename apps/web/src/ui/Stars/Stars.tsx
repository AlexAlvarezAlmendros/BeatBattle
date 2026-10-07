import { duration } from '@beatbattle/shared/tokens'
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { Cursor } from '../Cursor'
import { flash } from '../flash/flash'
import { cx, forceStateAttr } from '../forceState'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { isSeriousMode } from '../hooks/useSeriousMode'
import { Key } from '../Key'
import { Meter } from '../Meter'
import styles from './Stars.module.css'

/** Estados de la matriz de §3.3 que la galería puede forzar. */
export type StarsState = 'rest' | 'hover' | 'focus' | 'pressed' | 'loading' | 'disabled' | 'success' | 'error'

export interface StarsProps {
  /** Nombre del grupo: «Tu nota para Tigre Púrpura, de 1 a 5». */
  label: string
  /** El voto guardado (1–5) o `null`. */
  value: number | null
  /** La escucha de la entrada (ms): sin cumplir el umbral, las estrellas duermen (`RF-VOTE-04`, `RF-VOTE-10`). */
  listen?: { heardMs: number; thresholdMs: number }
  /** Vota: si devuelve una promesa, las estrellas esperan a que el servidor confirme («guardando»). */
  onVote?: (stars: number) => Promise<void> | void
  /** Golpe del 5: la tarjeta que las contiene tiembla 2 px (§3.8.4). No llega en modo serio. */
  onImpact?: (stars: number) => void
  /** El Modo Jurado pasa a la siguiente entrada tras votar: la confirmación lo dice. */
  next?: boolean
  /** Estado forzado para la galería (`RD-VIS-03`). */
  state?: StarsState
  className?: string
}

const STARS = [1, 2, 3, 4, 5] as const

/** El dibujo de la estrella (maqueta `03-jurado`): cinco puntas en una caja de 68 × 66. */
const STAR_PATH = 'M0-30 8.8-11.9 28.5-9.3 14.2 4.6 17.6 24.3 0 15 -17.6 24.3 -14.2 4.6 -28.5-9.3 -8.8-11.9Z'

/** Chispas por estrella de la nota (§3.8.4: proporcionales a la nota; el 5, veinte). */
const SPARKS_PER_STAR = 4

/** Fracción de la ventana que ocupa una ráfaga de chispas de las estrellas (muy por debajo del 25 %). */
const SPARK_AREA = 0.02

const word = (stars: number) => t(`ui.stars.word${stars as 1 | 2 | 3 | 4 | 5}`)

interface Spark {
  id: number
  star: number
  dx: number
  dy: number
  tone: 'red' | 'white'
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving'; stars: number }
  | { kind: 'saved'; stars: number; changed: boolean }
  | { kind: 'error' }

/**
 * Estrellas (guía §3.8.4, tarea 1.5): el grupo de radio con el que se puntúa una entrada de 1 a 5.
 *
 * - **Dormidas** mientras no se cumple la escucha mínima: al 40 %, `aria-disabled`, el motivo en
 *   `aria-describedby` («Las estrellas despiertan a los 30 s: faltan 8 s») y un medidor pequeño.
 * - **Despertar**: un barrido de izquierda a derecha (`--bb-dur-slow`), `vote.unlocked` y «Ya puedes
 *   puntuar» en la región viva.
 * - **Elegir**: flechas o *hover* rellenan hasta la estrella del cursor; cada una suena su nota de la
 *   pentatónica, muy baja (`star.hover.N`).
 * - **Votar** (Intro, clic o 1–5): *hit-stop* de 70 ms, la estrella se aplasta (0,8 → 1,15 → 1), suena
 *   `star.vote.N`, chispas proporcionales a la nota por el limitador de destellos (el 5, además, vibración
 *   de 15 ms y el temblor de la tarjeta, `onImpact`) y, con la confirmación del servidor, `vote.locked` y el
 *   texto en la región viva.
 * - **Cambio de voto**: relleno sin celebración.
 *
 * Sin movimiento, el relleno cambia sin saltos ni chispas (Anexo E); en modo serio, sin chispas ni
 * temblor. Lector de pantalla: «4 de 5 estrellas: Muy bien» (`RNF-A11Y-06`).
 */
export function Stars({
  label,
  value,
  listen,
  onVote,
  onImpact,
  next = false,
  state,
  className,
}: StarsProps) {
  const reduced = useReducedMotion()
  const reasonId = useId()
  const forced = state !== undefined
  const asleep =
    state === 'disabled' || (!forced && listen !== undefined && listen.heardMs < listen.thresholdMs)
  const [cursor, setCursor] = useState(() => value ?? 1)
  const [preview, setPreview] = useState<number | null>(null)
  const [chosen, setChosen] = useState<number | null>(value)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [squash, setSquash] = useState<{ star: number; phase: 'hold' | 'squash' } | null>(null)
  const [sparks, setSparks] = useState<{ sparks: Spark[]; opacity: number } | null>(null)
  const [waking, setWaking] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const timers = useRef<number[]>([])
  const sparkSerial = useRef(0)

  useEffect(() => setChosen(value), [value])
  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer)
    },
    [],
  )
  const later = (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms))
  }

  // Despertar: de dormidas a despiertas, una vez (no al cargar ya despiertas).
  const wasAsleep = useRef(asleep)
  useEffect(() => {
    if (wasAsleep.current && !asleep && !forced) {
      audio.play('vote.unlocked')
      setAnnouncement(t('ui.stars.awake'))
      if (!reduced) {
        setWaking(true)
        timers.current.push(window.setTimeout(() => setWaking(false), duration.slow))
      }
    }
    wasAsleep.current = asleep
  }, [asleep, forced, reduced])

  const shown = forced ? forcedFill(state) : (preview ?? chosen ?? 0)
  const saving = state === 'loading' || status.kind === 'saving'

  const focusStar = (stars: number) => {
    setCursor(stars)
    buttons.current[stars - 1]?.focus()
  }

  const burst = (stars: number) => {
    const grant = flash.request({ reason: 'vote', area: SPARK_AREA, opacity: 1 })
    if (!grant) return
    const count = stars * SPARKS_PER_STAR
    const list: Spark[] = Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2 + stars
      const reach = 0.6 + (0.4 * ((index * 7) % 5)) / 4
      return {
        id: sparkSerial.current++,
        star: stars,
        dx: Math.cos(angle) * reach,
        dy: Math.sin(angle) * reach,
        tone: index % 3 === 0 ? 'white' : 'red',
      }
    })
    setSparks({ sparks: list, opacity: grant.opacity })
    later(duration.reward, () => setSparks(null))
  }

  const vote = (stars: number) => {
    if (asleep || saving || forced) return
    const previous = chosen
    const changed = previous !== null
    setChosen(stars)
    setPreview(null)
    // El cursor marca la elegida: si el foco estaba en el grupo (votar con 1–5), va a ella.
    if (buttons.current.some((button) => button === document.activeElement)) focusStar(stars)
    else setCursor(stars)
    // Primer voto, con movimiento: *hit-stop*, aplastado, sonido, chispas y, el 5, el golpe.
    if (!changed && !reduced) {
      setSquash({ star: stars, phase: 'hold' })
      later(duration.hitstop, () => {
        setSquash({ star: stars, phase: 'squash' })
        audio.play(`star.vote.${stars as 1 | 2 | 3 | 4 | 5}`)
        burst(stars)
        if (stars === 5 && !isSeriousMode()) {
          navigator.vibrate?.(15)
          onImpact?.(stars)
        }
        later(duration.reward, () => setSquash(null))
      })
    } else if (!changed) {
      audio.play(`star.vote.${stars as 1 | 2 | 3 | 4 | 5}`)
    }
    const confirm = () => {
      audio.play('vote.locked')
      setStatus({ kind: 'saved', stars, changed })
      setAnnouncement(savedText(stars, next))
    }
    const result = onVote?.(stars)
    if (result instanceof Promise) {
      setStatus({ kind: 'saving', stars })
      result.then(confirm, () => {
        setChosen(previous)
        setStatus({ kind: 'error' })
        setAnnouncement(t('ui.stars.error'))
      })
    } else confirm()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= 5) {
      event.preventDefault()
      vote(digit)
      return
    }
    const move = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key]
    if (move !== undefined || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const target =
        event.key === 'Home' ? 1 : event.key === 'End' ? 5 : Math.min(5, Math.max(1, cursor + (move ?? 0)))
      focusStar(target)
      if (!asleep) {
        setPreview(target)
        audio.play(`star.hover.${target as 1 | 2 | 3 | 4 | 5}`)
      }
    }
  }

  const statusText = forced ? forcedStatus(state) : visibleStatus(status, next)
  const listenSeconds = listen ?? { heardMs: 22_000, thresholdMs: 30_000 }
  const threshold = Math.round(listenSeconds.thresholdMs / 1000)
  const heard = Math.min(threshold, Math.floor(listenSeconds.heardMs / 1000))

  return (
    <div className={cx(styles.stars, className)} data-stars="">
      <div
        role="radiogroup"
        aria-label={label}
        aria-disabled={asleep || undefined}
        aria-describedby={asleep ? reasonId : undefined}
        aria-busy={saving || undefined}
        className={styles.group}
        data-cursor-group=""
        data-asleep={asleep ? '' : undefined}
        data-waking={waking ? '' : undefined}
        data-saving={saving ? '' : undefined}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setPreview(null)}
      >
        {STARS.map((stars, index) => {
          const on = stars <= shown
          const forcedStar =
            (state === 'hover' && stars === 3) ||
            (state === 'focus' && stars === 3) ||
            (state === 'pressed' && stars === 4)
          const squashing = squash?.star === stars ? squash.phase : undefined
          return (
            // biome-ignore lint/a11y/useSemanticElements: radio de juego con su tecla y su palabra (maqueta)
            <button
              key={stars}
              ref={(element) => {
                buttons.current[index] = element
              }}
              type="button"
              role="radio"
              aria-checked={stars === (forced ? forcedChecked(state) : chosen)}
              aria-label={t('ui.stars.star', { stars, word: word(stars) })}
              tabIndex={stars === cursor ? 0 : -1}
              className={styles.star}
              style={{ '--i': index } as CSSProperties}
              data-cursor=""
              // La elegida lleva el cursor aunque el foco esté fuera; sin voto, ninguna.
              data-cursor-active={stars === (forced ? forcedChecked(state) : chosen) ? 'true' : undefined}
              data-on={on ? '' : undefined}
              data-squash={squashing}
              {...(forcedStar ? forceStateAttr(state as 'hover' | 'focus' | 'pressed') : {})}
              onClick={() => vote(stars)}
              onFocus={() => setCursor(stars)}
              onPointerEnter={() => {
                if (asleep || forced) return
                setPreview(stars)
                audio.play(`star.hover.${stars}`)
              }}
            >
              <Cursor />
              <svg className={styles.glyph} viewBox="-34 -33 68 66" aria-hidden="true" focusable="false">
                <path d={STAR_PATH} strokeWidth={3.4} strokeLinejoin="round" />
              </svg>
              <Key tone={on ? 'marked' : 'dark'} aria-hidden="true">
                {stars}
              </Key>
              <small className={styles.word} aria-hidden="true">
                {word(stars)}
              </small>
              {sparks && sparks.sparks[0]?.star === stars && (
                <span
                  className={styles.sparks}
                  aria-hidden="true"
                  style={{ opacity: sparks.opacity }}
                  data-fx=""
                >
                  {sparks.sparks.map((spark) => (
                    <span
                      key={spark.id}
                      className={styles.spark}
                      data-tone={spark.tone}
                      style={{ '--dx': spark.dx, '--dy': spark.dy } as CSSProperties}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {asleep && (
        <div className={styles.asleep}>
          <Meter
            className={styles.meter}
            value={heard}
            max={threshold}
            label={t('ui.stars.listen')}
            valueText={t('ui.stars.listenValue', { heard, threshold })}
            caption={{ start: t('ui.stars.listen'), end: t('ui.stars.listenCaption', { heard, threshold }) }}
          />
          <p id={reasonId} className={styles.reason}>
            {t('ui.stars.asleep', { threshold, left: threshold - heard })}
          </p>
        </div>
      )}
      <p className={styles.status} data-status={forced ? state : status.kind}>
        {statusText}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  )
}

function savedText(stars: number, next: boolean): string {
  return `${t('ui.stars.saved', { stars, word: word(stars) })} ${t(next ? 'ui.stars.savedNext' : 'ui.stars.savedChange')}`
}

function visibleStatus(status: Status, next: boolean): string {
  switch (status.kind) {
    case 'saving':
      return t('ui.stars.saving')
    case 'saved':
      return savedText(status.stars, next && !status.changed)
    case 'error':
      return t('ui.stars.error')
    default:
      return ''
  }
}

/** Estados de la galería: cuánto se rellena, cuál está marcada y qué dice. */
function forcedFill(state: StarsState | undefined): number {
  switch (state) {
    case 'hover':
    case 'focus':
      return 3
    case 'pressed':
    case 'loading':
    case 'success':
      return 4
    default:
      return 0
  }
}

function forcedChecked(state: StarsState | undefined): number | null {
  return state === 'loading' || state === 'success' ? 4 : null
}

function forcedStatus(state: StarsState | undefined): string {
  switch (state) {
    case 'loading':
      return t('ui.stars.saving')
    case 'success':
      return savedText(4, true)
    case 'error':
      return t('ui.stars.error')
    default:
      return ''
  }
}

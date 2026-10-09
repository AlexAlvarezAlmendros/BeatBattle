import { MUSICAL_KEYS, type MusicalKey } from '@beatbattle/shared'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { Announcer } from '../../ui/Announcer'
import { Button } from '../../ui/Button'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { VinylSun } from '../../ui/VinylSun'
import styles from './DropReveal.module.css'
import { musicalKeyName } from './weekModel'

/**
 * Línea de tiempo de la revelación (§3.8.2; los tiempos internos de una ceremonia viven aquí, §3.6).
 * En ms desde que empieza.
 */
export const REVEAL_TIMELINE = {
  announce: 300,
  vinyl: 900,
  needle: 1600,
  title: 2100,
  slots: 2500,
  slotsFixed: 3700,
  total: 6000,
  /** Sin movimiento: un fundido con los datos ya fijos. */
  reducedTotal: 2500,
  /** Cuánto suenan los primeros compases del sample antes de bajar. */
  sampleFadeAt: 5200,
} as const

const SLOT_STEP_MS = 70

export interface DropRevealWeek {
  number: number
  title: string
  bpm: number | null
  musicalKey: MusicalKey | null
  streamUrl: string
}

type Stage = 'dark' | 'announce' | 'vinyl' | 'needle' | 'title' | 'slots' | 'fixed'
const ORDER: readonly Stage[] = ['dark', 'announce', 'vinyl', 'needle', 'title', 'slots', 'fixed']
const reached = (stage: Stage, target: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(target)

/**
 * Revelación del drop, «¡NUEVO ESCENARIO!» (§3.8.2, `RF-DROP-11`; tarea 3.17): la primera visita a una
 * semana nueva. La arena se oscurece, el anunciador dice «SEMANA 41», el vinilo-sol cae girando, la aguja
 * se posa (`drop.needle`) y suenan los primeros compases mientras el título se estampa y BPM y tonalidad
 * giran como una tragaperras hasta fijarse. 6 s, saltable (Esc, Intro, «Saltar» o un clic). Sin
 * movimiento, un fundido con los datos ya fijos. Nada suena si no ha habido antes un gesto (§3.7.1): el
 * motor está bloqueado y `play` no hace nada.
 */
export function DropReveal({ week, onDone }: { week: DropRevealWeek; onDone: () => void }) {
  const reduced = useReducedMotion()
  const [stage, setStage] = useState<Stage>(reduced ? 'fixed' : 'dark')
  const [slot, setSlot] = useState(0)
  const skipRef = useRef<HTMLButtonElement>(null)
  const sampleRef = useRef<HTMLAudioElement | null>(null)
  const done = useRef(false)

  const finish = useRef(() => {})
  finish.current = () => {
    if (done.current) return
    done.current = true
    sampleRef.current?.pause()
    onDone()
  }

  useEffect(() => {
    skipRef.current?.focus()
    if (reduced) {
      const timer = window.setTimeout(() => finish.current(), REVEAL_TIMELINE.reducedTotal)
      return () => window.clearTimeout(timer)
    }
    const at = (ms: number, run: () => void) => window.setTimeout(run, ms)
    const timers = [
      at(REVEAL_TIMELINE.announce, () => setStage('announce')),
      at(REVEAL_TIMELINE.vinyl, () => setStage('vinyl')),
      at(REVEAL_TIMELINE.needle, () => {
        setStage('needle')
        audio.play('drop.needle')
        if (audio.unlocked) {
          const player = new Audio(week.streamUrl)
          player.crossOrigin = 'anonymous'
          player.volume = 0.8
          sampleRef.current = player
          void player.play().catch(() => {})
        }
      }),
      at(REVEAL_TIMELINE.title, () => setStage('title')),
      at(REVEAL_TIMELINE.slots, () => setStage('slots')),
      at(REVEAL_TIMELINE.slotsFixed, () => setStage('fixed')),
      at(REVEAL_TIMELINE.sampleFadeAt, () => {
        const player = sampleRef.current
        if (player) player.volume = 0.3
      }),
      at(REVEAL_TIMELINE.total, () => finish.current()),
    ]
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      sampleRef.current?.pause()
    }
  }, [reduced, week.streamUrl])

  // La tragaperras: BPM y tonalidad cambian cada 70 ms hasta fijarse.
  useEffect(() => {
    if (stage !== 'slots') return
    const timer = window.setInterval(() => setSlot((value) => value + 1), SLOT_STEP_MS)
    return () => window.clearInterval(timer)
  }, [stage])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        finish.current()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  const spinning = stage === 'slots'
  const bpm = week.bpm === null ? null : spinning ? 60 + ((slot * 37) % 120) : Math.round(week.bpm)
  const key = week.musicalKey
    ? spinning
      ? (MUSICAL_KEYS[(slot * 7) % MUSICAL_KEYS.length] as MusicalKey)
      : week.musicalKey
    : null

  return createPortal(
    <div
      className={styles.reveal}
      data-stage={stage}
      data-reduced={reduced || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={t('reveal.label', { number: week.number })}
      // Esc e Intro saltan desde el documento (arriba); el clic en cualquier parte, aquí.
      onClick={() => finish.current()}
      onKeyDown={() => {}}
    >
      <div className={styles.shade} aria-hidden="true" />
      {reached(stage, 'announce') && (
        <Announcer className={styles.announcer} text={t('reveal.week', { number: week.number })} />
      )}
      <div className={styles.stageArea} aria-hidden="true">
        {(reached(stage, 'vinyl') || reduced) && (
          <div className={styles.vinylDrop}>
            <VinylSun
              className={styles.vinyl}
              label={`S${week.number}`}
              sub={week.bpm ? `${Math.round(week.bpm)} BPM` : ''}
              bpm={week.bpm ?? 90}
            />
            {reached(stage, 'needle') && <span className={styles.needle} />}
          </div>
        )}
      </div>
      {(reached(stage, 'title') || reduced) && (
        <div className={styles.titleBlock}>
          <p className={`bb-display ${styles.title}`}>{week.title}</p>
          <p className={styles.chips} aria-live="off">
            {bpm !== null && (
              <span className={styles.chip} data-spinning={spinning || undefined}>
                <b>{bpm}</b>&nbsp;BPM
              </span>
            )}
            {key && (
              <span className={styles.chip} data-spinning={spinning || undefined}>
                <b>{musicalKeyName(key)}</b>
              </span>
            )}
          </p>
        </div>
      )}
      <Button
        ref={skipRef}
        className={styles.skip}
        variant="outline"
        size="sm"
        onClick={(event) => {
          event.stopPropagation()
          finish.current()
        }}
        keyHint={t('frame.keys.glyph.escape')}
      >
        {t('reveal.skip')}
      </Button>
    </div>,
    document.body,
  )
}

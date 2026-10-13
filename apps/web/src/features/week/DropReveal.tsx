import { MUSICAL_KEYS, type MusicalKey } from '@beatbattle/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { Announcer } from '../../ui/Announcer'
import { Button } from '../../ui/Button'
import { DataChip } from '../../ui/Chip'
import { useFitText } from '../../ui/hooks/useFitText'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { OtpSlapImage } from '../../ui/OtpSlap'
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
  /** Sin movimiento: la capa entera funde con los datos ya fijos. */
  reducedTotal: 2500,
  /** Cuánto suenan los primeros compases del sample antes de bajar. */
  sampleFadeAt: 5200,
} as const

const SLOT_STEP_MS = 70
/** Teclas que la revelación se queda (el menú de detrás no las ve mientras está abierta). */
const SWALLOWED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'])

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
 * semana nueva. Un velo opaco tapa la arena, el anunciador dice «SEMANA 41», el vinilo-sol cae girando, la
 * aguja se posa (`drop.needle`) y suenan los primeros compases mientras el título se estampa y BPM y
 * tonalidad giran como una tragaperras hasta fijarse. 6 s, saltable (Esc, Intro, «Saltar» o un clic). Sin
 * movimiento, la capa entera funde con los datos ya fijos. Nada suena si no ha habido antes un gesto
 * (§3.7.1): el motor está bloqueado y `play` no hace nada.
 *
 * Es un diálogo modal de verdad: el resto de la página queda `inert`, las flechas y el tabulador no llegan
 * al menú de detrás y, al acabar, el foco vuelve a donde estaba. Lleva su propia firma (la pegatina, como la
 * ceremonia, §3.1), porque el velo tapa la barra.
 */
export function DropReveal({ week: initial, onDone }: { week: DropRevealWeek; onDone: () => void }) {
  // Los datos se fijan al empezar: la home vuelve a pedir la semana (al montar, al cambiar de sesión) y cada
  // respuesta trae otra URL firmada del sample; si la línea de tiempo dependiera de ella, volvería a empezar
  // a mitad (jurado de la 3.21, quinto pase).
  const [week] = useState(initial)
  const reduced = useReducedMotion()
  const [stage, setStage] = useState<Stage>(reduced ? 'fixed' : 'dark')
  const [slot, setSlot] = useState(0)
  const skipRef = useRef<HTMLButtonElement>(null)
  const sampleRef = useRef<HTMLAudioElement | null>(null)
  const done = useRef(false)
  const detailsId = useId()
  const titleRef = useRef<HTMLParagraphElement>(null)
  // Antes de partir, baja la anchura y el cuerpo (como el alias, §3.3); si aun así no cabe, parte.
  useFitText(titleRef, reached(stage, 'title') ? week.title : '', { minFontPx: 32 })

  const finish = useRef(() => {})
  finish.current = () => {
    if (done.current) return
    done.current = true
    sampleRef.current?.pause()
    onDone()
  }

  // Modal: lo de detrás, `inert`; el foco vuelve a donde estaba al cerrarse.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    skipRef.current?.focus()
    return () => {
      root?.removeAttribute('inert')
      if (previous?.isConnected && previous !== document.body) previous.focus()
    }
  }, [])

  useEffect(() => {
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
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        finish.current()
      } else if (SWALLOWED.has(event.key)) {
        event.preventDefault()
        event.stopPropagation()
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc e Intro saltan desde el documento (arriba)
    <div
      className={styles.reveal}
      data-stage={stage}
      data-reduced={reduced || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={t('reveal.label', { number: week.number })}
      aria-describedby={detailsId}
      onClick={() => finish.current()}
    >
      <p id={detailsId} className="sr-only">
        {t('reveal.details', {
          title: week.title,
          bpm: week.bpm === null ? '—' : Math.round(week.bpm),
          key: week.musicalKey ? musicalKeyName(week.musicalKey) : '—',
        })}
      </p>
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.stack}>
        <div className={styles.announcerSlot}>
          {reached(stage, 'announce') && (
            <Announcer className={styles.announcer} text={t('reveal.week', { number: week.number })} silent />
          )}
        </div>
        <div className={styles.stageArea} aria-hidden="true">
          {reached(stage, 'vinyl') && (
            <div className={styles.vinylDrop}>
              <VinylSun
                className={styles.vinyl}
                label={`S${week.number}`}
                sub={week.bpm ? `${Math.round(week.bpm)} BPM` : ''}
                bpm={week.bpm ?? 90}
              />
              {reached(stage, 'needle') && (
                <span className={styles.arm}>
                  <span className={styles.pivot} />
                  <span className={styles.needle} />
                </span>
              )}
            </div>
          )}
        </div>
        <div className={styles.titleBlock} aria-hidden="true">
          {reached(stage, 'title') && (
            <>
              <p ref={titleRef} className={`bb-display ${styles.title}`}>
                {week.title}
              </p>
              <p className={styles.chips}>
                {bpm !== null && (
                  <DataChip
                    className={styles.chip}
                    data-spinning={spinning || undefined}
                    value={bpm}
                    unit="BPM"
                  />
                )}
                {key && (
                  <DataChip
                    className={styles.chip}
                    data-spinning={spinning || undefined}
                    value={musicalKeyName(key)}
                    word
                  />
                )}
              </p>
            </>
          )}
        </div>
      </div>
      <div className={styles.foot}>
        <span className={styles.signature} aria-hidden="true">
          <OtpSlapImage size="bar" />
        </span>
        <Button
          ref={skipRef}
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
      </div>
    </div>,
    document.body,
  )
}

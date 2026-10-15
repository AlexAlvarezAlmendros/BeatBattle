import { loudestWindowMs } from '@beatbattle/audio'
import type { ResultRow, WeekResults } from '@beatbattle/shared'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { Announcer } from '../../ui/Announcer'
import { Button } from '../../ui/Button'
import { GenerativeCover } from '../../ui/CoverArt'
import { flash } from '../../ui/flash/flash'
import { cx } from '../../ui/forceState'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { Medal, type MedalPlace } from '../../ui/Medal'
import { OtpSlapImage } from '../../ui/OtpSlap'
import { usePlayer } from '../player/store'
import { entryTrack } from '../player/tracks'
import { decodePeaks } from '../week/weekModel'
import styles from './ResultsCeremony.module.css'
import { scoreOf } from './score'

/**
 * Línea de tiempo de la ceremonia (§3.8.6; sus tiempos internos viven aquí y no en tokens, §3.6). En ms desde
 * que empieza: luces fuera con el redoble y «¡SELLADO!»; del 10.º al 4.º en ráfaga (uno cada 600 ms, menos de 2
 * por segundo); el 3.º, el 2.º y el 1.º con su foco, la medalla que baja, el sello que se arranca y el alias que
 * pasa a productor, sonando el momento más enérgico de su beat; 2 s de latido antes del 1.º; «¡CAMPEÓN!»; y tu
 * resultado.
 */
export const CEREMONY_TIMELINE = {
  sealed: 300,
  burst: 2000,
  burstStep: 600,
  places: { 3: 7000, 2: 11_500, 1: 17_500 },
  heartbeat: 15_500,
  /** Desde que baja el foco de un puesto: el sello se arranca y el alias pasa a productor. */
  tear: 600,
  tearMs: 600,
  name: 1200,
  nameMs: 400,
  /** Lo que suena de cada beat (6 s el 1.º). */
  snippetMs: 4000,
  championSnippetMs: 6000,
  champion: 19_500,
  mine: 23_500,
  total: 26_500,
} as const

/** Puestos que cruzan en ráfaga (§3.8.6): del 10.º al 4.º. */
const BURST_FROM = 10
const BURST_TO = 4
const CONFETTI = 24

type Reveal = 'spot' | 'tear' | 'name'

/**
 * La ceremonia de resultados (§3.8.6, `RF-RES-09`; tarea 6.17): una capa a pantalla completa por encima del
 * marco, como la revelación del drop (§3.8.2), modal de verdad (lo de detrás, `inert`) y saltable con Esc,
 * Intro, «Saltar» o un clic; al acabar (o al saltarla) avisa con `onDone` y la página de resultados queda
 * debajo. Repetible desde «Repetir la ceremonia». Sin movimiento, los mismos pasos por fundidos. Los destellos
 * (el confeti) piden permiso al limitador (`RD-MOT-04`); nada suena sin un gesto antes (§3.7.1).
 */
export function ResultsCeremony({ results, onDone }: { results: WeekResults; onDone: () => void }) {
  const [data] = useState(results)
  const reduced = useReducedMotion()
  const [elapsed, setElapsed] = useState<string[]>([])
  const [confetti, setConfetti] = useState<{ area: number; opacity: number } | null>(null)
  const [live, setLive] = useState('')
  const skipRef = useRef<HTMLButtonElement>(null)
  const done = useRef(false)
  const podium = data.rows.filter((row) => isMedal(row.result.position))
  const burst = data.rows
    .filter((row) => {
      const position = row.result.position
      return position !== null && position >= BURST_TO && position <= BURST_FROM
    })
    .sort((a, b) => (b.result.position ?? 0) - (a.result.position ?? 0))
  const reached = (event: string) => elapsed.includes(event)

  const finish = useRef(() => {})
  finish.current = () => {
    if (done.current) return
    done.current = true
    usePlayer.getState().pause()
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: la línea de tiempo se monta una vez
  useEffect(() => {
    const T = CEREMONY_TIMELINE
    const mark = (event: string) => setElapsed((list) => [...list, event])
    const at = (ms: number, run: () => void) => window.setTimeout(run, ms)
    const timers: number[] = []
    const schedule = (ms: number, run: () => void) => timers.push(at(ms, run))

    audio.play('cer.drumroll')
    schedule(T.sealed, () => mark('sealed'))
    burst.forEach((row, index) => {
      schedule(T.burst + index * T.burstStep, () => {
        mark(`burst:${row.entry.id}`)
        audio.play('ui.move')
      })
    })
    for (const row of podium) {
      const place = row.result.position as MedalPlace
      const start = T.places[place]
      const snippet = place === 1 ? T.championSnippetMs : T.snippetMs
      schedule(start, () => {
        mark(`place:${place}`)
        const peaks = row.entry.peaks ? decodePeaks(row.entry.peaks) : []
        const fromMs = loudestWindowMs(peaks, row.entry.durationMs, snippet)
        usePlayer.getState().play(entryTrack(row.entry, { votable: false }), { fromMs })
      })
      schedule(start + T.tear, () => {
        mark(`tear:${place}`)
        audio.play('cer.tear')
      })
      schedule(start + T.name, () => {
        mark(`name:${place}`)
        audio.play('cer.reveal')
        setLive(
          t('ceremony.place', {
            position: place,
            producer: producerOf(row),
            score: scoreOf(row.result.scoreMilli),
          }),
        )
      })
      schedule(start + snippet, () => {
        if (usePlayer.getState().track?.id === row.entry.id) usePlayer.getState().pause()
      })
    }
    if (podium.some((row) => row.result.position === 1)) {
      schedule(T.heartbeat, () => audio.play('cer.heartbeat'))
      schedule(T.champion, () => {
        mark('champion')
        audio.play('cer.airhorn')
        audio.play('cer.confetti')
        const grant = reduced ? null : flash.request({ reason: 'ceremony', area: 0.25, opacity: 0.4 })
        if (grant) setConfetti({ area: grant.area, opacity: grant.opacity })
      })
    }
    if (data.mine) schedule(T.mine, () => mark('mine'))
    schedule(T.total, () => finish.current())
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      usePlayer.getState().pause()
    }
  }, [])

  // Esc, Intro o espacio la saltan; las flechas y el tabulador no llegan a la página de detrás.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        finish.current()
      } else if (event.key.startsWith('Arrow') || event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  // El puesto que está en escena: el último cuyo foco ha bajado.
  const current = [...podium]
    .sort((a, b) => (b.result.position ?? 0) - (a.result.position ?? 0))
    .filter((row) => reached(`place:${row.result.position}`))
    .at(-1)
  const showMine = reached('mine') && data.mine
  const inBurst = reached('sealed') && !current && !showMine

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc e Intro la saltan desde el documento (arriba)
    <div
      className={styles.ceremony}
      data-reduced={reduced || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={t('ceremony.label', { number: data.week.number })}
      onClick={() => finish.current()}
      style={
        {
          '--cer-tear': `${CEREMONY_TIMELINE.tearMs}ms`,
          '--cer-name': `${CEREMONY_TIMELINE.nameMs}ms`,
          '--cer-burst': `${CEREMONY_TIMELINE.burstStep * 2}ms`,
        } as React.CSSProperties
      }
    >
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.announcerSlot} aria-hidden="true">
        {reached('champion') && !showMine ? (
          <Announcer key="champion" className={styles.announcer} text={t('ceremony.champion')} silent />
        ) : inBurst ? (
          <Announcer key="sealed" className={styles.announcer} text={t('ceremony.sealed')} silent />
        ) : null}
      </div>

      {inBurst && (
        <div className={styles.burst} aria-hidden="true">
          {burst
            .filter((row) => reached(`burst:${row.entry.id}`))
            .map((row) => (
              <div key={row.entry.id} className={styles.burstCard}>
                <b>{row.result.position}.º</b> {producerOf(row)} · {scoreOf(row.result.scoreMilli)}
              </div>
            ))}
        </div>
      )}

      {current && !showMine && (
        <Spotlight
          key={current.entry.id}
          row={current}
          reveal={
            reached(`name:${current.result.position}`)
              ? 'name'
              : reached(`tear:${current.result.position}`)
                ? 'tear'
                : 'spot'
          }
          champion={reached('champion') && current.result.position === 1}
        />
      )}

      {confetti && (
        <div
          className={styles.confetti}
          aria-hidden="true"
          style={
            {
              '--confetti-size': `${Math.round(Math.sqrt(confetti.area) * 100)}%`,
              opacity: confetti.opacity,
            } as React.CSSProperties
          }
        >
          {Array.from({ length: CONFETTI }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: piezas fijas
              key={index}
              data-tone={index % 3}
              style={{ '--i': index } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {showMine && data.mine && <MineCard row={data.mine} />}

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
          {t('ceremony.skip')}
        </Button>
      </div>
    </div>,
    document.body,
  )
}

const isMedal = (position: number | null): position is MedalPlace =>
  position === 1 || position === 2 || position === 3

const producerOf = (row: ResultRow) => row.entry.producer?.displayName ?? t('results.deletedProducer')

/** Un puesto del podio bajo su foco: la medalla baja, el sello se arranca y el alias pasa a productor. */
function Spotlight({ row, reveal, champion }: { row: ResultRow; reveal: Reveal; champion: boolean }) {
  const place = row.result.position as MedalPlace
  return (
    <div className={styles.spot} data-place={place} data-reveal={reveal} aria-hidden="true">
      <div className={styles.beam} />
      {champion && (
        <svg className={styles.crown} viewBox="0 0 100 52" aria-hidden="true">
          <path d="M8 48 L4 12 L28 30 L50 4 L72 30 L96 12 L92 48 Z" />
        </svg>
      )}
      <Medal place={place} className={styles.medal} />
      <div className={styles.cover}>
        {row.entry.cover.kind === 'own' ? (
          <img src={row.entry.cover.url} alt="" />
        ) : (
          <GenerativeCover
            seed={row.entry.cover.seed}
            bpm={row.entry.bpm}
            musicalKey={row.entry.musicalKey}
          />
        )}
        <span className={cx(styles.seal, styles.sealA)}>{t('results.hiddenA')}</span>
        <span className={cx(styles.seal, styles.sealB)}>{t('results.hiddenB')}</span>
      </div>
      <p className={styles.position}>{place}.º</p>
      <div className={styles.names}>
        {reveal === 'name' ? (
          <>
            <span className={cx('bb-display', styles.producer)}>{producerOf(row)}</span>
            <span className={styles.aliasX}>{row.entry.alias}</span>
          </>
        ) : (
          <span className={cx('bb-display', styles.alias)}>{row.entry.alias}</span>
        )}
      </div>
      {reveal === 'name' && (
        <p className={styles.score}>
          {scoreOf(row.result.scoreMilli)} · {t('results.votes', { count: row.result.votes })}
        </p>
      )}
    </div>
  )
}

/** Tu resultado, al final, si participaste. */
function MineCard({ row }: { row: ResultRow }) {
  const { position, scoreMilli, votes } = row.result
  return (
    <div className={styles.mine} aria-hidden="true">
      <span className={styles.mineTag}>{t('results.mine.label')}</span>
      <p className={cx('bb-display', styles.minePosition)}>
        {position ? `${position}.º` : t('results.mine.unranked')}
      </p>
      <p className={styles.mineScore}>
        {t('ceremony.mineScore', { score: scoreOf(scoreMilli), votes: t('results.votes', { count: votes }) })}
      </p>
    </div>
  )
}

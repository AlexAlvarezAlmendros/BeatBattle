import { SEASON_FANFARE_HIT } from '@beatbattle/audio'
import type { PublicProfile } from '@beatbattle/shared'
import { duration } from '@beatbattle/shared/tokens'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { audio } from '../../audio/engine'
import { formatNumber, LOCALE, t } from '../../i18n'
import { ApiClientError } from '../../net/api'
import { profileQuery, seasonQuery } from '../../net/game'
import { Announcer } from '../../ui/Announcer'
import { Button } from '../../ui/Button'
import { flash } from '../../ui/flash'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { OtpSlapImage } from '../../ui/OtpSlap'
import { ProducerCard, profileCard } from '../../ui/ProducerCard'
import { TitlePlate } from '../../ui/TitlePlate'
import styles from './SeasonCeremony.module.css'
import { seasonLabel } from './season'

/**
 * Línea de tiempo de la ceremonia del campeón de temporada (§3.8.15; sus tiempos internos viven aquí y no en tokens,
 * §3.6), en ms desde que empieza: la placa de fin de temporada con la entrada de `cer.season`; la carta estampada en el
 * acorde de la fanfarria (`SEASON_FANFARE_HIT`, `RD-MOT-02`) con el anunciador y el confeti; las cifras; y se cierra
 * sola.
 */
export const SEASON_CEREMONY_TIMELINE = {
  card: Math.round(SEASON_FANFARE_HIT * 1000),
  line: 1000,
  total: 6000,
} as const

/** Piezas del confeti. */
const CONFETTI = 20

type Card = Omit<ReturnType<typeof profileCard>, 'unlocked'>

/** Lo que cuenta la ceremonia: la temporada, las cifras de la primera fila y la carta de cada campeón con perfil. */
export interface SeasonChampionsView {
  seasonId: string
  /** Las cifras de la primera fila de la clasificación (los ex aequo empatan en todo, §2.9). */
  points: number
  wins: number
  podiums: number
  champions: { name: string; card: Card }[]
}

/**
 * Los campeones de una temporada cerrada, de lo público (§3.8.15): la primera fila de su clasificación
 * (`GET /api/seasons/:id/standings`) y el perfil de cada uno para su carta, con la variante de campeón. `null` si
 * ninguno tiene ya perfil («Productor eliminado»): no hay carta que enseñar. Lanza si no se puede cargar (o si la
 * temporada aún no está cerrada).
 */
export async function loadSeasonChampions(
  seasonId: string,
  signal?: AbortSignal,
): Promise<SeasonChampionsView | null> {
  const standings = await seasonQuery(seasonId).queryFn({ signal })
  if (!standings.season.closed) throw new Error(`La temporada ${seasonId} aún no está cerrada`)
  const top = standings.rows.filter((row) => row.position === 1)
  const first = top[0]
  if (!first) return null
  const profiles = await Promise.all(
    top.map(async (row): Promise<PublicProfile | null> => {
      if (!row.producer) return null
      try {
        return await profileQuery(row.producer.username).queryFn({ signal })
      } catch (error) {
        // Borrado entre las dos lecturas: como «Productor eliminado».
        if (error instanceof ApiClientError && error.status === 404) return null
        throw error
      }
    }),
  )
  const champions = profiles.flatMap((profile) => {
    if (!profile) return []
    const { unlocked: _unlocked, ...card } = profileCard(profile)
    return [{ name: profile.displayUsername, card: { ...card, variant: 'champion' as const } }]
  })
  if (champions.length === 0) return null
  return { seasonId, points: first.points, wins: first.wins, podiums: first.podiums, champions }
}

/**
 * La ceremonia del campeón de temporada (§3.8.15, `RF-ARC-05`; tarea 7.27), en el trozo diferido que pide
 * `SeasonCeremonyHost`: carga los campeones y, con ellos, enseña la capa. `onDone(true)` al acabar o saltarla (o si no
 * hay carta que enseñar): queda vista; `onDone(false)` si no se ha podido cargar: sigue pendiente.
 */
export function SeasonCeremony({
  seasonId,
  champion,
  onDone,
}: {
  seasonId: string
  /** ¿Es quien mira uno de los campeones? (`me.game.seasonCeremony.champion`). */
  champion: boolean
  onDone: (seen: boolean) => void
}) {
  const [view, setView] = useState<SeasonChampionsView | null>(null)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const controller = new AbortController()
    loadSeasonChampions(seasonId, controller.signal).then(
      (loaded) => {
        if (controller.signal.aborted) return
        if (loaded) setView(loaded)
        else done.current(true)
      },
      (error) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar la ceremonia de temporada', error)
        done.current(false)
      },
    )
    return () => controller.abort()
  }, [seasonId])
  return view ? <SeasonCeremonyLayer view={view} you={champion} onDone={() => done.current(true)} /> : null
}

/** Los pasos de la línea de tiempo, en orden. */
const STEPS = ['title', 'card', 'line'] as const
type Step = (typeof STEPS)[number]

/** Lo que dice la línea de las cifras y la región viva. */
function headlineOf(view: SeasonChampionsView, you: boolean): string {
  const season = seasonLabel(view.seasonId)
  const tie = view.champions.length > 1
  if (you) return t(tie ? 'ceremony.season.headlineYouTie' : 'ceremony.season.headlineYou', { season })
  return t(tie ? 'ceremony.season.headlineTie' : 'ceremony.season.headline', { season })
}

function statsOf(view: SeasonChampionsView): string {
  return t('ceremony.season.stats', {
    points: formatNumber(view.points),
    wins: t('ceremony.season.wins', { count: view.wins }),
    podiums: t('ceremony.season.podiums', { count: view.podiums }),
  })
}

/**
 * La capa de la ceremonia (§3.8.15): modal a pantalla completa por encima del marco (lo de detrás, `inert`), con su
 * línea de tiempo y `cer.season`. Se salta con cualquier tecla, toque, clic o «Saltar» pasados los primeros 280 ms (la
 * tecla que cerró la capa anterior no se la lleva); M silencia además de saltarla. Sin movimiento, fundidos y la carta
 * plana; el confeti pide permiso al limitador (`RD-MOT-04`) y el modo serio no lo autoriza.
 */
export function SeasonCeremonyLayer({
  view,
  you,
  onDone,
}: {
  view: SeasonChampionsView
  you: boolean
  onDone: () => void
}) {
  const reduced = useReducedMotion()
  const [step, setStep] = useState<Step>('title')
  const [confetti, setConfetti] = useState<{ area: number; opacity: number } | null>(null)
  const [live, setLive] = useState('')
  const skipRef = useRef<HTMLButtonElement>(null)
  /** ¿Ya se puede saltar? Pasados los primeros `--bb-dur-slam` (la tecla que cerró la capa anterior no se la lleva). */
  const armed = useRef(false)
  const finished = useRef(false)
  const finish = useRef(() => {})
  finish.current = () => {
    if (finished.current) return
    finished.current = true
    onDone()
  }
  const tie = view.champions.length > 1
  const headline = headlineOf(view, you)
  const stats = statsOf(view)

  // Modal: lo de detrás, `inert`; el foco vuelve a donde estaba al cerrarse.
  useEffect(() => {
    const arm = window.setTimeout(() => {
      armed.current = true
    }, duration.slam)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    skipRef.current?.focus()
    return () => {
      window.clearTimeout(arm)
      root?.removeAttribute('inert')
      if (previous?.isConnected && previous !== document.body) previous.focus()
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: la línea de tiempo se monta una vez
  useEffect(() => {
    const T = SEASON_CEREMONY_TIMELINE
    const timers = [
      window.setTimeout(() => {
        setStep('card')
        const names = new Intl.ListFormat(LOCALE, { type: 'conjunction' }).format(
          view.champions.map((item) => item.name),
        )
        setLive(t('ceremony.season.live', { headline, names, stats }))
        if (reduced) return
        // Un destello, con el área y la opacidad que autoriza el limitador (en modo serio, ninguno).
        const grant = flash.request({ reason: 'ceremony', area: 0.25, opacity: 0.4 })
        if (grant) setConfetti({ area: grant.area, opacity: grant.opacity })
      }, T.card),
      window.setTimeout(() => setStep('line'), T.line),
      window.setTimeout(() => finish.current(), T.total),
    ]
    // La fanfarria desde el primer instante: su acorde cae con la carta (`SEASON_FANFARE_HIT`).
    audio.play('cer.season')
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [])

  // Cualquier tecla la salta (Tab y las de modificador no); ninguna llega a la pantalla de detrás, salvo M, que además
  // silencia (la del marco).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return
      const mute = event.key === 'm' || event.key === 'M'
      if (!mute) {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === 'Tab' || !armed.current) return
      finish.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  const reached = (at: Step) => STEPS.indexOf(step) >= STEPS.indexOf(at)

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: las teclas la saltan desde el documento (arriba)
    <div
      className={styles.ceremony}
      data-reduced={reduced || undefined}
      data-season-ceremony={view.seasonId}
      data-step={step}
      role="dialog"
      aria-modal="true"
      aria-label={t('ceremony.season.label', { season: seasonLabel(view.seasonId) })}
      onClick={() => {
        if (armed.current) finish.current()
      }}
    >
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      <div className={styles.shade} aria-hidden="true" />
      <TitlePlate
        aria-hidden="true"
        className={styles.plate}
        kicker={t('ceremony.season.kicker')}
        title={seasonLabel(view.seasonId)}
      />
      <div className={styles.announcerSlot} aria-hidden="true">
        {reached('card') && (
          <Announcer
            className={styles.announcer}
            text={t('ceremony.season.announcer', { count: view.champions.length })}
            silent
          />
        )}
      </div>
      <div className={styles.stage}>
        {reached('card') && <span className={styles.beam} aria-hidden="true" />}
        {confetti && (
          <div
            className={styles.confetti}
            data-fx=""
            aria-hidden="true"
            style={
              {
                '--confetti-size': `${Math.round(Math.sqrt(confetti.area) * 100)}%`,
                opacity: confetti.opacity,
              } as CSSProperties
            }
          >
            {Array.from({ length: CONFETTI }, (_, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: piezas fijas
                key={index}
                data-tone={index % 3}
                style={{ '--i': index } as CSSProperties}
              />
            ))}
          </div>
        )}
        {reached('card') && (
          <ul
            className={styles.cards}
            data-tie={tie || undefined}
            style={{ '--cards': view.champions.length } as CSSProperties}
          >
            {view.champions.map(({ name, card }) => (
              <li key={`${card.cardNumber}-${name}`} className={styles.slot}>
                <ProducerCard {...card} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.line} aria-hidden="true">
        {reached('line') && (
          <>
            <p className={styles.headline} data-you={you || undefined}>
              {headline}
            </p>
            <p className={styles.stats}>{stats}</p>
          </>
        )}
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
          {t('ceremony.skip')}
        </Button>
      </div>
    </div>,
    document.body,
  )
}

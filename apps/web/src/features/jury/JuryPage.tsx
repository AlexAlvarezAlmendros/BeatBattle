import { type AchievementId, listenThresholdMs, XP_VOTE } from '@beatbattle/rules'
import type { PublicEntry } from '@beatbattle/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DocumentTitle } from '../../app/DocumentTitle'
import { type ControlKey, useControlKeys } from '../../app/layout/screen'
import { FrameSlot } from '../../app/layout/slots'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { audio } from '../../audio/engine'
import { formatDuration, t } from '../../i18n'
import { queryKeys } from '../../net/queryKeys'
import { juryQueue } from '../../net/votes'
import { Announcer } from '../../ui/Announcer'
import { Button } from '../../ui/Button'
import { DataChip } from '../../ui/Chip'
import { GenerativeCover } from '../../ui/CoverArt'
import { Frame } from '../../ui/Frame'
import { JurySilhouette } from '../../ui/JurySilhouette'
import { Meter } from '../../ui/Meter'
import { Stamp } from '../../ui/Stamp'
import { Stars } from '../../ui/Stars'
import { Waveform } from '../../ui/Waveform'
import { useSession } from '../account/session'
import { AchievementBadge } from '../game/AchievementBadge'
import { useListenReceipt } from '../player/listen'
import { usePlayer } from '../player/store'
import { entryTrack } from '../player/tracks'
import { ReportDialog } from '../vote/ReportDialog'
import { starsListen, useVote } from '../vote/useVote'
import { decodePeaks, musicalKeyName } from '../week/weekModel'
import styles from './JuryPage.module.css'

/** Tras votar, lo que se espera antes de cambiar de entrada (la confirmación dice «en 1 s», §3.8.4). */
const NEXT_AFTER_VOTE_MS = 1000
/** El combo llega hasta ×8 (§3.4.2). */
const COMBO_MAX = 8

const GATE_KEYS: readonly ControlKey[] = ['enter', 'back', 'sound']
const JURY_KEYS: readonly ControlKey[] = ['rate', 'pause', 'seek', 'skip', 'report', 'exit', 'sound']
const JURY_KEYS_ON_STARS: readonly ControlKey[] = ['rate', 'pause', 'note', 'skip', 'report', 'exit', 'sound']

/** ¿La tecla va a un campo o a un botón (que ya la atiende)? */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  )
}

/**
 * `/jurado` — el Modo Jurado (guía §2.7, §3.8.7; tarea 5.18): **TÚ contra una entrada**. La cola de la semana
 * (las ajenas sin votar, en Ronda justa; `?desde=<id>` empieza por esa) suena sola desde el principio, igualada
 * siempre a −14 LUFS, y la siguiente se precarga. Las estrellas despiertan con la escucha mínima; votar con
 * clic o 1–5 pasa a la siguiente con el cambio por la diagonal (`jury.swap`) y sube el combo de la sesión
 * (`combo.up`). Teclas: 1–5 puntuar, Espacio pausa, ←/→ buscan en la onda (con el cursor en las estrellas,
 * eligen nota y la barra dice «←→ NOTA»), S salta (al final de la cola), R denuncia, Esc sale. Al vaciar la
 * cola, «¡JURADO COMPLETO!» con cuántas has puntuado y tu media dada.
 *
 * Integridad: nunca dos entradas en pantalla con estrellas, sin barra de vida ni «K.O.»; la entrada se nombra
 * por su alias y la trama no reacciona a ella (`RD-MOT-06`, el reproductor va como fuente ciega).
 */
export function JuryPage() {
  const status = useSession((state) => state.status)
  const me = useSession((state) => state.me)
  if (status === 'loading') return <p className={styles.loading}>{t('jury.loading')}</p>
  if (!me?.emailVerified) return <JuryGate signedIn={me !== null} />
  return <JuryArena />
}

/**
 * Sin cuenta o sin el email verificado, el Modo Jurado no se juega (votar pide la cuenta verificada,
 * `RF-VOTE-06`): la pantalla lo dice con la silueta del jurado y lleva a entrar o a verificar.
 */
function JuryGate({ signedIn }: { signedIn: boolean }) {
  // Aquí no se puntúa: la barra enseña las teclas de la puerta, no las del jurado.
  useControlKeys(GATE_KEYS)
  return (
    <ScreenPage
      title={t('pages.jury.title')}
      summary={signedIn ? t('jury.gate.verify') : t('jury.gate.signIn')}
      piece={<JurySilhouette className={styles.gateSilhouette} />}
      actions={
        <Button to={signedIn ? paths.verify() : paths.signIn()} keyHint={t('frame.keys.glyph.enter')}>
          {signedIn ? t('jury.gate.verifyAction') : t('jury.gate.signInAction')}
        </Button>
      }
    />
  )
}

/** El Modo Jurado de una cuenta verificada. */
function JuryArena() {
  const [params] = useSearchParams()
  const from = params.get('desde')
  const me = useSession((state) => state.me)
  const queue = useQuery({
    queryKey: queryKeys.jury.queue(),
    queryFn: ({ signal }) => juryQueue(undefined, signal),
    // La cola se pide una vez por visita: votar y saltar la ordenan aquí (los votos de otros no la mueven).
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })
  const [skipped, setSkipped] = useState<string[]>([])
  const [done, setDone] = useState<{ id: string; stars: number }[]>([])
  const [combo, setCombo] = useState(0)
  const [swap, setSwap] = useState(0)
  const [reporting, setReporting] = useState(false)
  const [onStars, setOnStars] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // La cola de esta visita: sin las votadas aquí, la de `?desde` primero y las saltadas al final.
  const order = useMemo(() => {
    const list = (queue.data?.queue ?? []).filter((entry) => !done.some((item) => item.id === entry.id))
    const first = from ? list.filter((entry) => entry.id === from) : []
    const rest = list.filter((entry) => entry.id !== from)
    const fresh = rest.filter((entry) => !skipped.includes(entry.id))
    const later = skipped.flatMap((id) => rest.filter((entry) => entry.id === id))
    return [...first, ...fresh, ...later]
  }, [queue.data, done, skipped, from])
  const entry: PublicEntry | undefined = order[0]
  const following = order[1]
  const total = queue.data?.round.total ?? 0
  // La ronda cuenta desde lo que ya había puntuado al entrar (la cola se vuelve a pedir tras cada voto).
  const base = useRef<number | null>(null)
  if (queue.data && base.current === null) base.current = queue.data.round.done
  const round = (base.current ?? 0) + done.length + 1
  useControlKeys(onStars ? JURY_KEYS_ON_STARS : JURY_KEYS)

  // Suena sola desde el principio, igualada siempre; la siguiente, precargada.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar de entrada
  useEffect(() => {
    if (!entry) return
    const track = entryTrack(entry, { votable: true })
    usePlayer.getState().play(track, { equalize: 'always', queue: [track] })
    setNotice(null)
  }, [entry?.id])
  useEffect(() => {
    if (!following) return
    const next = new Audio()
    next.preload = 'auto'
    next.crossOrigin = 'anonymous'
    next.src = following.streamUrl
    return () => {
      next.removeAttribute('src')
      next.load()
    }
  }, [following])
  // Al salir, deja de sonar (el Modo Jurado no se lleva su entrada a otras pantallas).
  useEffect(() => () => usePlayer.getState().stop(), [])

  const status = usePlayer((state) => (state.track?.id === entry?.id ? state.status : 'idle'))
  const positionMs = usePlayer((state) => (state.track?.id === entry?.id ? state.positionMs : 0))
  const receipt = useListenReceipt(entry?.id)
  const thresholdMs = entry ? listenThresholdMs(entry.durationMs) : 30_000
  const listen = starsListen(receipt, thresholdMs)
  const awake = receipt?.qualified === true
  const { vote } = useVote(entry ?? { id: '', weekSlug: '' })

  const goNext = (skip: boolean) => {
    if (!entry) return
    audio.play('jury.swap')
    setSwap((n) => n + 1)
    if (skip) setSkipped((list) => [...list.filter((id) => id !== entry.id), entry.id])
  }
  // Si el audio no carga, lo dice y pasa a la siguiente (`RF-PLAY-09`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: al pasar a error
  useEffect(() => {
    if (status !== 'error' || !entry) return
    setNotice(t('jury.loadError', { alias: entry.alias }))
    goNext(true)
  }, [status])

  const starsRef = useRef<HTMLDivElement>(null)
  const comboRef = useRef<HTMLDivElement>(null)
  // Los logros de esta visita: «¡JURADO COMPLETO!» enseña el suyo si llega (§3.8.7).
  const earned = useRef<AchievementId[]>([])
  // Las teclas del Modo Jurado, estén donde estén el foco y el cursor (§3.8.7).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || reporting) return
      if (typing(event.target) || !entry) return
      const inStars = starsRef.current?.contains(event.target as Node) ?? false
      const key = event.key
      if (/^[1-5]$/.test(key) && !inStars) {
        event.preventDefault()
        starsRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[Number(key) - 1]?.click()
      } else if (key === ' ') {
        // Espacio pausa esté donde esté el cursor (§3.8.7), también sobre un botón o una estrella.
        event.preventDefault()
        usePlayer.getState().toggle()
      } else if ((key === 'ArrowLeft' || key === 'ArrowRight') && !inStars) {
        const onWave = (event.target as HTMLElement | null)?.getAttribute?.('role') === 'slider'
        if (onWave) return
        event.preventDefault()
        usePlayer.getState().seek(positionMs + (key === 'ArrowRight' ? 5000 : -5000))
      } else if (key === 's' || key === 'S') {
        event.preventDefault()
        goNext(true)
      } else if (key === 'r' || key === 'R') {
        event.preventDefault()
        setReporting(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (queue.isPending) return <p className={styles.loading}>{t('jury.loading')}</p>
  if (queue.isError)
    return (
      <div className={styles.complete}>
        <p className={styles.completeText} role="alert">
          {t('jury.queueError')}
        </p>
        <Button onClick={() => void queue.refetch()}>{t('player.retry')}</Button>
      </div>
    )
  if (!entry)
    return (
      <JuryComplete
        votes={done.map((item) => item.stars)}
        total={total}
        empty={done.length === 0}
        earned={earned.current}
      />
    )

  const seconds = entry.durationMs / 1000
  const left = Math.max(0, Math.ceil((thresholdMs - (receipt?.listenedMs ?? 0)) / 1000))
  const announcer = awake ? t('jury.ann.ready') : t('jury.ann.listen')
  const name = me?.displayUsername || me?.username || t('jury.you')

  return (
    <div className={styles.screen} data-swap={swap % 2 === 0 ? 'a' : 'b'}>
      <DocumentTitle page={t('pages.jury.title')} />
      <h1 className="sr-only">{t('jury.srTitle', { round, total, alias: entry.alias })}</h1>
      <FrameSlot name="hudPlayer">
        <div className={styles.hudYou}>
          <p className={styles.hudName}>
            <span className={styles.p1}>{t('ui.cursor.player')}</span> {t('jury.you')}{' '}
            <span className="bb-label">{t('jury.juror')}</span>
          </p>
          <Meter
            className={styles.listenMeter}
            value={Math.min(thresholdMs, receipt?.listenedMs ?? 0)}
            max={thresholdMs}
            label={t('jury.listenMeter')}
            valueText={t('jury.listenText', {
              heard: Math.min(Math.round(thresholdMs / 1000), Math.floor((receipt?.listenedMs ?? 0) / 1000)),
              total: Math.round(thresholdMs / 1000),
            })}
            caption={{
              start: t('jury.listenMeter'),
              end: awake
                ? t('jury.listenDone', { total: Math.round(thresholdMs / 1000) })
                : t('jury.listenText', {
                    heard: Math.min(
                      Math.round(thresholdMs / 1000),
                      Math.floor((receipt?.listenedMs ?? 0) / 1000),
                    ),
                    total: Math.round(thresholdMs / 1000),
                  }),
            }}
          />
        </div>
      </FrameSlot>
      <FrameSlot name="hudCenter">
        <Frame variant="title" cut="md" className={styles.round}>
          <p className="bb-label">{t('jury.round', { round: String(round).padStart(2, '0'), total })}</p>
          <p className={styles.counter} aria-hidden="true">
            {awake ? t('jury.counterReady') : String(left).padStart(2, '0')}
          </p>
          <p className="bb-label">{awake ? t('jury.counterReadyText') : t('jury.counterText')}</p>
        </Frame>
      </FrameSlot>
      <FrameSlot name="hudRight">
        <div className={styles.hudEntry}>
          <p className={styles.hudAlias}>
            <span className="bb-label">{t('jury.blind')}</span>{' '}
            <span className="bb-display">{entry.alias}</span>
          </p>
          <p className={styles.hidden}>{t('jury.hidden')}</p>
        </div>
      </FrameSlot>

      <section className={styles.arena} aria-label={t('jury.arenaLabel')}>
        <div className={styles.you}>
          <JurySilhouette className={styles.silhouette} />
          <p className={`bb-display ${styles.youBig}`} aria-hidden="true">
            {t('jury.you')}
          </p>
          <p className={styles.youPlate}>
            {t('jury.youPlate', { name, votes: (base.current ?? 0) + done.length })}
          </p>
        </div>
        {/* En móvil, la fila «[silueta] VS ALIAS» con la ronda (el HUD no lleva placa ni lado derecho). */}
        <div className={styles.mobileHead}>
          <p className="bb-label">
            {t('jury.round', { round: String(round).padStart(2, '0'), total })} ·{' '}
            {awake ? t('jury.counterReady') : t('jury.mobileCounter', { left })}
          </p>
          <p className={`bb-display ${styles.mobileAlias}`}>{entry.alias}</p>
          <p className={styles.mobileHidden}>{t('jury.hiddenShort')}</p>
        </div>
        <div className={styles.versus}>
          <Announcer
            text={announcer}
            variant="tag"
            tone={awake ? 'cta' : 'white'}
            className={styles.announcer}
          />
          <p className={`bb-display ${styles.vs}`} aria-hidden="true">
            {t('jury.vs')}
          </p>
          <p className={styles.alone}>{t('jury.alone')}</p>
        </div>
        <div className={styles.entry} key={`${entry.id}-${swap}`}>
          <Frame variant="title" cut="lg" className={styles.cover}>
            {entry.cover.kind === 'own' ? (
              <img src={entry.cover.url} alt="" />
            ) : (
              <GenerativeCover seed={entry.cover.seed} bpm={entry.bpm} musicalKey={entry.musicalKey} />
            )}
            <Stamp size="sm" turn={-4} className={styles.stamp}>
              {t('jury.hiddenShort')}
            </Stamp>
          </Frame>
          <p className={styles.title}>
            <span className="bb-label">{t('entryPage.titleLabel')}</span> {entry.title}
          </p>
          <div className={styles.chips}>
            {entry.bpm !== null && <DataChip value={Math.round(entry.bpm)} unit={t('home.stage.bpmUnit')} />}
            {entry.musicalKey && <DataChip value={musicalKeyName(entry.musicalKey)} word />}
            <DataChip value={formatDuration(seconds)} unit={t('home.stage.minUnit')} />
            {entry.genres[0] && <DataChip value={entry.genres[0]} word />}
          </div>
        </div>
      </section>

      <Frame as="section" cut="lg" className={styles.panel} aria-label={t('jury.panelLabel')}>
        <div className={styles.wave}>
          <Waveform
            peaks={entry.peaks ? decodePeaks(entry.peaks) : []}
            height={56}
            playhead
            progress={seconds > 0 ? Math.min(1, positionMs / 1000 / seconds) : 0}
            duration={seconds}
            threshold={{
              at: Math.min(1, thresholdMs / entry.durationMs),
              label: t('jury.thresholdMark', { s: Math.round(thresholdMs / 1000) }),
            }}
            onSeek={(fraction) => usePlayer.getState().seek(fraction * entry.durationMs)}
          />
          <p className={styles.waveFoot}>
            <span className={styles.time}>
              {formatDuration(positionMs / 1000)} / {formatDuration(seconds)}
            </span>
            <span>{t('entryPage.equalized')}</span>
          </p>
        </div>
        <div className={styles.combo}>
          <p className={styles.comboHead}>
            <span className={`bb-display ${styles.comboCount}`}>×{combo}</span>{' '}
            <span className={styles.comboLabels}>
              <span className="bb-label">{t('jury.combo')}</span>{' '}
              <span className="bb-label">{t('jury.comboXp', { xp: XP_VOTE })}</span>
            </span>
          </p>
          {/* El «+5 XP» de cada voto nace a su derecha (§3.4.2). */}
          <div ref={comboRef}>
            <Meter
              value={Math.min(combo, COMBO_MAX)}
              max={COMBO_MAX}
              label={t('jury.combo')}
              valueText={t('jury.comboText', { count: combo })}
            />
          </div>
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: solo sigue si el cursor está en las estrellas (la barra dice «NOTA») */}
        <div
          ref={starsRef}
          className={styles.stars}
          onFocus={() => setOnStars(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOnStars(false)
          }}
        >
          <Stars
            key={entry.id}
            label={t('entryPage.starsLabel', { alias: entry.alias })}
            value={null}
            listen={listen}
            next
            onVote={async (stars) => {
              const nextCombo = Math.min(combo + 1, COMBO_MAX)
              const cast = await vote(stars, { anchor: comboRef.current, combo: nextCombo })
              earned.current = [...earned.current, ...cast.game.achievements]
              setCombo(nextCombo)
              audio.play('combo.up', { xpCombo: nextCombo })
              window.setTimeout(() => {
                setDone((list) => [...list, { id: entry.id, stars }])
                goNext(false)
              }, NEXT_AFTER_VOTE_MS)
            }}
          />
        </div>
        <div className={styles.actions}>
          <Button
            variant="outline"
            size="sm"
            keyHint={t('frame.keys.glyph.space')}
            onClick={() => usePlayer.getState().toggle()}
          >
            {status === 'playing' || status === 'loading' ? t('jury.pause') : t('jury.play')}
          </Button>
          <Button variant="outline" size="sm" keyHint={t('frame.keys.glyph.s')} onClick={() => goNext(true)}>
            {t('jury.skip')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            keyHint={t('frame.keys.glyph.r')}
            onClick={() => setReporting(true)}
          >
            {t('jury.report')}
          </Button>
        </div>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
      </Frame>
      <ReportDialog
        entryId={entry.id}
        alias={entry.alias}
        open={reporting}
        onClose={() => setReporting(false)}
      />
    </div>
  )
}

/**
 * «¡JURADO COMPLETO!» (§3.8.7): cuántas ha puntuado en esta visita y su media dada (sus propios votos) y, si el último
 * voto lo ha dado, el logro «Jurado completo» con su insignia (tarea 7.21; su aviso sale además en el HUD).
 */
function JuryComplete({
  votes,
  total,
  empty,
  earned,
}: {
  votes: readonly number[]
  total: number
  empty: boolean
  earned: readonly AchievementId[]
}) {
  const mean = votes.length ? votes.reduce((sum, stars) => sum + stars, 0) / votes.length : 0
  return (
    <div className={styles.complete}>
      <DocumentTitle page={t('pages.jury.title')} />
      <Announcer text={t('jury.ann.complete')} variant="display" />
      <h1 className={styles.completeTitle}>
        {empty && total === 0 ? t('jury.emptyTitle') : t('jury.completeTitle')}
      </h1>
      <p className={styles.completeText}>
        {votes.length > 0
          ? t('jury.completeText', {
              count: votes.length,
              mean: mean.toLocaleString('es-ES', { maximumFractionDigits: 1 }),
            })
          : total === 0
            ? t('jury.emptyText')
            : t('jury.allVotedText')}
      </p>
      {earned.includes('jury_full') && (
        <Frame cut="base" className={styles.completeBadge}>
          <AchievementBadge id="jury_full" kicker={t('game.notice.unlocked')} />
        </Frame>
      )}
      <Button to={paths.home()}>{t('jury.backToMenu')}</Button>
    </div>
  )
}

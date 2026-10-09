import type { PitchClass } from '@beatbattle/audio'
import { parseMusicalKey } from '@beatbattle/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { DocumentTitle } from '../../app/DocumentTitle'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { queryKeys } from '../../net/queryKeys'
import { useCurrentWeek } from '../../net/weeks'
import { playerOf, useSession } from '../account/session'
import { DropReveal } from './DropReveal'
import { rememberDropSeen, seenLocally } from './dropSeen'
import { MainMenu } from './menu/MainMenu'
import type { MenuModel } from './menu/model'
import { menuWeekOf, nextBoundary, nextDropText, whenText } from './weekModel'

/** Mensajes de la crónica con el calendario vacío (§3.8.3). */
export const IDLE_CHRONICLE = [
  'home.chronicle.idle.nextDrop',
  'home.chronicle.idle.everyMonday',
  'home.chronicle.idle.flip',
  'home.chronicle.idle.vote',
  'home.chronicle.idle.seal',
] as const

/** Margen tras una frontera antes de volver a pedir la semana (el servidor ya ha cambiado de fase). */
const BOUNDARY_SLACK_MS = 1000

/**
 * `/` — el menú principal (guía §3.8.3) con la semana en juego de `GET /api/weeks/current` (Fase 3): la
 * tarjeta del escenario con el sample que suena, el reloj de ronda hasta el cierre y, sin semana, cuándo
 * cae el próximo drop o «Próximo drop pronto» (`RF-DROP-04`) con «Avísame del próximo drop». En cada
 * frontera vuelve a pedir la semana: la home cambia sola de semana (hito de la Fase 3).
 */
export function HomePage() {
  const me = useSession((state) => state.me)
  const { data } = useCurrentWeek()
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())

  // En la siguiente frontera (drop, cierre de envíos o de votos), otra vez la semana.
  useEffect(() => {
    if (!data) return
    const at = nextBoundary(data, Date.now())
    if (at === null) return
    const timer = window.setTimeout(
      () => {
        setNow(Date.now())
        void queryClient.invalidateQueries({ queryKey: queryKeys.weeks.current() })
      },
      Math.max(0, at - Date.now() + BOUNDARY_SLACK_MS),
    )
    return () => window.clearTimeout(timer)
  }, [data, queryClient])

  // Al entrar o salir cambia lo de quien mira (bases, revelación vista): otra vez la semana.
  const meId = me?.id ?? null
  // biome-ignore lint/correctness/useExhaustiveDependencies: se vuelve a pedir justo cuando cambia la cuenta
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.weeks.all })
  }, [meId, queryClient])

  // Los efectos tonales van en la tonalidad del sample de la semana (§3.7.1).
  const key = data?.week?.sample.musicalKey
  useEffect(() => {
    if (!key) return
    const { tonic, mode } = parseMusicalKey(key)
    audio.setKey({ tonic: tonic as PitchClass, mode })
  }, [key])

  const week = data?.week ? menuWeekOf(data.week, now) : null

  // La revelación del drop (§3.8.2, `RF-DROP-11`): la primera visita a cada semana, tras la pantalla de título.
  const live = data?.week ?? null
  const [revealDone, setRevealDone] = useState<string | null>(null)
  const sessionKnown = useSession((state) => state.status !== 'loading')
  const unseen =
    live !== null &&
    week !== null &&
    sessionKnown &&
    revealDone !== live.slug &&
    !(live.viewer?.dropSeen ?? false) &&
    !seenLocally(live.slug)
  const reveal = unseen ? (
    <DropReveal
      week={{
        number: live.number,
        title: live.sample.title,
        bpm: live.sample.bpm,
        musicalKey: live.sample.musicalKey,
        streamUrl: live.sample.streamUrl,
      }}
      onDone={() => {
        setRevealDone(live.slug)
        void rememberDropSeen(live.slug, Boolean(me))
      }}
    />
  ) : null
  const model: MenuModel = {
    week,
    player: me ? playerOf(me) : null,
    season: data?.week ? (data.week.seasonId.split('-')[1] ?? null) : null,
    champion: null,
    lastSealed: null,
    chronicle:
      week && data?.week
        ? [
            t('home.chronicle.live.drop', { title: week.title }),
            ...(week.bpm && week.musicalKey
              ? [t('home.chronicle.live.sample', { bpm: week.bpm, key: week.musicalKey })]
              : []),
            t('home.chronicle.live.closes', { when: whenText(data.week.submitEndsAt, now) }),
          ]
        : IDLE_CHRONICLE.map((message) => t(message)),
    nextDrop: data?.next ? nextDropText(data.next.startsAt) : null,
  }
  return (
    <>
      <DocumentTitle />
      <MainMenu model={model} afterTitle={reveal} />
    </>
  )
}

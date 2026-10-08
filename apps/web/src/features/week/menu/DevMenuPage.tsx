import { useSearchParams } from 'react-router'
import { DocumentTitle } from '../../../app/DocumentTitle'
import { t } from '../../../i18n'
import { samplePeaks } from '../../../ui/gallery/samples'
import { MainMenu } from './MainMenu'
import type { MenuModel, MenuPlayer, MenuWeek } from './model'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** La semana de las maquetas aprobadas (`01-menu.html`): semana 41, «Lluvia en Gràcia». */
function sampleWeek(phase: MenuWeek['phase']): MenuWeek {
  return {
    phase,
    number: 41,
    title: t('dev.menu.week.title'),
    credits: t('dev.menu.week.credits'),
    range: t('dev.menu.week.range'),
    code: '2026-W41',
    bpm: 92,
    musicalKey: t('dev.menu.week.key'),
    durationSeconds: 72,
    genre: t('dev.menu.week.genre'),
    peaks: samplePeaks('sample-41'),
    challenge: t('dev.menu.week.challenge'),
    entries: 23,
    closesAt:
      Date.now() +
      (phase === 'open' ? 4 * DAY + 7 * HOUR + 12 * MINUTE + 45 * SECOND : 3 * HOUR + 59 * MINUTE),
    when: t(phase === 'open' ? 'dev.menu.week.when' : 'dev.menu.week.whenVoting'),
    clockWhen: t(phase === 'open' ? 'dev.menu.week.clockWhen' : 'dev.menu.week.clockWhenVoting'),
    weekBar: phase === 'open' ? { today: 2, progress: 0.36 } : { today: 6, progress: 0.84 },
  }
}

const SAMPLE_PLAYER: MenuPlayer = {
  name: 'LilBru',
  initials: 'LB',
  level: 7,
  rank: '',
  xp: { value: 2980, min: 2650, max: 3350 },
  uploaded: false,
  unvoted: 16,
}

/**
 * `/dev/menu` — el menú principal con los datos de muestra de las maquetas aprobadas, para compararlo
 * con ellas (`docs/planning/evidence/f0/arena/01-menu-*.png`). Solo en desarrollo. Parámetros:
 * `?estado=abierta` (por defecto), `votacion` o `vacio`; `?visitante` quita la sesión; `?subida`, el
 * jugador ya ha subido su entrada; `?titulo` enseña la pantalla de título aunque ya se haya visto (1.13).
 */
export function DevMenuPage() {
  const [params] = useSearchParams()
  const state = params.get('estado') ?? 'abierta'
  const visitor = params.has('visitante')
  const week = state === 'vacio' ? null : sampleWeek(state === 'votacion' ? 'voting' : 'open')
  const model: MenuModel = {
    week,
    player: visitor
      ? null
      : {
          ...SAMPLE_PLAYER,
          rank: t('rank.beatmaker'),
          uploaded: params.has('subida'),
          season: { label: t('dev.menu.player.season'), value: t('dev.menu.player.seasonValue') },
          streak: 3,
        },
    season: 'T4',
    champion: {
      producer: 'KAIRO.WAV',
      week: 40,
      title: t('dev.menu.champion.title'),
      score: t('dev.menu.champion.score'),
    },
    lastSealed: { number: 40, unseen: true },
    chronicle: [t('dev.menu.chronicle.entry'), t('dev.menu.chronicle.days'), t('dev.menu.chronicle.votes')],
  }
  return (
    <>
      <DocumentTitle page={t('dev.menu.title')} />
      <MainMenu model={model} title={params.has('titulo') || undefined} />
    </>
  )
}

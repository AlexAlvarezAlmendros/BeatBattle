/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Img } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { Ticket } from '../components/Ticket'
import { useEmail } from '../context'
import { achievementName, type GameRarity, RARITY_NAMES, xpText } from '../game'
import type { EmailTemplate } from '../template'

/**
 * Lo que encola el cierre de una temporada (`seasonWrapStatements`, `apps/server/src/modules/seasons/wrap.ts`), en el
 * `batch` que la cierra: la temporada de quien la recibe, toda de semanas selladas (§2.12.7). Nada de la temporada
 * siguiente, que puede estar ya en juego (`RF-NOTIF-13`).
 */
export interface SeasonWrapPayload {
  /** «2026-T4». */
  seasonId: string
  /** Su nombre: la carta (la imagen OG del perfil, `/api/og/profile/:username.png`) y el botón a su perfil. */
  username: string | null
  /** Su fila en la clasificación de la temporada, o `null` si no clasificó ninguna semana. */
  standing: { position: number; total: number; points: number; wins: number; podiums: number } | null
  /** Los campeones (uno o varios ex aequo) por su nombre; vacío si nadie clasificó. */
  champions: string[]
  /** Es uno de ellos. */
  champion: boolean
  /** Semanas de la temporada con una entrada suya en el snapshot (clasificada o no). */
  weeksPlayed: number
  /** Su mejor puesto en una semana de la temporada, o `null`. */
  bestPosition: number | null
  /** Votos que contaron en los snapshots de la temporada. */
  votesCast: number
  /** Los logros de la temporada (los de sus semanas y los sin semana del trimestre), en el orden del catálogo. */
  achievements: { id: string; rarity: GameRarity; xp: number }[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const ordinal = (position: number) => `${position}.º`
const list = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '')

/** «T4 de 2026». */
export function seasonLabel(seasonId: string): string {
  const [year, quarter] = seasonId.split('-')
  return `${quarter} de ${year}`
}

function subject(p: SeasonWrapPayload): string {
  return p.champion ? `¡Campeón de la ${seasonLabel(p.seasonId)}!` : `Tu ${seasonLabel(p.seasonId)} en cifras`
}

function preheader(p: SeasonWrapPayload): string {
  const votes = plural(p.votesCast, 'voto', 'votos')
  if (p.standing)
    return `${ordinal(p.standing.position)} de ${p.standing.total} con ${plural(p.standing.points, 'punto', 'puntos')}, ${plural(p.weeksPlayed, 'semana', 'semanas')} en juego y ${votes}.`
  const champions = p.champions.length ? ` Ya hay ${p.champions.length > 1 ? 'campeones' : 'campeón'}.` : ''
  return p.weeksPlayed
    ? `${plural(p.weeksPlayed, 'semana', 'semanas')} en juego y ${votes}.${champions}`
    : `${votes} como jurado y ${plural(p.achievements.length, 'logro', 'logros')}.${champions}`
}

function headline(p: SeasonWrapPayload): string {
  if (p.champion) return '¡Campeón de la temporada!'
  if (p.standing) return `${ordinal(p.standing.position)} de ${p.standing.total}`
  return p.weeksPlayed ? 'Tu temporada, sin clasificar' : 'Tu temporada como jurado'
}

function WrapBody({ p }: { p: SeasonWrapPayload }) {
  const { publicUrl } = useEmail()
  const label = seasonLabel(p.seasonId)
  const profileUrl = p.username
    ? `${publicUrl}/p/${encodeURIComponent(p.username)}`
    : `${publicUrl}/ajustes/perfil`
  return (
    <Layout preheader={preheader(p)}>
      <Card>
        <Kicker>Temporada {label} · cerrada</Kicker>
        <Heading>{headline(p)}</Heading>
        <Paragraph>
          {p.standing
            ? `${plural(p.standing.points, 'punto', 'puntos')} en la clasificación de la temporada, con ${plural(p.standing.wins, 'victoria', 'victorias')} y ${plural(p.standing.podiums, 'podio', 'podios')}.`
            : p.weeksPlayed
              ? `Has jugado ${plural(p.weeksPlayed, 'semana', 'semanas')} y ninguna ha llegado a clasificar: hacen falta 3 votos.`
              : 'No has subido ningún flip esta temporada, pero tus votos han decidido sus podios.'}
        </Paragraph>
        <Paragraph muted>
          {p.champions.length === 0
            ? 'Nadie ha clasificado: la temporada se queda sin campeón.'
            : p.champion
              ? p.champions.length > 1
                ? `Campeones ex aequo: ${list(p.champions)}. Tu carta ya lleva la corona.`
                : 'Tu carta ya lleva la corona.'
              : `${p.champions.length > 1 ? 'Campeones ex aequo' : 'Campeón'}: ${list(p.champions)}.`}
        </Paragraph>
        <Button href={`${publicUrl}/temporada/${p.seasonId}`}>Ver la clasificación</Button>
      </Card>
      <Card>
        <Kicker>La temporada en cifras</Kicker>
        <Ticket
          code={`TEMPORADA ${p.seasonId}`}
          labelWidth={184}
          rows={[
            ['Semanas jugadas', String(p.weeksPlayed)],
            ['Mejor puesto', p.bestPosition ? ordinal(p.bestPosition) : '—'],
            ['Votos emitidos', String(p.votesCast)],
            ['Logros', String(p.achievements.length)],
          ]}
        />
        {p.achievements.map((a) => (
          <Paragraph key={a.id}>
            <strong>{achievementName(a.id)}</strong> · logro {RARITY_NAMES[a.rarity]} · +{xpText(a.xp)}
          </Paragraph>
        ))}
      </Card>
      {p.username ? (
        <Card>
          <Kicker>Tu carta del trimestre</Kicker>
          <Img
            src={`${publicUrl}/api/og/profile/${encodeURIComponent(p.username)}.png`}
            width="512"
            height="269"
            alt={`Carta de productor de ${p.username}${p.standing ? `, ${ordinal(p.standing.position)} de la temporada ${label}` : ''}`}
            style={{ display: 'block', width: '100%', maxWidth: '512px', height: 'auto', margin: '0 0 16px' }}
          />
          <Button href={profileUrl}>Ver mi carta</Button>
          <Paragraph muted>
            La temporada siguiente ya está en juego: lo que ganes en sus semanas sale en tu carta cuando se
            sellan.
          </Paragraph>
        </Card>
      ) : null}
    </Layout>
  )
}

/**
 * `season.wrap` (§2.12, §2.12.7, Anexo H): «Tu T4 de 2026 en cifras», al cerrar la temporada, a quien participó o votó
 * en ella: su puesto, el campeón, semanas jugadas, mejor puesto, votos emitidos, logros y su carta.
 */
export const seasonWrap: EmailTemplate<SeasonWrapPayload> = {
  subject,
  preheader,
  fixture: {
    seasonId: '2026-T4',
    username: 'mar_beats',
    standing: { position: 3, total: 12, points: 182, wins: 2, podiums: 7 },
    champions: ['kairo.wav'],
    champion: false,
    weeksPlayed: 13,
    bestPosition: 1,
    votesCast: 214,
    achievements: [
      { id: 'streak_8', rarity: 'epic', xp: 150 },
      { id: 'win', rarity: 'epic', xp: 150 },
      { id: 'golden_ear', rarity: 'epic', xp: 150 },
    ],
  },
  body: (p) => <WrapBody p={p} />,
}

/** Variantes para la galería: la campeona y quien solo votó. */
export const SEASON_WRAP_CHAMPION_FIXTURE: SeasonWrapPayload = {
  seasonId: '2026-T4',
  username: 'kairo.wav',
  standing: { position: 1, total: 12, points: 287, wins: 6, podiums: 11 },
  champions: ['kairo.wav'],
  champion: true,
  weeksPlayed: 13,
  bestPosition: 1,
  votesCast: 98,
  achievements: [
    { id: 'win_3', rarity: 'legendary', xp: 300 },
    { id: 'double', rarity: 'legendary', xp: 300 },
    { id: 'season_champ', rarity: 'legendary', xp: 300 },
  ],
}

export const SEASON_WRAP_JUROR_FIXTURE: SeasonWrapPayload = {
  seasonId: '2026-T4',
  username: 'oido.fino',
  standing: null,
  champions: ['kairo.wav', 'nuria.beats'],
  champion: false,
  weeksPlayed: 0,
  bestPosition: null,
  votesCast: 149,
  achievements: [{ id: 'votes_100', rarity: 'rare', xp: 75 }],
}

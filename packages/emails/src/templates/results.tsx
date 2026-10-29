/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Img } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { Ticket } from '../components/Ticket'
import { useEmail } from '../context'
import { xpText } from '../game'

/**
 * «Tu partida» (§2.12.7; tarea 7.31): lo que el sellado de esta semana le da a quien recibe el email. Solo de la semana
 * sellada: ni el XP en vivo de la que abre ni el total de la cuenta (`RF-NOTIF-13`).
 */
export interface ResultsGame {
  /** XP del sellado de la semana (resultado y oído de oro), el de la revisión vigente al encolar. */
  xp: number
  /** El del oído de oro, dentro de `xp` (0 si no lo ganó). */
  goldenEarXp: number
  /** Racha tras el sellado (semanas selladas con entrada clasificada). */
  streak: number
  /** El comodín de la temporada la salvó esta semana. */
  jokerSaved: boolean
  /** Bonus de XP de la semana siguiente si clasifica (puntos porcentuales, §2.10). */
  nextBonusPercent: number
}

/**
 * Los resultados de una semana sellada en un email (§2.12.2, §3.8.12; tarea 6.9): arriba del Lunes de batalla
 * o solos en `battle.results`. Solo salen tras el sellado (`RF-NOTIF-13`): el servidor no encola nada antes.
 */
export interface ResultsBlock {
  weekNumber: number
  slug: string
  sampleTitle: string
  /** La clasificación se re-selló (`RF-RES-06`). */
  corrected: boolean
  /** Hasta tres puestos (con empates, puede haber dos primeros). Vacío si nadie llegó a 3 votos. */
  podium: { position: number; title: string; producer: string | null; score: string }[]
  /** El resultado de quien participó; `null` para jurados, el resto de cuentas y los suscriptores. */
  mine: {
    position: number | null
    title: string
    score: string
    votes: number
    /** La tarjeta de resultado firmada (`/api/og/result/…`, §4.19.5). */
    cardUrl: string
  } | null
  /** Semana desierta: nadie subió nada (`RF-RES-10`). */
  empty: boolean
  /**
   * «Tu partida» (tarea 7.31): `null` a quien no gana nada ni tiene racha y a los suscriptores; sin el campo, los
   * encolados antes de la Fase 7.
   */
  game?: ResultsGame | null
}

/** «2.º». */
export const ordinal = (position: number) => `${position}.º`

/** El dato del asunto: «2.º en la #42», «Ya hay campeón»… */
export function resultsHeadline(r: ResultsBlock): string {
  if (r.empty) return `Semana #${r.weekNumber} desierta`
  if (r.mine?.position) return `${ordinal(r.mine.position)} en la #${r.weekNumber}`
  return r.podium.length ? 'Ya hay campeón' : `Resultados de la #${r.weekNumber}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** «Tu partida»: la tira troquelada del ticket con el XP del sellado, el oído de oro y la racha. */
export function GameStrip({ g }: { g: ResultsGame }) {
  const resultXp = g.xp - g.goldenEarXp
  const rows: [string, string][] = []
  if (resultXp > 0) rows.push(['Resultado', `+${xpText(resultXp)}`])
  if (g.goldenEarXp > 0) rows.push(['Oído de oro', `+${xpText(g.goldenEarXp)}`])
  if (g.streak > 0)
    rows.push([
      'Racha',
      `${plural(g.streak, 'semana', 'semanas')}${g.jokerSaved ? ' · salvada por el comodín' : ''}`,
    ])
  return (
    <>
      <Ticket code={g.xp > 0 ? `TU PARTIDA · +${xpText(g.xp)}` : 'TU PARTIDA'} rows={rows} labelWidth={136} />
      {g.goldenEarXp > 0 ? (
        <Paragraph>Oído de oro: tus estrellas anticiparon el criterio del resto del jurado.</Paragraph>
      ) : null}
      {g.streak > 0 && g.nextBonusPercent > 0 ? (
        <Paragraph muted>
          Si clasificas la semana que viene, la racha sube a {g.streak + 1} y tu XP de subir y de resultado
          lleva un +{g.nextBonusPercent} %.
        </Paragraph>
      ) : null}
    </>
  )
}

export function ResultsCard({ r }: { r: ResultsBlock }) {
  const { publicUrl } = useEmail()
  const url = `${publicUrl}/semana/${r.slug}/resultados`
  return (
    <Card>
      <Kicker>
        Semana #{r.weekNumber} · {r.corrected ? 'clasificación corregida' : 'resultados oficiales'}
      </Kicker>
      {r.mine ? (
        <>
          <Heading>
            {r.mine.position ? `Has quedado ${ordinal(r.mine.position)}` : 'Tu beat, sin clasificar'}
          </Heading>
          <Img
            src={r.mine.cardUrl}
            width="512"
            height="269"
            alt={
              r.mine.position
                ? `${ordinal(r.mine.position)} en la semana #${r.weekNumber}: ${r.mine.score} de puntuación con ${plural(r.mine.votes, 'voto', 'votos')}`
                : `Sin clasificar en la semana #${r.weekNumber}: ${plural(r.mine.votes, 'voto', 'votos')}`
            }
            style={{ display: 'block', width: '100%', maxWidth: '512px', height: 'auto', margin: '0 0 16px' }}
          />
          <Paragraph>
            «{r.mine.title}»{' '}
            {r.mine.position
              ? `acaba ${ordinal(r.mine.position)} con ${r.mine.score} de puntuación y ${plural(r.mine.votes, 'voto', 'votos')}.`
              : `se queda con ${plural(r.mine.votes, 'voto', 'votos')}: para entrar en la clasificación hacen falta 3.`}
          </Paragraph>
        </>
      ) : (
        <Heading>{r.empty ? 'Semana desierta' : r.podium.length ? 'Ya hay campeón' : 'Resultados'}</Heading>
      )}
      {r.empty ? (
        <Paragraph>Nadie subió su flip de «{r.sampleTitle}». El de esta semana te espera abajo.</Paragraph>
      ) : r.podium.length ? (
        <>
          <Paragraph muted>Podio de «{r.sampleTitle}»:</Paragraph>
          {r.podium.map((row) => (
            <Paragraph key={`${row.position}-${row.title}`}>
              <strong>{ordinal(row.position)}</strong> «{row.title}» · {row.producer ?? 'Productor eliminado'}{' '}
              · {row.score}
            </Paragraph>
          ))}
        </>
      ) : (
        <Paragraph>Ninguna entrada llegó a 3 votos: esta semana no hay podio.</Paragraph>
      )}
      {r.game ? <GameStrip g={r.game} /> : null}
      {r.corrected ? (
        <Paragraph muted>La clasificación se corrigió tras el sellado: esta es la buena.</Paragraph>
      ) : null}
      {r.empty ? null : <Button href={url}>Ver la ceremonia</Button>}
    </Card>
  )
}

/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { RarityPlate } from '../components/RarityPlate'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { useEmail } from '../context'
import { clip } from '../format'
import { achievementCondition, achievementName, RARITY_NAMES, rankName, xpText } from '../game'
import type { EmailTemplate } from '../template'

/**
 * Lo que encola `emailSchedule` a las 19:00 (`scheduleProgressEmails`, `apps/server/src/modules/game/progress.ts`):
 * la subida de rango y los logros épicos y legendarios que cuentan en el día (§2.12.7). Solo lo que no tiene semana
 * o es de semanas selladas: nada de una semana ciega (`RF-NOTIF-13`).
 */
export interface GameProgressPayload {
  /** El día del aviso en palabras (Madrid): «lunes 19 de octubre». */
  dayText: string
  /** Su nombre, para el botón a su carta (`/p/:username`); sin él, Ajustes → Perfil. */
  username: string | null
  /** La subida de rango del día (ids de rango del Anexo B), o `null`. */
  rank: {
    from: string
    to: string
    /** Nivel con el que acaba el día. */
    level: number
    /** El rango siguiente y su nivel, o `null` en el último. */
    next: { to: string; level: number } | null
  } | null
  /** Los logros épicos y legendarios del día (los legendarios primero), con el XP de su rareza. */
  achievements: { id: string; rarity: 'epic' | 'legendary'; xp: number }[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function subject(p: GameProgressPayload): string {
  const n = p.achievements.length
  if (p.rank) {
    const head = 'Nuevo rango: '
    const tail = n ? ` y ${plural(n, 'logro', 'logros')}` : ''
    return `${head}${clip(rankName(p.rank.to), 50 - head.length - tail.length)}${tail}`
  }
  const first = achievementName(p.achievements[0]?.id ?? '')
  if (n <= 1) {
    const head = 'Logro desbloqueado: '
    return `${head}${clip(first, 50 - head.length)}`
  }
  const head = 'Logros desbloqueados: '
  const tail = ` y ${n - 1} más`
  return `${head}${clip(first, 50 - head.length - tail.length)}${tail}`
}

function preheader(p: GameProgressPayload): string {
  const xp = p.achievements.reduce((total, a) => total + a.xp, 0)
  const names = p.achievements.map((a) => achievementName(a.id))
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '')
  if (p.rank) {
    const left = `Nivel ${p.rank.level}: «${rankName(p.rank.from)}» se queda atrás.`
    return names.length ? `${left} Y +${xpText(xp)} en logros: ${list}.` : `${left} Tu carta ya lo dice.`
  }
  const only = p.achievements[0]
  if (p.achievements.length === 1 && only)
    return `Logro ${RARITY_NAMES[only.rarity]} · +${xpText(only.xp)}: ${achievementCondition(only.id)}`
  return `+${xpText(xp)} en logros: ${list}.`
}

function ProgressBody({ p }: { p: GameProgressPayload }) {
  const { publicUrl } = useEmail()
  const cardUrl = p.username
    ? `${publicUrl}/p/${encodeURIComponent(p.username)}`
    : `${publicUrl}/ajustes/perfil`
  return (
    <Layout preheader={preheader(p)}>
      {p.rank ? (
        <Card>
          <Kicker>Nuevo rango · nivel {p.rank.level}</Kicker>
          <Heading>{rankName(p.rank.to)}</Heading>
          <Paragraph>
            Dejas atrás «{rankName(p.rank.from)}»: tu carta de productor ya dice {rankName(p.rank.to)}.
          </Paragraph>
          <Paragraph muted>
            {p.rank.next
              ? `El siguiente rango, ${rankName(p.rank.next.to)}, llega en el nivel ${p.rank.next.level}.`
              : 'Es el último rango: eres de la familia.'}
          </Paragraph>
        </Card>
      ) : null}
      {p.achievements.map((a) => (
        <Card key={a.id}>
          <RarityPlate rarity={a.rarity} xp={a.xp} />
          <Heading>{achievementName(a.id)}</Heading>
          <Paragraph>{achievementCondition(a.id)}</Paragraph>
        </Card>
      ))}
      <Card>
        <Kicker>Tu progreso del {p.dayText}</Kicker>
        <Paragraph>Rango, nivel y vitrina de logros, en tu carta de productor.</Paragraph>
        <Button href={cardUrl}>Ver mi carta</Button>
        <Paragraph muted>
          Lo que ganas durante una semana en juego llega aquí el día que se sella: hasta entonces, el voto es
          ciego.
        </Paragraph>
      </Card>
    </Layout>
  )
}

/**
 * `game.progress` (§2.12, §2.12.7, Anexo H): el progreso del día a las 19:00, todo en uno: la tarjeta del rango y una
 * por logro épico o legendario.
 */
export const gameProgress: EmailTemplate<GameProgressPayload> = {
  subject,
  preheader,
  fixture: {
    dayText: 'lunes 19 de octubre',
    username: 'mar_beats',
    rank: { from: 'sampler', to: 'beatmaker', level: 7, next: { to: 'producer', level: 9 } },
    achievements: [
      { id: 'win', rarity: 'epic', xp: 150 },
      { id: 'golden_ear', rarity: 'epic', xp: 150 },
    ],
  },
  body: (p) => <ProgressBody p={p} />,
}

/** Una variante para la galería: un solo logro legendario, sin rango. */
export const GAME_PROGRESS_LEGENDARY_FIXTURE: GameProgressPayload = {
  dayText: 'lunes 26 de octubre',
  username: 'mar_beats',
  rank: null,
  achievements: [{ id: 'double', rarity: 'legendary', xp: 300 }],
}

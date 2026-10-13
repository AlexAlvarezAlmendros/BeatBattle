/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import type { EmailTemplate } from '../template'

export interface BattleFirstVotesPayload {
  weekNumber: number
  /** Título y alias de batalla de su entrada. */
  title: string
  alias: string
  /** Votos y escuchas: solo los números, nunca la media (§2.7, `RF-NOTIF-13`). */
  votes: number
  plays: number
  /** Ficha pública de la entrada, para compartirla. */
  entryUrl: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function FirstVotesBody({ p }: { p: BattleFirstVotesPayload }) {
  return (
    <Layout preheader={battleFirstVotes.preheader(p)}>
      <Card>
        <Kicker>Semana #{p.weekNumber} · tu beat</Kicker>
        <Heading>Ya suena: {plural(p.votes, 'voto', 'votos')}</Heading>
        <Paragraph>
          «{p.title}» ({p.alias}) lleva {plural(p.votes, 'voto', 'votos')} y{' '}
          {plural(p.plays, 'escucha', 'escuchas')}. Las notas no se ven hasta el sellado: ni tú ni nadie.
        </Paragraph>
        <Button href={p.entryUrl}>Compartir mi beat</Button>
        <Paragraph muted>Cuantas más personas lo escuchen, más votos. El domingo se revela todo.</Paragraph>
      </Card>
    </Layout>
  )
}

/** `battle.first_votes` (§2.12, Anexo H): al llegar a 5 votos, una vez por semana, solo el número. */
export const battleFirstVotes: EmailTemplate<BattleFirstVotesPayload> = {
  subject: (p) => `Tu beat ya suena: ${plural(p.votes, 'voto', 'votos')}`,
  preheader: (p) =>
    `${plural(p.plays, 'escucha', 'escuchas')} y ${plural(p.votes, 'voto', 'votos')} en la semana #${p.weekNumber}.`,
  fixture: {
    weekNumber: 42,
    title: 'Bruma en Gràcia',
    alias: 'Tigre Púrpura',
    votes: 5,
    plays: 23,
    entryUrl: 'https://battle.otherpeople.es/e/0192f0c4-7a1b-7c3d-9e8f-123456789abc',
  },
  body: (p) => <FirstVotesBody p={p} />,
}

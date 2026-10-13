/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Img } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { useEmail } from '../context'
import type { EmailTemplate } from '../template'

export interface BattleJuryCallPayload {
  weekNumber: number
  slug: string
  /** Entradas que le quedan por puntuar (activas, ajenas y sin su voto). */
  remaining: number
  /** Cierre de votos en palabras («domingo 18 de octubre a las 23:59»). */
  closesText: string
}

function JuryCallBody({ p }: { p: BattleJuryCallPayload }) {
  const { publicUrl } = useEmail()
  return (
    <Layout preheader={battleJuryCall.preheader(p)}>
      <Card>
        <Kicker>Semana #{p.weekNumber} · modo jurado</Kicker>
        <Heading>Te quedan {p.remaining} beats</Heading>
        <Paragraph>
          Ya has votado esta semana. Quedan {p.remaining} entradas que aún no has escuchado, y las votaciones
          cierran el {p.closesText}.
        </Paragraph>
        <Img
          src={`${publicUrl}/api/email/countdown/${p.slug}.votes.gif`}
          width="512"
          height="96"
          alt={`Las votaciones cierran el ${p.closesText}`}
          style={{ display: 'block', width: '100%', maxWidth: '512px', height: 'auto', margin: '8px 0 16px' }}
        />
        <Button href={`${publicUrl}/jurado`}>Al jurado</Button>
        <Paragraph muted>Voto ciego: nadie sabe de quién es cada beat hasta el sellado.</Paragraph>
      </Card>
    </Layout>
  )
}

/** `battle.jury_call` (§2.12, Anexo H): el domingo a las 17:00, a quien ha votado y le quedan ≥ 3 por escuchar. */
export const battleJuryCall: EmailTemplate<BattleJuryCallPayload> = {
  subject: (p) => `Te quedan ${p.remaining} beats por escuchar`,
  preheader: (p) => `Las votaciones de la semana #${p.weekNumber} cierran el ${p.closesText}.`,
  fixture: {
    weekNumber: 42,
    slug: '2026-w42',
    remaining: 12,
    closesText: 'domingo 18 de octubre a las 23:59',
  },
  body: (p) => <JuryCallBody p={p} />,
}

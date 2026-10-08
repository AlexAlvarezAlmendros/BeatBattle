/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { useEmail } from '../context'
import { cardNumber } from '../format'
import type { EmailTemplate } from '../template'

export interface AuthWelcomePayload {
  name: string
  /** Orden de alta: el número de su carta de luchador. */
  cardNumber: number
}

const STEPS = [
  ['1', 'Pilla el sample', 'Cada lunes cae uno nuevo. Descárgalo y acepta las bases.'],
  ['2', 'Flipea el sample', 'Haz tu beat con él y súbelo antes del domingo a las 20:00.'],
  ['3', 'Vota a ciegas', 'Escucha al menos 30 segundos de cada beat y puntúa de 1 a 5.'],
] as const

function WelcomeBody({ p }: { p: AuthWelcomePayload }) {
  const { publicUrl } = useEmail()
  return (
    <Layout preheader={authWelcome.preheader(p)}>
      <Card>
        <Kicker>Carta de luchador {cardNumber(p.cardNumber)}</Kicker>
        <Heading>Bienvenido a la batalla</Heading>
        <Paragraph>
          {p.name}, ya eres el productor {cardNumber(p.cardNumber)} de Beat Battle. Así se juega:
        </Paragraph>
        {STEPS.map(([n, title, text]) => (
          <Paragraph key={n}>
            <strong>
              {n}. {title}.
            </strong>{' '}
            {text}
          </Paragraph>
        ))}
        <Button href={publicUrl}>Ir al menú</Button>
        <Paragraph muted>Eliges qué avisos te llegan en Ajustes → Emails.</Paragraph>
      </Card>
    </Layout>
  )
}

/** `auth.welcome` (Anexo H): la carta, cómo se juega en 3 pasos y los ajustes de email. */
export const authWelcome: EmailTemplate<AuthWelcomePayload> = {
  subject: (p) => `Bienvenido a la batalla, ${p.name}`,
  preheader: (p) => `Tu carta ${cardNumber(p.cardNumber)} ya está impresa. Así se juega en tres pasos.`,
  fixture: { name: 'LilBru', cardNumber: 42 },
  body: (p) => <WelcomeBody p={p} />,
}

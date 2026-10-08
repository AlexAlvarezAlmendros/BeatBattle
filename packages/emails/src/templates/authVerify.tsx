import { Link } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import type { EmailTemplate } from '../template'
import { mail } from '../theme'

export interface AuthVerifyPayload {
  name: string
  url: string
}

/** `auth.verify` (Anexo H): confirmar el email, con botón, enlace de texto y caducidad de 24 h. */
export const authVerify: EmailTemplate<AuthVerifyPayload> = {
  subject: () => 'Confirma tu email y entra en la batalla',
  preheader: (p) => `${p.name}, un clic y ya puedes subir tu flip y votar. El enlace dura 24 horas.`,
  fixture: { name: 'LilBru', url: 'http://localhost:5173/api/auth/verify-email?token=ejemplo' },
  body: (p) => (
    <Layout preheader={authVerify.preheader(p)}>
      <Card>
        <Kicker>Nuevo jugador</Kicker>
        <Heading>Confirma tu email</Heading>
        <Paragraph>
          {p.name}, para bajar el sample, subir tu flip y votar falta un paso: confirmar que este email es
          tuyo.
        </Paragraph>
        <Button href={p.url}>Confirmar mi email</Button>
        <Paragraph muted>
          El enlace caduca en 24 horas. Si el botón no funciona, copia esta dirección en el navegador:{' '}
          <Link href={p.url} style={{ color: mail.text2, wordBreak: 'break-all' }}>
            {p.url}
          </Link>
        </Paragraph>
        <Paragraph muted>
          Si no te has registrado en Beat Battle, ignora este email: no se creará nada.
        </Paragraph>
      </Card>
    </Layout>
  ),
}

import { Link } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import type { EmailTemplate } from '../template'
import { mail } from '../theme'

export interface AuthResetPayload {
  name: string
  url: string
}

/** `auth.reset` (Anexo H): botón, caducidad de 1 h y aviso de que se cerrarán las sesiones (`RF-AUTH-08`). */
export const authReset: EmailTemplate<AuthResetPayload> = {
  subject: () => 'Restablece tu contraseña',
  preheader: () => 'El enlace dura 1 hora. Al cambiarla se cerrarán tus sesiones abiertas.',
  fixture: { name: 'LilBru', url: 'http://localhost:5173/recuperar?token=ejemplo' },
  body: (p) => (
    <Layout preheader={authReset.preheader(p)}>
      <Card>
        <Kicker>Continuar partida</Kicker>
        <Heading>Nueva contraseña</Heading>
        <Paragraph>
          {p.name}, alguien (esperamos que tú) ha pedido restablecer la contraseña de tu cuenta.
        </Paragraph>
        <Button href={p.url}>Elegir una contraseña nueva</Button>
        <Paragraph muted>
          El enlace caduca en 1 hora y solo sirve una vez. Al cambiar la contraseña se cerrarán todas tus
          sesiones abiertas, en este y en cualquier otro dispositivo.
        </Paragraph>
        <Paragraph muted>
          Si el botón no funciona, copia esta dirección en el navegador:{' '}
          <Link href={p.url} style={{ color: mail.text2, wordBreak: 'break-all' }}>
            {p.url}
          </Link>
        </Paragraph>
        <Paragraph muted>Si no lo has pedido tú, ignora este email: tu contraseña no cambia.</Paragraph>
      </Card>
    </Layout>
  ),
}

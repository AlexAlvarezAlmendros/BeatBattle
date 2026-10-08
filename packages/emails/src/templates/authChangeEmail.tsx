/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Link } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import type { EmailTemplate } from '../template'
import { mail } from '../theme'

export interface AuthChangeEmailPayload {
  name: string
  /** La dirección nueva, enmascarada («l•••@gmail.com»). */
  newEmailMasked: string
  url: string
}

/**
 * `auth.change_email` (§2.12, Anexo H): a la dirección **actual**, para aprobar el cambio. Al aprobarlo, la
 * nueva recibe su verificación; cuando se verifica, las dos reciben `auth.security`.
 */
export const authChangeEmail: EmailTemplate<AuthChangeEmailPayload> = {
  subject: () => 'Confirma el cambio de email de tu cuenta',
  preheader: (p) => `Has pedido usar ${p.newEmailMasked}. Si no has sido tú, no hagas nada.`,
  fixture: {
    name: 'LilBru',
    newEmailMasked: 'l•••@gmail.com',
    url: 'http://localhost:5173/api/auth/verify-email?token=ejemplo',
  },
  body: (p) => (
    <Layout preheader={authChangeEmail.preheader(p)}>
      <Card>
        <Kicker>Seguridad de la cuenta</Kicker>
        <Heading>Cambio de email</Heading>
        <Paragraph>
          {p.name}, has pedido que tu cuenta use {p.newEmailMasked} a partir de ahora. Apruébalo desde aquí y
          después confirma la dirección nueva con el email que le llegará.
        </Paragraph>
        <Button href={p.url}>Aprobar el cambio</Button>
        <Paragraph muted>
          Si el botón no funciona, copia esta dirección en el navegador:{' '}
          <Link href={p.url} style={{ color: mail.text2, wordBreak: 'break-all' }}>
            {p.url}
          </Link>
        </Paragraph>
        <Paragraph muted>
          Si no lo has pedido tú, no hagas nada: tu email no cambia. Y cambia tu contraseña.
        </Paragraph>
      </Card>
    </Layout>
  ),
}

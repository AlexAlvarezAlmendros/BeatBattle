/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { useEmail } from '../context'
import { madridDateTime } from '../format'
import type { EmailTemplate } from '../template'

export type SecurityChange = 'password' | 'email' | 'social_linked' | 'sessions_closed'

export interface AuthSecurityPayload {
  name: string
  change: SecurityChange
  /** Instante del cambio (UTC en ms). */
  at: number
  /** Navegador y sistema, si se conocen («Chrome en Linux»). */
  device?: string
  /** Para `email`: la dirección nueva, enmascarada («l•••@gmail.com»). */
  newEmailMasked?: string
  /** Para `social_linked`: Google o Discord. */
  provider?: string
}

const SUBJECT: Record<SecurityChange, string> = {
  password: 'Han cambiado la contraseña de tu cuenta',
  email: 'Han cambiado el email de tu cuenta',
  social_linked: 'Has vinculado una cuenta a Beat Battle',
  sessions_closed: 'Se han cerrado tus otras sesiones',
}

function what(p: AuthSecurityPayload): string {
  switch (p.change) {
    case 'password':
      return 'Se ha cambiado la contraseña de tu cuenta y se han cerrado las demás sesiones.'
    case 'email':
      return `El email de tu cuenta ha pasado a ser ${p.newEmailMasked ?? 'otra dirección'}. Te avisamos en las dos.`
    case 'social_linked':
      return `Se ha vinculado tu cuenta de ${p.provider ?? 'un proveedor'}: ya puedes entrar con ella.`
    case 'sessions_closed':
      return 'Se han cerrado todas tus sesiones salvo la que lo pidió.'
  }
}

function SecurityBody({ p }: { p: AuthSecurityPayload }) {
  const { publicUrl } = useEmail()
  return (
    <Layout preheader={authSecurity.preheader(p)}>
      <Card>
        <Kicker>Seguridad de la cuenta</Kicker>
        <Heading>{SUBJECT[p.change]}</Heading>
        <Paragraph>{what(p)}</Paragraph>
        <Paragraph muted>
          Cuándo: {madridDateTime(p.at)} (hora de Madrid).
          {p.device ? ` Desde: ${p.device}.` : ''}
        </Paragraph>
        <Paragraph>¿No has sido tú? Cambia ya tu contraseña y cierra las demás sesiones.</Paragraph>
        <Button href={`${publicUrl}/recuperar`}>No he sido yo</Button>
      </Card>
    </Layout>
  )
}

/** `auth.security` (Anexo H): qué ha cambiado, cuándo, desde qué navegador y «No he sido yo». */
export const authSecurity: EmailTemplate<AuthSecurityPayload> = {
  subject: (p) => SUBJECT[p.change],
  preheader: (p) =>
    `${madridDateTime(p.at)}${p.device ? ` · ${p.device}` : ''}. Si no has sido tú, actúa ya.`,
  fixture: {
    name: 'LilBru',
    change: 'password',
    at: Date.UTC(2026, 9, 8, 11, 20),
    device: 'Chrome en Linux',
  },
  body: (p) => <SecurityBody p={p} />,
}

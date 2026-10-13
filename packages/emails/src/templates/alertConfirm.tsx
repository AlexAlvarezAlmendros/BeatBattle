/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import type { EmailTemplate } from '../template'

export interface AlertConfirmPayload {
  /** Página de la web que confirma con un `POST` (un escáner de enlaces no la confirma solo). */
  confirmUrl: string
}

function AlertConfirmBody({ p }: { p: AlertConfirmPayload }) {
  return (
    <Layout preheader={alertConfirm.preheader(p)}>
      <Card>
        <Kicker>Alerta de drop</Kicker>
        <Heading>Confirma tu alerta</Heading>
        <Paragraph>
          Te avisaremos cada lunes, cuando caiga el sample de la semana. Solo falta que confirmes que esta
          dirección es tuya.
        </Paragraph>
        <Button href={p.confirmUrl}>Confirmar la alerta</Button>
        <Paragraph muted>
          El enlace caduca en 7 días. Si no la has pedido tú, ignora este email: sin confirmar, no te llegará
          nada más y borramos la dirección.
        </Paragraph>
      </Card>
    </Layout>
  )
}

/** `alert.confirm` (§2.12.3, Anexo H): doble confirmación de la alerta de drop sin cuenta (`RF-NOTIF-09`). */
export const alertConfirm: EmailTemplate<AlertConfirmPayload> = {
  subject: () => 'Confirma tu alerta de drop',
  preheader: () => 'Un clic y te avisamos cada lunes del sample nuevo.',
  fixture: { confirmUrl: 'https://battle.otherpeople.es/alerta?token=ejemplo' },
  body: (p) => <AlertConfirmBody p={p} />,
}

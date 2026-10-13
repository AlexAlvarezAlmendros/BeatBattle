/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { useEmail } from '../context'
import type { EmailTemplate } from '../template'

export interface AdminCalendarGapPayload {
  /** El lunes sin semana, en palabras («lunes 12 de octubre»). */
  mondayText: string
  /** Horas que faltan para ese drop. */
  hoursLeft: number
}

function GapBody({ p }: { p: AdminCalendarGapPayload }) {
  const { publicUrl } = useEmail()
  return (
    <Layout preheader={adminCalendarGap.preheader(p)}>
      <Card>
        <Kicker>Administración · calendario</Kicker>
        <Heading>Falta el drop del {p.mondayText}</Heading>
        <Paragraph>
          Quedan unas {p.hoursLeft} h y no hay ninguna semana programada para ese lunes. Si no se programa, la
          web dirá «Próximo drop pronto» y nadie recibirá el aviso del drop.
        </Paragraph>
        <Button href={`${publicUrl}/admin`}>Abrir el calendario</Button>
      </Card>
    </Layout>
  )
}

/** `admin.calendar_gap` (§2.1, §4.12 `adminAlerts`, `RF-DROP-04`): hueco en el calendario a 72 h. */
export const adminCalendarGap: EmailTemplate<AdminCalendarGapPayload> = {
  subject: (p) => `Calendario vacío: falta el drop del ${p.mondayText}`.slice(0, 50),
  preheader: (p) => `Quedan ${p.hoursLeft} h y no hay semana programada.`,
  fixture: { mondayText: 'lunes 12 de octubre', hoursLeft: 72 },
  body: (p) => <GapBody p={p} />,
}

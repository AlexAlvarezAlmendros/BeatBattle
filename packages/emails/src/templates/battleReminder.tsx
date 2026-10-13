/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Img } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { useEmail } from '../context'
import { clip } from '../format'
import type { EmailTemplate } from '../template'

export interface BattleReminderPayload {
  weekNumber: number
  slug: string
  /** Título del sample. */
  title: string
  /** Horas que quedan hasta el cierre de envíos, redondeadas («~26 h»). */
  hoursLeft: number
  /** Cierre de envíos en palabras («domingo 18 de octubre a las 20:00»). */
  closesText: string
}

function ReminderBody({ p }: { p: BattleReminderPayload }) {
  const { publicUrl } = useEmail()
  return (
    <Layout preheader={battleReminder.preheader(p)}>
      <Card>
        <Kicker>Semana #{p.weekNumber} · inserta tu beat</Kicker>
        <Heading>Te quedan ~{p.hoursLeft} h</Heading>
        <Paragraph>
          Descargaste «{p.title}» y aún no has subido tu flip. Los envíos cierran el {p.closesText}.
        </Paragraph>
        <Img
          src={`${publicUrl}/api/email/countdown/${p.slug}.gif`}
          width="512"
          height="96"
          alt={`Los envíos cierran el ${p.closesText}`}
          style={{ display: 'block', width: '100%', maxWidth: '512px', height: 'auto', margin: '8px 0 16px' }}
        />
        <Button href={`${publicUrl}/subir`}>Subir mi flip</Button>
        <Paragraph muted>
          Una entrada por semana. Si al final no llegas, la próxima semana cae otro sample.
        </Paragraph>
      </Card>
    </Layout>
  )
}

/**
 * `battle.reminder` (§2.12, Anexo H): el sábado a las 18:00, a quien descargó el sample y no ha subido. La
 * versión «racha en peligro» llega con las rachas (Fase 7).
 */
export const battleReminder: EmailTemplate<BattleReminderPayload> = {
  subject: (p) => `Te quedan ~${p.hoursLeft} h para subir tu flip`,
  preheader: (p) =>
    `«${clip(p.title, 40)}»: los envíos de la semana #${p.weekNumber} cierran el ${p.closesText}.`,
  fixture: {
    weekNumber: 42,
    slug: '2026-w42',
    title: 'Lluvia en Gràcia',
    hoursLeft: 26,
    closesText: 'domingo 18 de octubre a las 20:00',
  },
  body: (p) => <ReminderBody p={p} />,
}

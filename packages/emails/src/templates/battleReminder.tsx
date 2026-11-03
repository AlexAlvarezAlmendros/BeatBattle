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
  /**
   * La versión «racha en peligro» (§2.12.7; tarea 7.31), a quien tiene una racha de 3 semanas o más (la de las semanas
   * selladas); `null` o sin el campo, el recordatorio de siempre.
   */
  streak?: {
    weeks: number
    /** Le queda el comodín de la temporada de esta semana. */
    jokerAvailable: boolean
    /** Bonus de la racha en juego si clasifica (puntos porcentuales, §2.10). */
    bonusPercent: number
  } | null
}

function ReminderBody({ p }: { p: BattleReminderPayload }) {
  const { publicUrl } = useEmail()
  const streak = p.streak ?? null
  return (
    <Layout preheader={battleReminder.preheader(p)}>
      <Card>
        <Kicker>
          Semana #{p.weekNumber} · {streak ? 'racha en peligro' : 'inserta tu beat'}
        </Kicker>
        <Heading>{streak ? `Tu racha de ${streak.weeks} semanas` : `Te quedan ~${p.hoursLeft} h`}</Heading>
        <Paragraph>
          Descargaste «{p.title}» y aún no has subido tu flip.{' '}
          {streak
            ? `Te quedan ~${p.hoursLeft} h: los envíos cierran el ${p.closesText}.`
            : `Los envíos cierran el ${p.closesText}.`}
        </Paragraph>
        {streak ? (
          <>
            <Paragraph>
              {streak.jokerAvailable
                ? 'Si la semana se sella sin una entrada tuya clasificada, gastas el comodín de esta temporada: la racha se salva, pero no sube.'
                : 'Ya gastaste el comodín de esta temporada: si la semana se sella sin una entrada tuya clasificada, la racha vuelve a 0.'}
            </Paragraph>
            <Paragraph>
              Si clasificas, la racha sube a {streak.weeks + 1} y tu XP de subir y de resultado lleva un +
              {streak.bonusPercent} %.
            </Paragraph>
          </>
        ) : null}
        <Img
          src={`${publicUrl}/api/email/countdown/${p.slug}.gif`}
          width="512"
          height="96"
          alt={`Los envíos cierran el ${p.closesText}`}
          style={{ display: 'block', width: '100%', maxWidth: '512px', height: 'auto', margin: '8px 0 16px' }}
        />
        <Button href={`${publicUrl}/subir`}>Subir mi flip</Button>
        <Paragraph muted>
          {streak
            ? 'Para clasificar hacen falta tres votos del jurado: cuanto antes subas, más tiempo tiene para escucharte.'
            : 'Una entrada por semana. Si al final no llegas, la próxima semana cae otro sample.'}
        </Paragraph>
      </Card>
    </Layout>
  )
}

/**
 * `battle.reminder` (§2.12, Anexo H): el sábado a las 18:00, a quien descargó el sample y no ha subido; con racha de 3
 * semanas o más, en su versión «racha en peligro» (§2.12.7).
 */
export const battleReminder: EmailTemplate<BattleReminderPayload> = {
  subject: (p) =>
    p.streak
      ? `Tu racha de ${p.streak.weeks} semanas está en juego`
      : `Te quedan ~${p.hoursLeft} h para subir tu flip`,
  preheader: (p) =>
    p.streak
      ? `«${clip(p.title, 40)}»: te quedan ~${p.hoursLeft} h para subir tu flip de la semana #${p.weekNumber}.`
      : `«${clip(p.title, 40)}»: los envíos de la semana #${p.weekNumber} cierran el ${p.closesText}.`,
  fixture: {
    weekNumber: 42,
    slug: '2026-w42',
    title: 'Lluvia en Gràcia',
    hoursLeft: 26,
    closesText: 'domingo 18 de octubre a las 20:00',
  },
  body: (p) => <ReminderBody p={p} />,
}

/** La versión «racha en peligro» del ejemplo (galería y tests): 5 semanas, con el comodín de la temporada. */
export const BATTLE_REMINDER_STREAK_FIXTURE: BattleReminderPayload = {
  ...battleReminder.fixture,
  streak: { weeks: 5, jokerAvailable: true, bonusPercent: 50 },
}

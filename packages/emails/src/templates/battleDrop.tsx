/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Img, Link } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { useEmail } from '../context'
import { clip, musicalKeyName } from '../format'
import type { EmailTemplate } from '../template'
import { mail } from '../theme'

export interface BattleDropPayload {
  weekNumber: number
  slug: string
  title: string
  credits: string
  bpm: number | null
  /** «Dm», «F#»… */
  musicalKey: string | null
  genre: string | null
  challenge: string | null
  /** Portada cuadrada (Cloudinary, sin parámetros por persona). */
  coverUrl: string
  /** Cierre de envíos en palabras («domingo 11 de octubre a las 20:00»). */
  closesText: string
  /** `true` para quien solo dejó su email: se le invita a crear cuenta (§2.12.3). */
  subscriber: boolean
}

const chipsOf = (p: BattleDropPayload) =>
  [p.bpm ? `${Math.round(p.bpm)} BPM` : null, p.musicalKey ? musicalKeyName(p.musicalKey) : null, p.genre]
    .filter(Boolean)
    .join(' · ')

function DropBody({ p }: { p: BattleDropPayload }) {
  const { publicUrl } = useEmail()
  const weekUrl = `${publicUrl}/semana/${p.slug}`
  const chips = chipsOf(p)
  return (
    <Layout preheader={battleDrop.preheader(p)}>
      <Card>
        <Kicker>Semana #{p.weekNumber} · nuevo drop</Kicker>
        <Img
          src={p.coverUrl}
          width="512"
          height="512"
          alt={`Portada de «${p.title}»`}
          style={{ display: 'block', width: '100%', maxWidth: '512px', height: 'auto', margin: '0 0 16px' }}
        />
        <Heading>{p.title}</Heading>
        <Paragraph muted>{p.credits}</Paragraph>
        {chips ? (
          <Paragraph>
            <strong>{chips}</strong>
          </Paragraph>
        ) : null}
        {p.challenge ? (
          <Paragraph>
            <strong>Reto extra:</strong> {p.challenge} (no puntúa, da un logro).
          </Paragraph>
        ) : null}
        <Img
          src={`${publicUrl}/api/email/countdown/${p.slug}.gif`}
          width="512"
          height="96"
          alt={`Los envíos cierran el ${p.closesText}`}
          style={{ display: 'block', width: '100%', maxWidth: '512px', height: 'auto', margin: '8px 0 16px' }}
        />
        <Paragraph>Tienes hasta el {p.closesText} para subir tu flip.</Paragraph>
        <Button href={weekUrl}>Pillar el sample</Button>
        {p.subscriber ? (
          <Paragraph muted>
            Para descargarlo y subir tu beat necesitas una cuenta:{' '}
            <Link href={`${publicUrl}/registro`} style={{ color: mail.text }}>
              crea la tuya
            </Link>{' '}
            con este mismo email y mantendrás la alerta.
          </Paragraph>
        ) : null}
      </Card>
    </Layout>
  )
}

/** `battle.drop` (§2.12, Anexo H): el sample nuevo con su portada, chips, reto y la cuenta atrás en vivo. */
export const battleDrop: EmailTemplate<BattleDropPayload> = {
  subject: (p) => {
    const tail = [
      p.bpm ? `${Math.round(p.bpm)} BPM` : null,
      p.musicalKey ? musicalKeyName(p.musicalKey) : null,
    ]
      .filter(Boolean)
      .map((part) => ` · ${part}`)
      .join('')
    return `Nuevo drop: ${clip(p.title, Math.max(8, 50 - 'Nuevo drop: '.length - tail.length))}${tail}`
  },
  preheader: (p) => `Semana #${p.weekNumber}: descárgalo, flipéalo y súbelo antes del ${p.closesText}.`,
  fixture: {
    weekNumber: 41,
    slug: '2026-w41',
    title: 'Lluvia en Gràcia',
    credits: 'Other People Records',
    bpm: 92,
    musicalKey: 'Dm',
    genre: 'Boom Bap',
    challenge: 'Usa solo el primer compás',
    coverUrl:
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,h_512,w_512/f_auto,q_auto/beatbattle-dev/samples/ejemplo/cover',
    closesText: 'domingo 11 de octubre a las 20:00',
    subscriber: true,
  },
  body: (p) => <DropBody p={p} />,
}

/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Img, Link } from '@react-email/components'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { Ticket } from '../components/Ticket'
import { useEmail } from '../context'
import {
  clip,
  decimal,
  duration,
  madridExact,
  madridWhen,
  megabytes,
  musicalKeyName,
  signed,
  withUnit,
} from '../format'
import type { EmailTemplate } from '../template'
import { mail } from '../theme'

/**
 * Lo que encola el servidor (`receiptPayload`, `apps/server/src/modules/entries/service.ts`): la entrada
 * recién verificada y medida. Nada que no sea del propio productor: ni medias, ni votos, ni posiciones.
 */
export interface EntryReceiptPayload {
  /** «BB-2026W41-0007». */
  receiptCode: string
  weekNumber: number
  weekSlug: string
  alias: string
  title: string
  durationMs: number
  format: string
  bytes: number
  bpm: number | null
  musicalKey: string | null
  /** Sonoridad integrada medida (LUFS), o `null` si es silencio. */
  loudnessLufs: number | null
  /** Pico real medido (dBTP). */
  truePeakDb: number | null
  /** Ajuste al reproducirla en la batalla (solo atenúa, §4.7.3), en dB. */
  gainDb: number | null
  /** MD5 del archivo según el almacenamiento. */
  etag: string
  /** Hora de recepción (ms UTC). */
  receivedAt: number
  /** Cierre de envíos: hasta entonces se edita la ficha. */
  editUntil: number
  entryUrl: string
  editUrl: string
  /** PNG firmado de la onda medida (§4.19.5), o `null` si el servidor no firma imágenes. */
  waveformUrl: string | null
}

/** A partir de aquí el pico real se avisa: «tu master clipa» (§2.12.1). */
export const CLIP_DBTP = -0.1

/** La huella del archivo, abreviada: los 12 primeros caracteres del `etag`. */
export const shortEtag = (etag: string) => etag.slice(0, 12)

/** El alias como lo enseña el juego, en mayúsculas. */
export const aliasText = (alias: string) => alias.toLocaleUpperCase('es-ES')

/** La frase del informe técnico sobre la sonoridad (§2.12.1). */
export function loudnessLine(p: Pick<EntryReceiptPayload, 'loudnessLufs' | 'gainDb'>): string {
  if (p.loudnessLufs === null) return 'Sin sonoridad medible: el audio es silencio o casi.'
  const lufs = withUnit(decimal(p.loudnessLufs), 'LUFS')
  const gain = p.gainDb ?? 0
  if (gain < -0.05)
    return `${lufs}: en la batalla sonará ${withUnit(decimal(-gain), 'dB')} más baja para igualarse al resto.`
  return `${lufs}: en la batalla sonará tal cual (solo se bajan las que suenan más fuerte que −14 LUFS).`
}

/** La frase del pico real, con el aviso de clip. */
export function peakLine(truePeakDb: number | null): string | null {
  if (truePeakDb === null) return null
  const peak = withUnit(signed(truePeakDb), 'dBTP')
  return truePeakDb > CLIP_DBTP
    ? `Pico real: ${peak}. Tu master clipa: baja el limitador y, si quieres, sustituye el audio antes del cierre (mientras no tenga votos).`
    : `Pico real: ${peak}. Sin clip.`
}

/** El recibo: ticket, informe técnico, onda, botones y bases. Lo comparten `entry.receipt` y `entry.changed`. */
export function ReceiptBody({
  p,
  kicker,
  heading,
  intro,
  preheader,
}: {
  p: EntryReceiptPayload
  kicker: string
  heading: string
  intro: string
  preheader: string
}) {
  const { publicUrl } = useEmail()
  const peak = peakLine(p.truePeakDb)
  const rows: [string, string][] = [
    ['Alias', aliasText(p.alias)],
    ['Título', p.title],
    ['Duración', duration(p.durationMs)],
    ['Archivo', `${p.format.toUpperCase()} · ${megabytes(p.bytes)}`],
    ...(p.bpm ? ([['Tempo', withUnit(Math.round(p.bpm), 'BPM')]] as [string, string][]) : []),
    ...(p.musicalKey ? ([['Tonalidad', musicalKeyName(p.musicalKey)]] as [string, string][]) : []),
    ['Recibido', `${madridExact(p.receivedAt)} (Madrid)`],
    ['Huella', shortEtag(p.etag)],
  ]
  return (
    <Layout preheader={preheader}>
      <Card>
        <Kicker>{kicker}</Kicker>
        <Heading>{heading}</Heading>
        <Paragraph>
          {intro} Así te verán hasta el sellado: <strong>{aliasText(p.alias)}</strong>. No lo difundas.
        </Paragraph>
        <Ticket code={p.receiptCode} rows={rows} />
        <Kicker>Informe técnico</Kicker>
        <Paragraph>{loudnessLine(p)}</Paragraph>
        {peak ? <Paragraph>{peak}</Paragraph> : null}
        {p.waveformUrl ? (
          <Img
            src={p.waveformUrl}
            width="512"
            height="96"
            alt={`Forma de onda de «${p.title}», ${duration(p.durationMs)}`}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: '512px',
              height: 'auto',
              margin: '8px 0 8px',
            }}
          />
        ) : null}
        <Button href={p.entryUrl}>Escuchar mi entrada</Button>
        <Paragraph>
          <Link href={p.editUrl} style={{ color: mail.text, fontWeight: 700 }}>
            Editar la ficha
          </Link>{' '}
          (título, tempo, tonalidad, géneros y portada) hasta el {madridWhen(p.editUntil)}.
        </Paragraph>
        <Paragraph muted>
          Voto ciego: tu título no debe delatarte y nadie sabe que es tuyo hasta el sellado. Guarda este
          recibo: la hora y la huella prueban que tu beat llegó bien. Las bases, en la{' '}
          <Link href={`${publicUrl}/semana/${p.weekSlug}`} style={{ color: mail.text2 }}>
            ficha de la semana
          </Link>
          .
        </Paragraph>
      </Card>
    </Layout>
  )
}

export const ENTRY_RECEIPT_FIXTURE: EntryReceiptPayload = {
  receiptCode: 'BB-2026W41-0007',
  weekNumber: 41,
  weekSlug: '2026-w41',
  alias: 'Tigre Púrpura',
  title: 'Bruma en Gràcia',
  durationMs: 151_000,
  format: 'wav',
  bytes: 61_234_567,
  bpm: 140,
  musicalKey: 'Am',
  loudnessLufs: -9.2,
  truePeakDb: 0.4,
  gainDb: -4.8,
  etag: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  receivedAt: Date.UTC(2026, 9, 8, 11, 20, 14),
  editUntil: Date.UTC(2026, 9, 11, 18, 0, 0),
  entryUrl: 'https://battle.otherpeople.es/e/7b0c6a0e',
  editUrl: 'https://battle.otherpeople.es/subir',
  waveformUrl: 'https://battle.otherpeople.es/api/email/waveform/7b0c6a0e.png?v=a1b2c3d4e5f6&sig=ejemplo',
}

/**
 * `entry.receipt` (§2.12.1, Anexo H, `RF-NOTIF-06`): el ticket de la entrada verificada, con su informe
 * técnico (sonoridad, ajuste a −14 LUFS, pico real con aviso de clip y la onda), la hora de recepción y la
 * huella. El QR a la ficha llega con la tarea 4.13; mientras, el botón.
 */
export const entryReceipt: EmailTemplate<EntryReceiptPayload> = {
  subject: (p) => clip(`Ya estás en la batalla #${p.weekNumber} · ${p.receiptCode}`, 50),
  preheader: (p) => `Así te verán hasta el sellado: ${aliasText(p.alias)}. Dentro, tu informe técnico.`,
  fixture: ENTRY_RECEIPT_FIXTURE,
  body: (p) => (
    <ReceiptBody
      p={p}
      kicker={`Semana #${p.weekNumber} · recibo de entrada`}
      heading="Ya estás en la batalla"
      intro={`«${p.title}» ha llegado bien y está medido.`}
      preheader={entryReceipt.preheader(p)}
    />
  ),
}

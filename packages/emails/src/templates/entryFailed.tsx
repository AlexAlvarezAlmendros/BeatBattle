/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { clip, duration, megabytes } from '../format'
import type { EmailTemplate } from '../template'

/**
 * Lo que encola el servidor al rechazar una subida (`reject` en `service.ts` y `completeProcessing` en
 * `cleanup.ts`): el código del error de la API y sus detalles.
 */
export interface EntryFailedPayload {
  /** `audio` (no cumple las reglas), `missing`, `mismatch` o `undecodable`. */
  reason: string
  /** `DURATION_OUT_OF_RANGE`, `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `ENTRY_ASSET_INVALID`… */
  code: string
  /** Los de `validateEntryAudio` (`durationMs`, `limit`, `sizeBytes`…) o `{ reason }`. */
  details: Record<string, unknown> | null
  weekNumber: number
  weekSlug: string
  uploadUrl: string
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/**
 * El motivo con las mismas palabras que la interfaz (§2.19, `pages.upload.problems` de la web): «Tu beat
 * dura 4:12. El máximo son 4 minutos.».
 */
export function failureReason(p: Pick<EntryFailedPayload, 'code' | 'reason' | 'details'>): string {
  const details = p.details ?? {}
  if (p.code === 'UNSUPPORTED_FORMAT') return 'Eso no suena a audio. Prueba con WAV, AIFF, FLAC o MP3.'
  if (p.code === 'FILE_TOO_LARGE') {
    const size = num(details.sizeBytes)
    return size === null
      ? 'Tu archivo pesa más de 100 MB, que es el máximo.'
      : `Tu archivo pesa ${megabytes(size)}. El máximo son 100 MB.`
  }
  if (p.code === 'DURATION_OUT_OF_RANGE') {
    const ms = num(details.durationMs)
    if (details.limit === 'max')
      return ms === null
        ? 'Tu beat dura más de 4 minutos, que es el máximo.'
        : `Tu beat dura ${duration(Math.ceil(ms / 1000) * 1000)}. El máximo son 4 minutos.`
    return ms === null
      ? 'Tu beat dura menos de 30 segundos, que es el mínimo.'
      : `Tu beat dura ${duration(ms)}. El mínimo son 30 segundos.`
  }
  const reason = typeof details.reason === 'string' ? details.reason : p.reason
  if (reason === 'missing') return 'No encontramos el archivo subido: la subida no llegó a terminar.'
  if (reason === 'mismatch') return 'El archivo que llegó no es el que se firmó para tu subida.'
  return 'No hemos podido leer el audio. Comprueba que el archivo no esté dañado.'
}

function EntryFailedBody({ p }: { p: EntryFailedPayload }) {
  return (
    <Layout preheader={entryFailed.preheader(p)}>
      <Card>
        <Kicker>Semana #{p.weekNumber} · subida</Kicker>
        <Heading>Tu beat no ha entrado</Heading>
        <Paragraph>{failureReason(p)}</Paragraph>
        <Paragraph>
          Hemos borrado el archivo y no hay ninguna entrada a tu nombre. La ficha que rellenaste sigue en la
          página de subida: vuelve a subir el beat y listo.
        </Paragraph>
        <Button href={p.uploadUrl}>Volver a subir</Button>
      </Card>
    </Layout>
  )
}

/** `entry.failed` (§2.12.1, Anexo H): la verificación o la medición rechazan la subida, con el motivo. */
export const entryFailed: EmailTemplate<EntryFailedPayload> = {
  subject: (p) => clip(`Tu beat no ha entrado en la semana #${p.weekNumber}`, 50),
  preheader: (p) => clip(failureReason(p), 110),
  fixture: {
    reason: 'audio',
    code: 'DURATION_OUT_OF_RANGE',
    details: { code: 'DURATION_OUT_OF_RANGE', durationMs: 252_000, limit: 'max', limitMs: 240_000 },
    weekNumber: 41,
    weekSlug: '2026-w41',
    uploadUrl: 'https://battle.otherpeople.es/subir',
  },
  body: (p) => <EntryFailedBody p={p} />,
}

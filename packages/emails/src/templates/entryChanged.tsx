/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import { clip } from '../format'
import type { EmailTemplate } from '../template'
import { aliasText, ENTRY_RECEIPT_FIXTURE, type EntryReceiptPayload, ReceiptBody } from './entryReceipt'

/** Audio sustituido: el recibo actualizado (mismo número y alias, audio y medición nuevos). */
export interface EntryReplacedPayload extends EntryReceiptPayload {
  change: 'replaced'
}

/**
 * Entrada retirada. `votesLost` lo manda el servidor, pero el email no da la cifra: solo dice si había
 * votos (ningún email cuenta votos antes del sellado, §1.3).
 */
export interface EntryWithdrawnPayload {
  change: 'withdrawn'
  receiptCode: string
  weekNumber: number
  weekSlug: string
  alias: string
  title: string
  votesLost: number
  uploadUrl: string
}

export type EntryChangedPayload = EntryReplacedPayload | EntryWithdrawnPayload

function WithdrawnBody({ p }: { p: EntryWithdrawnPayload }) {
  return (
    <Layout preheader={entryChanged.preheader(p)}>
      <Card>
        <Kicker>Semana #{p.weekNumber} · entrada retirada</Kicker>
        <Heading>Has retirado tu entrada</Heading>
        <Paragraph>
          «{p.title}» ({aliasText(p.alias)}) ya no está en la batalla. Hemos borrado el audio y el recibo{' '}
          <strong>{p.receiptCode}</strong> queda anulado.
        </Paragraph>
        {p.votesLost > 0 ? <Paragraph>Los votos que había recibido se han perdido.</Paragraph> : null}
        <Paragraph>
          Tu hueco vuelve a estar libre: puedes subir otro beat mientras los envíos sigan abiertos.
        </Paragraph>
        <Button href={p.uploadUrl}>Subir otro beat</Button>
      </Card>
    </Layout>
  )
}

/**
 * `entry.changed` (§2.12.1, Anexo H): el recibo actualizado al sustituir el audio, o la confirmación de que
 * la entrada se ha retirado.
 */
export const entryChanged: EmailTemplate<EntryChangedPayload> = {
  subject: (p) =>
    p.change === 'replaced'
      ? clip(`Audio sustituido · ${p.receiptCode}`, 50)
      : clip(`Entrada retirada · ${p.receiptCode}`, 50),
  preheader: (p) =>
    p.change === 'replaced'
      ? 'Mismo recibo y mismo alias, con la medición del audio nuevo.'
      : 'El audio está borrado y tu hueco de la semana, libre.',
  fixture: { change: 'replaced', ...ENTRY_RECEIPT_FIXTURE, loudnessLufs: -13.1, truePeakDb: -1.2, gainDb: 0 },
  body: (p) =>
    p.change === 'replaced' ? (
      <ReceiptBody
        p={p}
        kicker={`Semana #${p.weekNumber} · recibo actualizado`}
        heading="Audio sustituido"
        intro={`El audio nuevo de «${p.title}» ha llegado bien y está medido.`}
        preheader={entryChanged.preheader(p)}
      />
    ) : (
      <WithdrawnBody p={p} />
    ),
}

/** El ejemplo de la retirada (para el visor y los tests). */
export const ENTRY_WITHDRAWN_FIXTURE: EntryWithdrawnPayload = {
  change: 'withdrawn',
  receiptCode: 'BB-2026W41-0007',
  weekNumber: 41,
  weekSlug: '2026-w41',
  alias: 'Tigre Púrpura',
  title: 'Bruma en Gràcia',
  votesLost: 3,
  uploadUrl: 'https://battle.otherpeople.es/subir',
}

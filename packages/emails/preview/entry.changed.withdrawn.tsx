/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { ENTRY_WITHDRAWN_FIXTURE, entryChanged } from '../src/templates/entryChanged'

/** `entry.changed` de una retirada en el visor de React Email (`pnpm emails:dev`). */
export default function EntryWithdrawn() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {entryChanged.body(ENTRY_WITHDRAWN_FIXTURE)}
    </EmailProvider>
  )
}

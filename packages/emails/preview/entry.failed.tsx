/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { entryFailed } from '../src/templates/entryFailed'

/** `entry.failed` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function EntryFailed() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {entryFailed.body(entryFailed.fixture)}
    </EmailProvider>
  )
}

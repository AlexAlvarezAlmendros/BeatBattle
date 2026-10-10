/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { entryChanged } from '../src/templates/entryChanged'

/** `entry.changed` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function EntryChanged() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {entryChanged.body(entryChanged.fixture)}
    </EmailProvider>
  )
}

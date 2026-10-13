/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { entryReceipt } from '../src/templates/entryReceipt'

/** `entry.receipt` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function EntryReceipt() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {entryReceipt.body(entryReceipt.fixture)}
    </EmailProvider>
  )
}

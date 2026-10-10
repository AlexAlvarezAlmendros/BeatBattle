/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { alertConfirm } from '../src/templates/alertConfirm'

/** `alert.confirm` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function AlertConfirm() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {alertConfirm.body(alertConfirm.fixture)}
    </EmailProvider>
  )
}

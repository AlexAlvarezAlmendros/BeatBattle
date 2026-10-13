/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { adminCalendarGap } from '../src/templates/adminCalendarGap'

/** `admin.calendar_gap` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function AdminCalendarGap() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {adminCalendarGap.body(adminCalendarGap.fixture)}
    </EmailProvider>
  )
}

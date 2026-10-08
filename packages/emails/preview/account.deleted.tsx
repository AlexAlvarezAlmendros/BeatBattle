import { EmailProvider } from '../src/context'
import { accountDeleted } from '../src/templates/accountDeleted'

/** `account.deleted` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function AccountDeleted() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {accountDeleted.body(accountDeleted.fixture)}
    </EmailProvider>
  )
}

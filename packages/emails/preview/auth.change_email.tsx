/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { authChangeEmail } from '../src/templates/authChangeEmail'

/** `auth.change_email` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function AuthChangeEmail() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {authChangeEmail.body(authChangeEmail.fixture)}
    </EmailProvider>
  )
}

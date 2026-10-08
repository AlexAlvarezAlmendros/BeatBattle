import { EmailProvider } from '../src/context'
import { authReset } from '../src/templates/authReset'

/** `auth.reset` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function AuthReset() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {authReset.body(authReset.fixture)}
    </EmailProvider>
  )
}

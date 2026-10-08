import { EmailProvider } from '../src/context'
import { authWelcome } from '../src/templates/authWelcome'

/** `auth.welcome` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function AuthWelcome() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {authWelcome.body(authWelcome.fixture)}
    </EmailProvider>
  )
}

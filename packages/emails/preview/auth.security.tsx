import { EmailProvider } from '../src/context'
import { authSecurity } from '../src/templates/authSecurity'

/** `auth.security` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function AuthSecurity() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {authSecurity.body(authSecurity.fixture)}
    </EmailProvider>
  )
}

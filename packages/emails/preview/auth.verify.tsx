/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { authVerify } from '../src/templates/authVerify'

/** `auth.verify` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function AuthVerify() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'service' }}>
      {authVerify.body(authVerify.fixture)}
    </EmailProvider>
  )
}

/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { seasonWrap } from '../src/templates/seasonWrap'

/** `season.wrap` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function SeasonWrap() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'battle' }}>
      {seasonWrap.body(seasonWrap.fixture)}
    </EmailProvider>
  )
}

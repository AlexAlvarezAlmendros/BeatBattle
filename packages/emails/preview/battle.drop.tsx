/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { battleDrop } from '../src/templates/battleDrop'

/** `battle.drop` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function BattleDrop() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'battle' }}>
      {battleDrop.body(battleDrop.fixture)}
    </EmailProvider>
  )
}

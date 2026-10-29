/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { EmailProvider } from '../src/context'
import { gameProgress } from '../src/templates/gameProgress'

/** `game.progress` en el visor de React Email (`pnpm emails:dev`), con sus datos de ejemplo. */
export default function GameProgress() {
  return (
    <EmailProvider value={{ publicUrl: 'http://localhost:5173', family: 'battle' }}>
      {gameProgress.body(gameProgress.fixture)}
    </EmailProvider>
  )
}

import { GameDeltaSchema, type SharedCard } from '@beatbattle/shared'
import { t } from '../../i18n'
import { apiFetch } from '../../net/api'
import { useSession } from '../account/session'
import { applyGameDelta } from '../game/rewards'
import { type StoryCard, storyPng } from './storyCard'

/**
 * Compartir una tarjeta para *stories* (§2.15, `RF-SHARE-03`; tareas 6.14 y 7.28): la pinta en el navegador y la
 * comparte con la Web Share API (con el fichero) si el sistema lo deja; si no, la descarga. Compartida o descargada,
 * con sesión, declara `share_card` (`POST /api/me/achievements`, §4.10) diciendo qué tarjeta era (`shared`): la de la
 * batalla lleva su entrada, y el servidor apunta el logro con su semana (§2.10, hueco G1). Si se cancela la hoja de
 * compartir, no se ha compartido nada: ni logro.
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/** Descarga un PNG con su nombre. */
function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** `POST /api/me/achievements` con la tarjeta compartida; lo ganado, al HUD. Un fallo no estropea lo compartido. */
export async function declareShared(shared: SharedCard): Promise<void> {
  if (!useSession.getState().me) return
  try {
    const delta = await apiFetch('/api/me/achievements', {
      method: 'POST',
      body: { achievement: 'share_card', card: shared },
      schema: GameDeltaSchema,
    })
    applyGameDelta(delta)
  } catch (error) {
    console.warn('No se pudo apuntar el logro de compartir', error)
  }
}

export async function shareStory(input: {
  card: StoryCard
  fileName: string
  shared: SharedCard
}): Promise<ShareOutcome> {
  const blob = await storyPng(input.card)
  const file = new File([blob], input.fileName, { type: 'image/png' })
  let outcome: ShareOutcome
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('stories.shareTitle') })
      outcome = 'shared'
    } catch (error) {
      // Cancelar la hoja de compartir no es un error; otro fallo, a la descarga.
      if (error instanceof DOMException && error.name === 'AbortError') outcome = 'cancelled'
      else {
        download(blob, input.fileName)
        outcome = 'downloaded'
      }
    }
  } else {
    download(blob, input.fileName)
    outcome = 'downloaded'
  }
  if (outcome !== 'cancelled') await declareShared(input.shared)
  return outcome
}

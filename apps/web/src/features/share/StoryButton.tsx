import type { SharedCard } from '@beatbattle/shared'
import { type ReactNode, useState } from 'react'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { shareStory } from './shareStory'
import type { StoryCard } from './storyCard'

/**
 * «Tarjeta para stories» (§2.15, `RF-SHARE-03`): pinta la tarjeta en el navegador y la comparte con la Web
 * Share API (con el fichero) si el sistema lo deja; si no, la descarga. Compartida o descargada, declara
 * `share_card` con la tarjeta que era (`shared`, tarea 7.28). La tarjeta puede llegar tarde (`card` como
 * función: la carta carga su foto y su pegatina al pulsar).
 */
export function StoryButton({
  card,
  fileName,
  shared,
  size,
  keyHint,
  children,
}: {
  card: StoryCard | (() => Promise<StoryCard>)
  fileName: string
  shared: SharedCard
  size?: 'sm'
  keyHint?: string
  children?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const onClick = async () => {
    setBusy(true)
    try {
      await shareStory({ card: typeof card === 'function' ? await card() : card, fileName, shared })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" size={size} keyHint={keyHint} disabled={busy} onClick={() => void onClick()}>
      {children ?? t('stories.button')}
    </Button>
  )
}

import { useState } from 'react'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { type StoryCard, storyPng } from './storyCard'

/**
 * «Tarjeta para stories» (§2.15, `RF-SHARE-03`): pinta la tarjeta en el navegador y la comparte con la Web
 * Share API (con el fichero) si el sistema lo deja; si no, la descarga.
 */
export function StoryButton({ card, fileName }: { card: StoryCard; fileName: string }) {
  const [busy, setBusy] = useState(false)
  const onClick = async () => {
    setBusy(true)
    try {
      const blob = await storyPng(card)
      const file = new File([blob], fileName, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t('stories.shareTitle') }).catch(() => {})
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" disabled={busy} onClick={() => void onClick()}>
      {t('stories.button')}
    </Button>
  )
}

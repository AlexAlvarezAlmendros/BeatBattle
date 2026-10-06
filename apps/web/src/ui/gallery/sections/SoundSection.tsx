import { DEFAULT_KEY, SFX_IDS, type SfxId } from '@beatbattle/audio'
import { audio } from '../../../audio/engine'
import { t } from '../../../i18n'
import { Button } from '../../Button'
import { GalleryBlock, GalleryRow, GallerySection } from '../kit'

/** Los efectos de la tarea 1.4 por familia (Anexo D). */
const FAMILIES: readonly { key: 'ui' | 'stars' | 'game'; ids: readonly SfxId[] }[] = [
  { key: 'ui', ids: ['ui.enter', 'ui.hover', 'ui.press'] },
  { key: 'stars', ids: SFX_IDS.filter((id) => id.startsWith('star.')) },
  { key: 'game', ids: ['vote.locked', 'xp.gain', 'level.up'] },
]

/**
 * Banco de escucha de los efectos (guía §3.7, Anexo D; tarea 1.4): cada botón dispara su efecto en la
 * tonalidad por defecto (La menor). El clic es la primera interacción, así que también desbloquea el audio.
 * Con el sonido apagado (M) no suena nada.
 */
export default function SoundSection() {
  const play = (id: SfxId) => {
    audio.unlock()
    audio.setKey(DEFAULT_KEY)
    audio.play(id)
  }
  return (
    <GallerySection id="sonido" title={t('dev.gallery.sections.sound')} intro={t('dev.gallery.sound.intro')}>
      {FAMILIES.map(({ key, ids }) => (
        <GalleryBlock key={key} id={`sonido-${key}`} title={t(`dev.gallery.sound.blocks.${key}`)}>
          <GalleryRow>
            {ids.map((id) => (
              <Button key={id} variant="outline" size="sm" onClick={() => play(id)} data-sfx={id}>
                {id}
              </Button>
            ))}
          </GalleryRow>
        </GalleryBlock>
      ))}
    </GallerySection>
  )
}

import { useState } from 'react'
import { t } from '../../../i18n'
import { GlassProvider } from '../../glass'
import { LayoutSection } from '../LayoutSection'
import { Switch } from '../parts'

/**
 * Piezas del layout copiado del sello (tarea 0.7): isla, pie, hero, marquee, orbes y cristal. Son lo que
 * la guía v0.6 prohíbe (§3.1 «Lo que nunca se imita») y siguen aquí solo mientras existen en la app.
 * **Temporal**: la tarea 0.27 las retira y borra esta sección (y su entrada en `sections/index.ts`).
 */
export default function LegacyLayoutSection() {
  const [glass, setGlass] = useState(true)
  return (
    <GlassProvider enabled={glass}>
      <LayoutSection
        controls={
          <Switch
            checked={glass}
            onChange={setGlass}
            label={t('dev.gallery.controls.glassLayout')}
            hint={t('dev.gallery.controls.glassHint')}
          />
        }
      />
    </GlassProvider>
  )
}

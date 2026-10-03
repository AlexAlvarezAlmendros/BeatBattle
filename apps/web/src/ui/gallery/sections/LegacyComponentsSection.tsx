import { useState } from 'react'
import { t } from '../../../i18n'
import { GlassProvider } from '../../glass'
import { ComponentsSection } from '../ComponentSections'
import { Switch } from '../parts'

/**
 * Componentes de la Fase 0 anterior a la arena (tareas 0.8 y 0.9), tal cual, con su interruptor de
 * cristal. **Temporal**: la tarea 0.25 los rehace al estilo arena con secciones nuevas y esta se borra
 * (y sale de `sections/index.ts`).
 */
export default function LegacyComponentsSection() {
  const [glass, setGlass] = useState(true)
  return (
    <GlassProvider enabled={glass}>
      <ComponentsSection
        surface={glass ? 'glass' : 'solid'}
        controls={
          <Switch
            checked={glass}
            onChange={setGlass}
            label={t('dev.gallery.controls.glass')}
            hint={t('dev.gallery.controls.glassHint')}
          />
        }
      />
    </GlassProvider>
  )
}

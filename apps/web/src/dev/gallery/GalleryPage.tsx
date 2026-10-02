import { useState } from 'react'
import { DocumentTitle } from '../../app/DocumentTitle'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { hasReducedMotionSetting, REDUCED_MOTION_QUERY, setReducedMotion } from '../../hooks/useReducedMotion'
import { t } from '../../i18n'
import type { CardSurface } from '../../ui/Card'
import { ToastViewport } from '../../ui/Toast'
import { COMPONENT_ANCHORS, ComponentsSection } from './ComponentSections'
import {
  ColorSection,
  MotionSection,
  RadiiSection,
  ShadowsSection,
  SpacingSection,
  TypographySection,
} from './FoundationSections'
import styles from './GalleryPage.module.css'
import { Switch } from './parts'

/** Secciones de la galería, en orden, con su ancla (las de los componentes cuelgan de «Componentes»). */
const SECTIONS = [
  { id: 'color', key: 'color' },
  { id: 'tipografia', key: 'typography' },
  { id: 'espaciado', key: 'spacing' },
  { id: 'radios', key: 'radii' },
  { id: 'sombras', key: 'shadows' },
  { id: 'movimiento', key: 'motion' },
  { id: 'componentes', key: 'components' },
] as const

/**
 * `/dev/galeria` — galería de componentes (`RD-VIS-03`, `RD-MOT-03`), solo en desarrollo: la ruta no
 * existe en la construcción de producción.
 *
 * Enseña los tokens (color con su contraste, tipografía, espaciado, radios, sombras y movimiento) y
 * cada componente base de §3.3 en todos sus estados, forzados con `state` para verlos sin
 * interactuar, más una versión interactiva. Dos interruptores: «Reducir movimiento» (pone
 * `data-motion="reduced"` en `<html>`, como el ajuste de accesibilidad) y cristal o macizo.
 */
export function GalleryPage() {
  const [reduced, setReduced] = useState(hasReducedMotionSetting)
  const [glass, setGlass] = useState(true)
  const systemReduced = useMediaQuery(REDUCED_MOTION_QUERY)
  const surface: CardSurface = glass ? 'glass' : 'solid'

  const toggleReduced = (on: boolean) => {
    setReducedMotion(on)
    setReduced(on)
  }

  return (
    <div className={styles.page}>
      <DocumentTitle page={t('dev.gallery.title')} />
      <header className={styles.header}>
        <h1 className={styles.title}>{t('dev.gallery.title')}</h1>
        <p className={styles.summary}>{t('dev.gallery.summary')}</p>
        <fieldset className={styles.controls}>
          <legend className="sr-only">{t('dev.gallery.controls.label')}</legend>
          <Switch
            checked={reduced}
            onChange={toggleReduced}
            label={t('dev.gallery.controls.reducedMotion')}
            hint={
              systemReduced
                ? t('dev.gallery.controls.reducedMotionSystem')
                : t('dev.gallery.controls.reducedMotionHint')
            }
          />
          <Switch
            checked={glass}
            onChange={setGlass}
            label={t('dev.gallery.controls.glass')}
            hint={t('dev.gallery.controls.glassHint')}
          />
        </fieldset>
      </header>

      <nav className={styles.index} aria-label={t('dev.gallery.indexLabel')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ol role="list" className={styles.indexList}>
          {SECTIONS.map(({ id, key }) => (
            <li key={id}>
              <a href={`#${id}`}>{t(`dev.gallery.sections.${key}`)}</a>
              {key === 'components' && (
                // biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none
                <ol role="list" className={styles.indexSub}>
                  {COMPONENT_ANCHORS.map((component) => (
                    <li key={component.id}>
                      <a href={`#${component.id}`}>{t(`dev.gallery.components.${component.key}`)}</a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <ColorSection />
      <TypographySection />
      <SpacingSection />
      <RadiiSection />
      <ShadowsSection />
      <MotionSection />
      <ComponentsSection surface={surface} />
      <ToastViewport />
    </div>
  )
}

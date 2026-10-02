import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { DocumentTitle } from '../../app/DocumentTitle'
import { t } from '../../i18n'
import type { CardSurface } from '../Card'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  hasReducedMotionSetting,
  REDUCED_MOTION_QUERY,
  setReducedMotion,
  subscribeReducedMotion,
} from '../hooks/useReducedMotion'
import { COMPONENT_ANCHORS, LAYOUT_ANCHORS, SECTION_ANCHORS } from './anchors'
import styles from './GalleryPage.module.css'
import { Switch } from './parts'

/** El cuerpo (todos los componentes y Motion) se carga aparte: la cabecera sale al momento. */
const GalleryContent = lazy(async () => ({ default: (await import('./GalleryContent')).GalleryContent }))

/**
 * `/dev/galeria` — galería de componentes (`RD-VIS-03`, `RD-MOT-03`), solo en desarrollo: la ruta no
 * existe en la construcción de producción.
 *
 * Enseña los tokens (color con su contraste, tipografía, espaciado, radios, sombras y movimiento) y
 * cada componente base de §3.3 en todos sus estados, forzados con `state` para verlos sin
 * interactuar, más una versión interactiva, y las piezas del layout del sello (isla, pie, hero, orbes y
 * `GlassSurface`). Dos interruptores: «Reducir movimiento» (pone
 * `data-motion="reduced"` en `<html>`, como el ajuste de accesibilidad) y cristal o macizo.
 *
 * El interruptor de movimiento lee el atributo (sigue también los cambios hechos fuera de la galería)
 * y, al salir de `/dev/galeria`, el atributo vuelve a como estaba al entrar: el ajuste de prueba no se
 * arrastra al resto de la app.
 */
export function GalleryPage() {
  const reduced = useSyncExternalStore(subscribeReducedMotion, hasReducedMotionSetting, () => false)
  const [glass, setGlass] = useState(true)
  const systemReduced = useMediaQuery(REDUCED_MOTION_QUERY)
  const surface: CardSurface = glass ? 'glass' : 'solid'

  useEffect(() => {
    const before = hasReducedMotionSetting()
    return () => setReducedMotion(before)
  }, [])

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
            onChange={setReducedMotion}
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
          {SECTION_ANCHORS.map(({ id, key }) => (
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
              {key === 'layout' && (
                // biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none
                <ol role="list" className={styles.indexSub}>
                  {LAYOUT_ANCHORS.map((piece) => (
                    <li key={piece.id}>
                      <a href={`#${piece.id}`}>{t(`dev.gallery.layout.pieces.${piece.key}`)}</a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <Suspense fallback={<p className={styles.summary}>{t('common.loading')}</p>}>
        <GalleryContent surface={surface} />
      </Suspense>
    </div>
  )
}

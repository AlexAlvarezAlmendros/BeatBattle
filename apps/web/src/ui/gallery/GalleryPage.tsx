import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { DocumentTitle } from '../../app/DocumentTitle'
import { t } from '../../i18n'
import { frameAttributes } from '../Frame'
import { cx } from '../forceState'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  hasReducedMotionSetting,
  REDUCED_MOTION_QUERY,
  setReducedMotion,
  subscribeReducedMotion,
} from '../hooks/useReducedMotion'
import { isSeriousMode, setSeriousMode, subscribeSeriousMode } from '../hooks/useSeriousMode'
import { GallerySwitch } from './kit'
import styles from './kit.module.css'
import { GALLERY_SECTIONS } from './sections'

/** Cada sección se carga aparte (`React.lazy`): la cabecera y el índice salen al momento. */
const SECTION_COMPONENTS = new Map(GALLERY_SECTIONS.map((section) => [section.id, lazy(section.load)]))

/**
 * `/dev/galeria` — galería de la arena (`RD-VIS-03`, `RD-MOT-03`), solo en desarrollo: la ruta no
 * existe en la construcción de producción.
 *
 * Las secciones salen del registro (`sections/index.ts`, un fichero por sección). Dos interruptores en
 * la cabecera: «Reducir movimiento» (`<html data-motion="reduced">`, como el ajuste de accesibilidad) y
 * «Modo serio» (`<html data-serious>`). Los dos siguen el atributo aunque cambie fuera y, al salir de la
 * galería, lo dejan como estaba al entrar: el ajuste de prueba no se arrastra al resto de la app.
 */
export function GalleryPage() {
  const reduced = useSyncExternalStore(subscribeReducedMotion, hasReducedMotionSetting, () => false)
  const serious = useSyncExternalStore(subscribeSeriousMode, isSeriousMode, () => false)
  const systemReduced = useMediaQuery(REDUCED_MOTION_QUERY)

  useEffect(() => {
    const before = { reduced: hasReducedMotionSetting(), serious: isSeriousMode() }
    return () => {
      setReducedMotion(before.reduced)
      setSeriousMode(before.serious)
    }
  }, [])

  return (
    <div className={styles.page}>
      <DocumentTitle page={t('dev.gallery.title')} />
      <header className={styles.header}>
        <p className={cx('bb-label', styles.kicker)}>{t('dev.gallery.kicker')}</p>
        <h1 className={cx('bb-display', styles.title)}>{t('dev.gallery.title')}</h1>
        <p className={styles.summary}>{t('dev.gallery.summary')}</p>
        <fieldset className={styles.controls}>
          <legend className="sr-only">{t('dev.gallery.controls.label')}</legend>
          <GallerySwitch
            checked={reduced}
            onChange={setReducedMotion}
            label={t('dev.gallery.controls.reducedMotion')}
            hint={
              systemReduced
                ? t('dev.gallery.controls.reducedMotionSystem')
                : t('dev.gallery.controls.reducedMotionHint')
            }
          />
          <GallerySwitch
            checked={serious}
            onChange={setSeriousMode}
            label={t('dev.gallery.controls.serious')}
            hint={t('dev.gallery.controls.seriousHint')}
          />
        </fieldset>
      </header>

      <nav className={styles.index} aria-label={t('dev.gallery.indexLabel')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ol role="list" className={styles.indexList}>
          {GALLERY_SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className={styles.indexLink}>
                {t(section.title)}
              </a>
              {section.anchors && (
                // biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none
                <ol role="list" className={styles.indexSub}>
                  {section.anchors.map((anchor) => (
                    <li key={anchor.id}>
                      <a
                        href={`#${anchor.id}`}
                        {...frameAttributes({ cut: 'sm' })}
                        className={styles.indexSubLink}
                      >
                        {t(anchor.label)}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {GALLERY_SECTIONS.map((section) => {
        const Section = SECTION_COMPONENTS.get(section.id)!
        return (
          <Suspense key={section.id} fallback={<p className={styles.summary}>{t('common.loading')}</p>}>
            <Section />
          </Suspense>
        )
      })}
    </div>
  )
}

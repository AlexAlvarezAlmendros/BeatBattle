import { type ReactNode, useId, useRef } from 'react'
import type { SettingsSectionKey } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { frameAttributes } from '../../ui/Frame'
import { useFitText } from '../../ui/hooks/useFitText'
import { Key } from '../../ui/Key'
import { SettingsTabs } from './SettingsLayout'
import styles from './SettingsSection.module.css'

/**
 * Una sección de Opciones que ya funciona (Fase 2): las pestañas, el título para lectores (la pestaña
 * elegida ya lo nombra) y el panel con los controles reales. La pieza de la cuña es el emblema de la
 * sección (su nombre en display y cómo cambiar de sección), no la vista previa de las provisionales.
 */
export function SettingsSection({
  section,
  summary,
  piece,
  children,
}: {
  section: SettingsSectionKey
  summary?: ReactNode
  /** Una pieza propia en vez del emblema (Perfil: la carta en vista previa). */
  piece?: ReactNode
  children: ReactNode
}) {
  const title = t(`settings.${section}.title`)
  const titleRef = useRef<HTMLSpanElement>(null)
  // El título del emblema en una línea: con «PRIVACIDAD» la columna ya no se ensancha (jurado de la 2.25).
  useFitText(titleRef, title)
  return (
    <ScreenPage
      title={title}
      kicker={t('frame.plates.settings')}
      titlePlacement="tabs"
      pieceAlign="start"
      summary={summary}
      piece={
        piece ?? (
          <div
            {...frameAttributes({ cut: 'lg' })}
            className={styles.emblem}
            aria-hidden="true"
            data-settings-emblem=""
          >
            <span className="bb-label">{t('frame.plates.settings')}</span>
            <span ref={titleRef} className={`bb-display ${styles.emblemTitle}`}>
              {title}
            </span>
            <span className={styles.emblemKeys}>
              <Key>Q</Key> <Key>E</Key> {t('settings.changeSection')}
            </span>
          </div>
        )
      }
      tabs={<SettingsTabs />}
      documentTitle={t('settings.pageTitle', { section: title })}
    >
      <div className={styles.body}>{children}</div>
    </ScreenPage>
  )
}

/**
 * Un grupo de opciones con su título (un `fieldset`, que no estira el panel): conmutadores en fila que
 * saltan de línea (`chips`), placas de opción en una rejilla de columnas iguales (`plates`, con
 * `FilterChip variant="plate"`) o un formulario apilado (`stack`).
 */
export function SettingsGroup({
  title,
  help,
  layout = 'chips',
  children,
}: {
  title: string
  help?: ReactNode
  layout?: 'chips' | 'stack' | 'plates'
  children: ReactNode
}) {
  const helpId = useId()
  return (
    <fieldset className={styles.group} aria-describedby={help ? helpId : undefined}>
      <legend className={styles.legend}>{title}</legend>
      {help && (
        <p id={helpId} className={styles.help}>
          {help}
        </p>
      )}
      <div className={styles[layout === 'chips' ? 'controls' : layout]}>{children}</div>
    </fieldset>
  )
}

/**
 * La línea de estado de una sección («Guardado.»): siempre en el DOM, para que los lectores de pantalla
 * anuncien cada cambio de texto.
 */
export function SettingsStatus({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <p className={styles.status} role="status" aria-busy={busy || undefined}>
      {children}
    </p>
  )
}

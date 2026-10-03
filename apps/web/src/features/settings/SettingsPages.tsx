import { type ReactNode, useId } from 'react'
import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { SettingsSectionKey } from '../../app/paths'
import { t } from '../../i18n'
import { FilterChip } from '../../ui/Chip'
import { useShortcuts } from '../../ui/shortcuts'
import { SettingsPreview } from './SettingsPreview'

/*
 * Secciones de `/ajustes/*` (Opciones, §3.8.14; §2.3, §2.12.4, RNF-A11Y-08), en el orden de sus pestañas:
 * Sonido · Movimiento · Cuenta · Perfil · Emails · Sesiones · Privacidad · Accesibilidad. Una por ruta
 * para que cada fase sustituya la suya sin tocar las demás. Provisionales (0.10).
 */

/** `/ajustes/sonido` */
export function SoundSettingsPage() {
  return <SettingsSectionPlaceholder section="sound" />
}

/** `/ajustes/movimiento` */
export function MotionSettingsPage() {
  return <SettingsSectionPlaceholder section="motion" />
}

function SettingsSectionPlaceholder({
  section,
  children,
}: {
  section: SettingsSectionKey
  children?: ReactNode
}) {
  const title = t(`settings.${section}.title`)
  return (
    <PlaceholderPage
      title={title}
      // En móvil, donde el HUD no lleva placa, «OPCIONES» encima del título, como las otras interiores.
      kicker={t('frame.plates.settings')}
      summary={t(`settings.${section}.summary`)}
      // La pieza de la cuña: las placas de la sección en vista previa (el sello «EN OBRAS» pasa al panel).
      piece={<SettingsPreview section={section} />}
      documentTitle={t('settings.pageTitle', { section: title })}
    >
      {children}
    </PlaceholderPage>
  )
}

/** `/ajustes/cuenta` */
export function AccountSettingsPage() {
  return <SettingsSectionPlaceholder section="account" />
}

/** `/ajustes/perfil` */
export function ProfileSettingsPage() {
  return <SettingsSectionPlaceholder section="profile" />
}

/** `/ajustes/emails` */
export function EmailSettingsPage() {
  return <SettingsSectionPlaceholder section="emails" />
}

/** `/ajustes/sesiones` */
export function SessionsSettingsPage() {
  return <SettingsSectionPlaceholder section="sessions" />
}

/** `/ajustes/privacidad` */
export function PrivacySettingsPage() {
  return <SettingsSectionPlaceholder section="privacy" />
}

/**
 * `/ajustes/accesibilidad` (RNF-A11Y-08). Ya funciona el interruptor de los **atajos de una tecla**
 * (WCAG 2.1.4, `ui/shortcuts.ts`); el tamaño de texto y la puerta de entrada llegan con sus fases.
 */
export function AccessibilitySettingsPage() {
  return (
    <SettingsSectionPlaceholder section="accessibility">
      <ShortcutsOption />
    </SettingsSectionPlaceholder>
  )
}

/** «Atajos de una tecla [SÍ/NO]»: conmutador con su explicación (§3.3 «Chip de filtro»). */
function ShortcutsOption() {
  const enabled = useShortcuts((state) => state.enabled)
  const set = useShortcuts((state) => state.set)
  const helpId = useId()
  return (
    <div className="settings-option">
      <FilterChip
        label={t('settings.accessibility.shortcuts.label')}
        pressed={enabled}
        onChange={set}
        aria-describedby={helpId}
      />
      <p id={helpId} className="settings-option-help">
        {t('settings.accessibility.shortcuts.help')}
      </p>
    </div>
  )
}

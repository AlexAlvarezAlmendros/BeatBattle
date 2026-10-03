import { PlaceholderPage } from '../../app/PlaceholderPage'
import type { SettingsSectionKey } from '../../app/paths'
import { t } from '../../i18n'

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

function SettingsSectionPlaceholder({ section }: { section: SettingsSectionKey }) {
  const title = t(`settings.${section}.title`)
  return (
    <PlaceholderPage
      title={title}
      summary={t(`settings.${section}.summary`)}
      documentTitle={t('settings.pageTitle', { section: title })}
    />
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

/** `/ajustes/accesibilidad` */
export function AccessibilitySettingsPage() {
  return <SettingsSectionPlaceholder section="accessibility" />
}

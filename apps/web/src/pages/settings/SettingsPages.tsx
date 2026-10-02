import type { SettingsSectionKey } from '../../app/paths'
import { t } from '../../i18n'
import { PlaceholderPage } from '../PlaceholderPage'

/*
 * Secciones de `/ajustes/*` (§2.3, §2.12.4, RNF-A11Y-08). Una por ruta para que cada fase sustituya la
 * suya sin tocar las demás. Provisionales (0.10).
 */

function SettingsSectionPlaceholder({ section }: { section: SettingsSectionKey }) {
  const title = t(`settings.${section}.title`)
  return (
    <PlaceholderPage
      title={title}
      summary={t(`settings.${section}.summary`)}
      documentTitle={`${title} · ${t('settings.title')}`}
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

/** `/ajustes/sonido` */
export function SoundSettingsPage() {
  return <SettingsSectionPlaceholder section="sound" />
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

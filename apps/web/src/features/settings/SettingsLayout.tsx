import { Outlet } from 'react-router'
import { paths, SETTINGS_SECTIONS, type SettingsSection } from '../../app/paths'
import { t } from '../../i18n'
import { TabLinks } from '../../ui/Tabs'
import './settings.css'

/**
 * `/ajustes/*` — **Opciones** (guía §3.8.14; requiere sesión desde la Fase 2): las secciones como
 * pestañas con Q/E y la sección activa debajo, en la plantilla de pantalla interior. `/ajustes` lleva a
 * la primera, `cuenta`.
 */
export function SettingsLayout() {
  return (
    <div className="settings-layout">
      <TabLinks
        label={t('settings.navLabel')}
        links={(Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).map((section) => ({
          to: paths.settings(section),
          label: t(`settings.${SETTINGS_SECTIONS[section]}.title`),
        }))}
      />
      <Outlet />
    </div>
  )
}

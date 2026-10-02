import { NavLink, Outlet } from 'react-router'
import { paths, SETTINGS_SECTIONS, type SettingsSection } from '../../app/paths'
import { t } from '../../i18n'
import './settings.css'

/**
 * `/ajustes/*` — marco de los ajustes (§2.18; requiere sesión desde la Fase 2): navegación entre
 * secciones y la sección activa. `/ajustes` lleva a la primera, `cuenta`.
 */
export function SettingsLayout() {
  return (
    <div className="settings-layout">
      <nav aria-label={t('settings.navLabel')}>
        <p className="settings-layout__label">{t('settings.title')}</p>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list">
          {(Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).map((section) => (
            <li key={section}>
              <NavLink to={paths.settings(section)}>
                {t(`settings.${SETTINGS_SECTIONS[section]}.title`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="settings-layout__section">
        <Outlet />
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { t } from '../../i18n'
import { Cursor } from '../Cursor'
import { cx } from '../forceState'
import { isCharacterKey, isEditableTarget } from '../hooks/roving'
import { Key } from '../Key'
import styles from './Tabs.module.css'

export interface TabLink {
  to: string
  label: string
}

/**
 * Pestañas que son secciones con su propia URL (guía §3.8.14: las de Opciones; los documentos legales):
 * enlaces con la forma de las pestañas de §3.3 (paralelogramos de 44 px, la activa en blanco) y `[Q]`
 * `[E]` a los lados, que van a la sección anterior y a la siguiente desde cualquier parte de la
 * pantalla. Son navegación (`<nav>` con `aria-current`), no un `tablist`: cada una carga su pantalla.
 */
export function TabLinks({
  label,
  links,
  className,
}: {
  label: string
  links: readonly TabLink[]
  className?: string
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const current = links.findIndex((link) => pathname === link.to || pathname.startsWith(`${link.to}/`))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isCharacterKey(event) || isEditableTarget(event.target))
        return
      const key = event.key.toLowerCase()
      if (key !== 'q' && key !== 'e') return
      event.preventDefault()
      const from = Math.max(0, current)
      const next = (from + (key === 'e' ? 1 : -1) + links.length) % links.length
      navigate(links[next]!.to)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [current, links, navigate])

  return (
    <nav aria-label={label} className={cx(styles.row, className)}>
      <Key aria-hidden="true">{t('ui.tabs.previousKey')}</Key>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className={styles.list}>
        {links.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} className={styles.tab} data-cursor="" end>
              <Cursor shape="slant" slant="sm" />
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <Key aria-hidden="true">{t('ui.tabs.nextKey')}</Key>
    </nav>
  )
}

import type { ReactNode } from 'react'
import { t } from '../../i18n'
import { Cursor } from '../Cursor'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { useRovingTabs } from '../hooks/useRovingTabs'
import { Key } from '../Key'
import styles from './Tabs.module.css'

export interface TabItem {
  id: string
  label: ReactNode
  panel: ReactNode
  /** Deshabilitada: el cursor pasa por ella, pero no se elige (§3.3). */
  disabled?: boolean
}

export interface TabsProps {
  /** Nombre accesible de la lista de pestañas. */
  label: string
  tabs: readonly TabItem[]
  selectedIndex?: number
  defaultIndex?: number
  onChange?: (index: number) => void
  /** Q y E desde cualquier parte de la pantalla (una sola lista por pantalla; por defecto, sí). */
  globalKeys?: boolean
  /** Estado forzado de una pestaña, para la galería. */
  forced?: { index: number; state: InteractionState }
  className?: string
}

/**
 * Pestañas (guía §3.3): paralelogramos de 44 px con `[Q]` y `[E]` a los lados; la activa en blanco
 * con texto negro. `role="tablist"` con foco itinerante (`useRovingTabs`): ←/→ en bucle, Inicio/Fin,
 * Q/E desde cualquier parte de la pantalla. El foco es el cursor de juego (paralelogramo pequeño).
 */
export function Tabs({
  label,
  tabs,
  selectedIndex,
  defaultIndex,
  onChange,
  globalKeys = true,
  forced,
  className,
}: TabsProps) {
  const roving = useRovingTabs({
    count: tabs.length,
    selectedIndex,
    defaultIndex,
    onChange,
    globalKeys,
    isDisabled: (index) => Boolean(tabs[index]?.disabled),
  })
  return (
    <div className={cx(styles.tabs, className)}>
      <div className={styles.row}>
        <Key aria-hidden="true">{t('ui.tabs.previousKey')}</Key>
        <div {...roving.getTabListProps({ 'aria-label': label })} className={styles.list}>
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              {...roving.getTabProps<HTMLButtonElement>(index)}
              className={styles.tab}
              {...forceStateAttr(forced?.index === index ? forced.state : undefined)}
            >
              <Cursor shape="slant" slant="sm" />
              {tab.disabled && <span className="sr-only">{t('ui.tabs.disabled')}</span>}
              {tab.label}
            </button>
          ))}
        </div>
        <Key aria-hidden="true">{t('ui.tabs.nextKey')}</Key>
      </div>
      {tabs.map((tab, index) => (
        <div key={tab.id} {...roving.getPanelProps(index)} className={styles.panel}>
          {tab.panel}
        </div>
      ))}
    </div>
  )
}

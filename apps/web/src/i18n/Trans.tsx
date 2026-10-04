import { createElement, Fragment, type ReactNode } from 'react'
import { type MessageKey, t } from './index'

interface TransProps {
  /** Clave de `es.json` con variables entre llaves: `"{page} · Beat Battle"`. */
  k: MessageKey
  /** Valor de cada variable: textos, números (se formatean en castellano) o elementos. */
  values: Readonly<Record<string, ReactNode>>
}

/**
 * Mensaje con elementos dentro (un enlace en mitad de una frase). El texto, el orden y los
 * separadores salen de `es.json`; el JSX solo pone los elementos:
 *
 * ```tsx
 * <Trans k="app.pageTitle" values={{ page: <a href={url}>…</a> }} />
 * ```
 */
export function Trans({ k, values }: TransProps) {
  // Los trozos van como hijos sueltos (no como array) para que React no pida `key` a cada uno.
  return createElement(Fragment, null, ...t.parts<ReactNode>(k, values))
}

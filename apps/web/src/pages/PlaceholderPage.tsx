import type { ReactNode } from 'react'
import { DocumentTitle } from '../app/DocumentTitle'
import './placeholder.css'

interface PlaceholderPageProps {
  /** Encabezado `<h1>` de la página (ya traducido). */
  title: string
  /** Una línea que cuenta qué irá aquí (ya traducida). */
  summary: string
  /** Título de la pestaña; por defecto, el propio `title`. `null` deja el de la marca (home). */
  documentTitle?: string | null
  children?: ReactNode
}

/**
 * Página provisional (tarea 0.10): título, `<h1>` y una línea sobre lo que será. Cada fase la sustituye
 * por la pantalla real de su ruta.
 */
export function PlaceholderPage({ title, summary, documentTitle = title, children }: PlaceholderPageProps) {
  return (
    <div className="placeholder-page">
      <DocumentTitle page={documentTitle ?? undefined} />
      <h1>{title}</h1>
      <p>{summary}</p>
      {children}
    </div>
  )
}

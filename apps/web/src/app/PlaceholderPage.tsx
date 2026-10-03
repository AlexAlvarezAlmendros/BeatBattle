import type { ReactNode } from 'react'
import { ScreenPage, UnderConstruction } from './ScreenPage'

interface PlaceholderPageProps {
  /** Encabezado `<h1>` de la pantalla (ya traducido). */
  title: string
  /** Una línea que cuenta qué irá aquí (ya traducida). */
  summary: string
  /** Título de la pestaña; por defecto, el propio `title`. `null` deja el de la marca (home). */
  documentTitle?: string | null
  /** Rótulo encima del título. */
  kicker?: string
  children?: ReactNode
}

/**
 * Pantalla provisional (tareas 0.10 y 0.26): la plantilla de pantalla interior de la arena con su
 * título, una línea sobre lo que será y el sello «EN OBRAS». Cada fase la sustituye por la pantalla
 * real de su ruta.
 */
export function PlaceholderPage({
  title,
  summary,
  documentTitle = title,
  kicker,
  children,
}: PlaceholderPageProps) {
  return (
    <ScreenPage
      title={title}
      kicker={kicker}
      summary={summary}
      documentTitle={documentTitle}
      aside={<UnderConstruction />}
    >
      {children}
    </ScreenPage>
  )
}

import type { ReactNode } from 'react'
import { ScreenPage, type ScreenPageProps, UnderConstruction } from './ScreenPage'

interface PlaceholderPageProps {
  /** Encabezado `<h1>` de la pantalla (ya traducido). */
  title: string
  /** Una línea que cuenta qué irá aquí (ya traducida). */
  summary: string
  /** Título de la pestaña; por defecto, el propio `title`. `null` deja el de la marca (home). */
  documentTitle?: string | null
  /** Rótulo encima del título. */
  kicker?: string
  /**
   * La pieza de la cuña (el logo con su lockup en la autenticación). Sin ella, la pieza es el sello
   * «EN OBRAS»; con ella, el sello va arriba del panel.
   */
  piece?: ReactNode
  /** Reparto de la pantalla (`ScreenPage`): `title` en la autenticación, como la pantalla de título. */
  layout?: ScreenPageProps['layout']
  /** Las pestañas de la pantalla (`ScreenPage`): las secciones de Opciones. */
  tabs?: ReactNode
  /** La pantalla llena el alto entre el HUD y la barra (`ScreenPage`): solo las de contenido. */
  fill?: boolean
  children?: ReactNode
}

/**
 * Pantalla provisional (tareas 0.10, 0.26 y 0.28): la plantilla de pantalla interior de la arena con su
 * título, una línea sobre lo que será y el sello «EN OBRAS» como pieza de la cuña (o arriba del panel,
 * si la pantalla trae su propia pieza). Cada fase la sustituye por la pantalla real de su ruta.
 */
export function PlaceholderPage({
  title,
  summary,
  documentTitle = title,
  kicker,
  piece,
  layout,
  tabs,
  fill,
  children,
}: PlaceholderPageProps) {
  return (
    <ScreenPage
      title={title}
      kicker={kicker}
      summary={summary}
      documentTitle={documentTitle}
      piece={piece ?? <UnderConstruction big />}
      badge={piece ? <UnderConstruction /> : undefined}
      layout={layout}
      tabs={tabs}
      fill={fill}
    >
      {children}
    </ScreenPage>
  )
}

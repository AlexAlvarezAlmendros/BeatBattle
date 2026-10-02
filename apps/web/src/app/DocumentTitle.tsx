import { t } from '../i18n'

/** Título de la pestaña: «<Página> · Beat Battle», o el de la marca si no hay página (la home). */
export function documentTitle(page?: string): string {
  return page ? t('app.pageTitle', { page }) : t('app.documentTitle')
}

/**
 * Fija el título del documento desde cualquier página. React 19 sube el `<title>` al `<head>` y lo
 * pone delante del de `index.html`, así que manda el de la página que está montada; al salir de ella,
 * desaparece con ella. Las páginas con datos (una semana, un perfil) lo renderizan cuando los tienen.
 */
export function DocumentTitle({ page }: { page?: string }) {
  return <title>{documentTitle(page)}</title>
}

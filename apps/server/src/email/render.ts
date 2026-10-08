import { renderEmail as renderTemplate, TEMPLATES, type TemplateKind } from '@beatbattle/emails'
import type { RenderEmail } from './outbox'
import { pageFromOneClick } from './unsubscribe'

/** Un email de la cola cuyo tipo aún no tiene plantilla (llega con su fase): el envío falla y se reintenta. */
export class MissingTemplateError extends Error {
  constructor(kind: string) {
    super(`Sin plantilla para «${kind}»`)
    this.name = 'MissingTemplateError'
  }
}

export const hasTemplate = (kind: string): kind is TemplateKind => kind in TEMPLATES

/**
 * Renderizador de la cola (guía §4.19.3 y §4.19.4, tarea 2.9): la plantilla del tipo con el `payload`
 * guardado del hecho, la familia, la URL pública y, si el email lleva baja, la **página** de baja del pie
 * (la de un clic va en la cabecera).
 */
export function createRenderer(options: { publicUrl: string; postalAddress?: string }): RenderEmail {
  return async (row, context) => {
    if (!hasTemplate(row.kind)) throw new MissingTemplateError(row.kind)
    const template = TEMPLATES[row.kind]
    const email = await renderTemplate(
      // biome-ignore lint/suspicious/noExplicitAny: el `payload` lo escribió quien encoló este mismo tipo
      template as any,
      JSON.parse(row.payload),
      {
        publicUrl: options.publicUrl,
        family: row.family,
        postalAddress: options.postalAddress,
        unsubscribePageUrl: context.unsubscribeUrl
          ? pageFromOneClick(context.unsubscribeUrl, options.publicUrl)
          : undefined,
      },
    )
    return { subject: email.subject, html: email.html, text: email.text }
  }
}

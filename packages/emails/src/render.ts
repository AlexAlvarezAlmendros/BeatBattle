import { render } from '@react-email/render'
import { createElement } from 'react'
import { EmailProvider } from './context'
import type { EmailTemplate, RenderContext } from './template'

export interface RenderedEmail {
  subject: string
  preheader: string
  html: string
  /** Versión de texto plano completa (§2.12.6: ningún email sale sin ella). */
  text: string
}

/** Pinta una plantilla con su contexto (URL pública, familia, baja): asunto, *preheader*, HTML y texto. */
export async function renderEmail<P>(
  template: EmailTemplate<P>,
  payload: P,
  context: RenderContext,
): Promise<RenderedEmail> {
  const tree = createElement(EmailProvider, { value: context }, template.body(payload))
  const [html, text] = await Promise.all([render(tree), render(tree, { plainText: true })])
  return { subject: template.subject(payload), preheader: template.preheader(payload), html, text }
}

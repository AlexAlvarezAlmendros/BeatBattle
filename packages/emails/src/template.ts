import type { ReactElement } from 'react'
import type { EmailContextValue } from './context'

/**
 * Una plantilla del catálogo (guía §4.19.4): el asunto y el *preheader* a partir del `payload` guardado en
 * la cola, y el cuerpo. El HTML y el texto plano los saca `renderEmail` del mismo árbol.
 */
export interface EmailTemplate<Payload> {
  subject(payload: Payload): string
  preheader(payload: Payload): string
  body(payload: Payload): ReactElement
  /** Datos de ejemplo para el visor (`pnpm emails:dev`) y la galería de emails. */
  fixture: Payload
}

export type RenderContext = EmailContextValue

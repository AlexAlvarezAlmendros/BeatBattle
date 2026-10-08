/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { createContext, useContext } from 'react'

export type EmailFamily = 'service' | 'battle' | 'marketing'

/** Lo que todas las piezas necesitan saber del email que se está pintando. */
export interface EmailContextValue {
  /** URL pública de la web, sin barra final (las imágenes y los enlaces cuelgan de ella). */
  publicUrl: string
  family: EmailFamily
  /** Página de baja de este tipo (avisos y marketing, `GET /api/unsubscribe?token=`); el servicio no lleva. */
  unsubscribePageUrl?: string
  /** Dirección postal del sello para el pie (LSSI): se enseña si está configurada. */
  postalAddress?: string
}

const EmailContext = createContext<EmailContextValue>({
  publicUrl: 'http://localhost:5173',
  family: 'service',
})

export const EmailProvider = EmailContext.Provider
export const useEmail = () => useContext(EmailContext)

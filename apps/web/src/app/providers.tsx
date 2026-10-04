import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { isRetryable } from '../net/api'

/** Reintentos por defecto de una consulta. Cada recurso puede pedir más en su `xxxQuery()`. */
export const DEFAULT_QUERY_RETRIES = 1

/**
 * ¿Se reintenta una consulta que ha fallado? Solo los fallos pasajeros (sin red o 5xx, ver
 * `isRetryable`) y hasta `DEFAULT_QUERY_RETRIES` veces: un 4xx o un desajuste de contrato
 * (`BAD_RESPONSE` con 2xx) daría lo mismo al repetirlo.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < DEFAULT_QUERY_RETRIES && isRetryable(error)
}

/** Cliente de datos del servidor (guía §4.7.2). Un cliente por árbol para que los tests no compartan caché. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetryQuery, refetchOnWindowFocus: false },
    },
  })
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

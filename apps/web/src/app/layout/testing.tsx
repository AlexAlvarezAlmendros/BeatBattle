import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'

/** Cliente de TanStack Query para tests: sin reintentos ni caché entre tests. */
export function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

/**
 * Solo para tests: pinta una pieza del marco dentro de un router en memoria, en la ruta `path`. Cualquier
 * otra ruta pinta lo mismo, así que navegar no desmonta la pieza.
 */
export function renderInRouter(element: ReactElement, path = '/') {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] })
  const client = testQueryClient()
  return {
    router,
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  }
}

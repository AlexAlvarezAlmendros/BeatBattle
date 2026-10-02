import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'

/**
 * Solo para tests: pinta una pieza del marco dentro de un router en memoria, en la ruta `path`. Cualquier
 * otra ruta pinta lo mismo, así que navegar no desmonta la pieza.
 */
export function renderInRouter(element: ReactElement, path = '/') {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] })
  return { router, ...render(<RouterProvider router={router} />) }
}

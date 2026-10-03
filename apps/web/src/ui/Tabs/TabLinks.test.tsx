import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TabLinks } from './TabLinks'

const LINKS = [
  { to: '/legal/bases', label: 'Bases' },
  { to: '/legal/terminos', label: 'Términos' },
  { to: '/legal/cookies', label: 'Cookies' },
]

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <TabLinks label="Legal" links={LINKS} /> }], {
    initialEntries: [path],
  })
  render(<RouterProvider router={router} />)
  return router
}

describe('TabLinks (secciones con su URL, §3.8.14)', () => {
  it('es una navegación con la sección actual marcada (aria-current)', () => {
    renderAt('/legal/terminos')
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Términos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Bases' })).not.toHaveAttribute('aria-current')
  })

  it('Q y E van a la sección anterior y a la siguiente (en bucle)', () => {
    const router = renderAt('/legal/bases')
    fireEvent.keyDown(document.body, { key: 'e' })
    expect(router.state.location.pathname).toBe('/legal/terminos')
    fireEvent.keyDown(document.body, { key: 'q' })
    fireEvent.keyDown(document.body, { key: 'q' })
    expect(router.state.location.pathname).toBe('/legal/cookies')
  })
})

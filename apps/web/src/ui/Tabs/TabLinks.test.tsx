import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useShortcuts } from '../shortcuts'
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

afterEach(() => {
  useShortcuts.getState().set(true)
  localStorage.clear()
})

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

  it('RNF-A11Y-08 / WCAG 2.1.4: con los atajos de una tecla apagados, Q/E solo actúan con el foco en las pestañas', () => {
    useShortcuts.getState().set(false)
    const router = renderAt('/legal/bases')
    fireEvent.keyDown(document.body, { key: 'e' })
    expect(router.state.location.pathname).toBe('/legal/bases')
    const current = screen.getByRole('link', { name: 'Bases' })
    current.focus()
    fireEvent.keyDown(current, { key: 'e' })
    expect(router.state.location.pathname).toBe('/legal/terminos')
  })
})

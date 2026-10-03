import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, NavigationType, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useShortcuts } from '../shortcuts'
import { keepsTabFocus, TabLinks } from './TabLinks'

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

  it('RNF-A11Y-08 / WCAG 2.1.4: Q/E con el foco en las pestañas dejan el foco en la sección nueva y se encadenan con los atajos apagados', async () => {
    useShortcuts.getState().set(false)
    const router = renderAt('/legal/bases')
    screen.getByRole('link', { name: 'Bases' }).focus()
    fireEvent.keyDown(document.activeElement as Element, { key: 'e' })
    expect(router.state.location.pathname).toBe('/legal/terminos')
    await waitFor(() => expect(screen.getByRole('link', { name: 'Términos' })).toHaveFocus())
    fireEvent.keyDown(document.activeElement as Element, { key: 'e' })
    expect(router.state.location.pathname).toBe('/legal/cookies')
    await waitFor(() => expect(screen.getByRole('link', { name: 'Cookies' })).toHaveFocus())
  })

  it('RNF-A11Y-08: Q/E con el foco fuera de las pestañas no se lo llevan a ellas', () => {
    const router = renderAt('/legal/bases')
    fireEvent.keyDown(document.body, { key: 'e' })
    expect(router.state.location.pathname).toBe('/legal/terminos')
    expect(document.body).toHaveFocus()
  })

  it('keepsTabFocus: solo en una navegación nueva con el estado de Q/E (al recargar o volver atrás, no)', () => {
    expect(keepsTabFocus({ keepTabFocus: true }, NavigationType.Push)).toBe(true)
    expect(keepsTabFocus({ keepTabFocus: true }, NavigationType.Pop)).toBe(false)
    expect(keepsTabFocus(null, NavigationType.Push)).toBe(false)
    expect(keepsTabFocus({ other: 1 }, NavigationType.Push)).toBe(false)
  })
})

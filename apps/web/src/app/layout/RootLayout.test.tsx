import { act, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { toast, useToasts } from '../../ui/Toast/useToasts'
import { RootLayout } from './RootLayout'

function renderFrame(path = '/') {
  const router = createMemoryRouter(
    [{ element: <RootLayout />, children: [{ path: '*', element: <h1>Página</h1> }] }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const regions = () => screen.getAllByRole('region', { name: t('ui.toast.region') })

beforeEach(() => {
  // jsdom no implementa el scroll que hace `ScrollRestoration`.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  act(() => useToasts.getState().clear())
  vi.restoreAllMocks()
})

describe('RootLayout: zona de avisos del marco (§3.3)', () => {
  it('RNF-A11Y-07: el marco monta la zona de avisos una sola vez, con las dos regiones vivas vacías', async () => {
    const router = renderFrame()
    expect(regions()).toHaveLength(1)
    const [zone] = regions()
    expect(zone!.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(zone!.querySelectorAll('[aria-live="assertive"]')).toHaveLength(1)
    for (const region of zone!.querySelectorAll('[aria-live]')) expect(region).toBeEmptyDOMElement()

    // Al navegar sigue siendo la misma: el marco no se vuelve a montar.
    await act(() => router.navigate('/semanas'))
    expect(regions()).toEqual([zone])
  })

  it('RNF-A11Y-07: un aviso lanzado desde cualquier página sale en la zona del marco', async () => {
    renderFrame('/jurado')
    act(() => {
      toast.success('Beat subido')
    })
    const polite = regions()[0]!.querySelector<HTMLElement>('[aria-live="polite"]')!
    expect(await within(polite).findByText('Beat subido')).toBeInTheDocument()
  })
})

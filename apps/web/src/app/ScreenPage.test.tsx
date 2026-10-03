import { act, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n'
import { RootLayout } from './layout/RootLayout'
import { interiorScreen } from './layout/screen'
import { NotFoundPage } from './NotFoundPage'
import { PlaceholderPage } from './PlaceholderPage'

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          {
            path: 'semanas',
            handle: { screen: interiorScreen({ kicker: 'frame.plates.weeks', title: 'pages.weeks.title' }) },
            element: <PlaceholderPage title="Semanas" summary="Aquí irá el archivo." />,
          },
          {
            path: '*',
            handle: {
              screen: interiorScreen({ kicker: 'frame.plates.legal', title: 'frame.plates.legalTitle' }),
            },
            element: <NotFoundPage />,
          },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

describe('plantilla de pantalla interior (0.26, §3.8.14)', () => {
  it('título en display como <h1>, el resumen en el panel, el sello «EN OBRAS» y «Volver al menú [ESC]»', async () => {
    renderAt('/semanas')
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1, name: 'Semanas' })).toHaveClass('bb-display')
    // Con placa de título en el HUD, el título se ve una sola vez: el <h1> queda para los lectores de
    // pantalla en escritorio (lo oculta el CSS con `data-title-in-hud`).
    expect(main.querySelector('[data-title-in-hud]')).not.toBeNull()
    expect(within(main).getByText('Aquí irá el archivo.')).toBeInTheDocument()
    expect(within(main).getByText(t('screen.underConstruction'))).toHaveAttribute('data-stamp', 'red')
    const back = within(main).getByRole('link', { name: t('screen.backToMenu') })
    expect(back).toHaveAttribute('href', '/')
    expect(back.querySelector('kbd')).toHaveTextContent(t('frame.keys.glyph.escape'))
    // La placa del HUD es la de la ruta.
    expect(screen.getByRole('banner').querySelector('[data-frame="title"]')).toHaveTextContent(
      t('pages.weeks.title'),
    )
    await act(async () => {})
  })

  it('la 404 «BONUS STAGE» pone su propia placa en el HUD y el pad decorativo de 4 × 4', async () => {
    renderAt('/legal/no-existe')
    const plate = screen.getByRole('banner').querySelector('[data-frame="title"]')
    expect(plate).toHaveTextContent(t('pages.notFound.plate'))
    expect(plate).not.toHaveTextContent(t('frame.plates.legalTitle'))
    const main = screen.getByRole('main')
    // El titular es el momento de juego, con «Te has perdido…» de subtítulo (§3.8.11).
    expect(
      within(main).getByRole('heading', { level: 1, name: t('pages.notFound.plate') }),
    ).toBeInTheDocument()
    expect(within(main).getByText(t('pages.notFound.subtitle'))).toBeInTheDocument()
    expect(main.querySelectorAll('figure kbd[data-key]')).toHaveLength(16)
    expect(main.querySelector('figure [aria-hidden="true"]')).not.toBeNull()
    // El pad es la pieza de la cuña, con «Volver al menú» debajo; el título va en la placa del HUD.
    expect(main.querySelector('[data-title-in-hud]')).not.toBeNull()
    expect(within(main).getByRole('link', { name: t('screen.backToMenu') })).toHaveAttribute('href', '/')
    await act(async () => {})
  })

  it('§3.8.11 / RD-VIS-02 e: el panel de la 404 cuenta cómo se toca el pad (chops arriba, batería debajo)', async () => {
    renderAt('/legal/no-existe')
    const main = screen.getByRole('main')
    const legend = within(main).getByRole('region', { name: t('pages.notFound.legendTitle') })
    const rows = within(legend).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent(
      `${t('pages.notFound.legend.chops.keysLabel')} ${t('pages.notFound.legend.chops.text')}`,
    )
    expect(rows[1]).toHaveTextContent(
      `${t('pages.notFound.legend.drums.keysLabel')} ${t('pages.notFound.legend.drums.text')}`,
    )
    // Las teclas se ven, pero se leen en palabras («Teclas del 1 al 4:»).
    expect(rows[0]!.querySelectorAll('[aria-hidden="true"] kbd[data-key="marked"]')).toHaveLength(4)
    await act(async () => {})
  })
})

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RootLayout } from '../../app/layout/RootLayout'
import { interiorScreen } from '../../app/layout/screen'
import { t } from '../../i18n'
import { HowItWorksPage } from './HowItWorksPage'

function renderPage() {
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          {
            path: 'como-funciona',
            handle: {
              screen: interiorScreen({ kicker: 'frame.plates.howItWorks', title: 'pages.howItWorks.title' }, [
                'choose',
                'enter',
                'back',
                'sound',
              ]),
            },
            element: <HowItWorksPage />,
          },
          { path: '*', element: <h1>Destino</h1> },
        ],
      },
    ],
    { initialEntries: ['/como-funciona'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

const moveList = () => screen.getByRole('menu', { name: t('frame.plates.howItWorks') })

describe('«Cómo se juega» como lista de movimientos (§3.8.14; 0.26, 0.28)', () => {
  it('RD-VIS-02 d: un menú de juego con los tres movimientos, «Bases» y «Volver al menú», una sola parada', async () => {
    renderPage()
    const items = within(moveList()).getAllByRole('menuitem')
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      '/',
      '/subir',
      '/jurado',
      '/legal/bases',
      '/',
    ])
    expect(items[0]).toHaveAccessibleName(t('howItWorks.moves.sample.title'))
    expect(items[2]).toHaveAccessibleDescription(new RegExp(t('howItWorks.moves.vote.keysLabel')))
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[0]])
    // Cursor de juego con la etiqueta 1P en cada opción.
    for (const item of items)
      expect(item.querySelector('[data-cursor-player="left"]')).toHaveTextContent('1P')
    await act(async () => {})
  })

  it('RD-MOT-05: ↑/↓ mueven el cursor en bucle; con el foco en ningún control, las flechas van a la lista', async () => {
    const user = userEvent.setup()
    renderPage()
    const items = within(moveList()).getAllByRole('menuitem')
    // El foco está en el <main> (destino de foco del marco): ↓ entra en la lista.
    screen.getByRole('main').focus()
    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(items[4]).toHaveFocus()
    expect(items[4]).toHaveAttribute('data-cursor-active', 'true')
  })

  it('B abre las bases de la competición desde cualquier sitio de la pantalla', async () => {
    const user = userEvent.setup()
    const router = renderPage()
    within(moveList()).getAllByRole('menuitem')[0]!.focus()
    await user.keyboard('b')
    expect(router.state.location.pathname).toBe('/legal/bases')
  })

  it('las cinco reglas de juego limpio, como filas con su índice', async () => {
    renderPage()
    const rules = screen.getByRole('region', { name: t('howItWorks.rulesTitle') })
    const rows = within(rules).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent(`01${t('howItWorks.rules.blind.title')}`)
    await act(async () => {})
  })
})

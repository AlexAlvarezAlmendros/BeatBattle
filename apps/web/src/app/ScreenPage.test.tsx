import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n'
import { LegalPage } from './LegalPage'
import { RootLayout } from './layout/RootLayout'
import { interiorScreen, simpleScreen } from './layout/screen'
import { NotFoundPage } from './NotFoundPage'
import { PlaceholderPage } from './PlaceholderPage'
import { ScreenPage } from './ScreenPage'

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
            // Los legales, en otra ruta que la de la 404 de abajo (`/legal/no-existe`).
            path: 'documentos/:doc',
            handle: {
              screen: simpleScreen({ kicker: 'frame.plates.legal', title: 'frame.plates.legalTitle' }, [
                'section',
                'back',
                'sound',
              ]),
            },
            element: <LegalPage />,
          },
          {
            // Una pantalla con formulario (la autenticación de la Fase 2): «Volver al menú» no es su
            // primer elemento de juego si no lo dice.
            path: 'formulario',
            handle: { screen: interiorScreen({ kicker: 'frame.plates.weeks', title: 'pages.weeks.title' }) },
            element: <ScreenPage title="Formulario" />,
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

  it('RD-VIS-02 e / §3.8.14: los legales llevan el sello en la columna de la pieza, las pestañas en rótulos cortos y el nombre completo como título del panel', async () => {
    renderAt('/documentos/bases')
    const main = screen.getByRole('main')
    const panel = main.querySelector('[data-screen-part="panel"]') as HTMLElement
    // El <h1> es el título del panel, con el nombre completo del documento.
    expect(within(panel).getByRole('heading', { level: 1 })).toHaveTextContent(t('legal.docs.bases'))
    // El sello «EN OBRAS», en la columna de la pieza (no en el panel).
    const piece = main.querySelector('[data-screen-part="piece"]') as HTMLElement
    expect(within(piece).getByText(t('screen.underConstruction'))).toHaveAttribute('data-stamp', 'red')
    // Las pestañas, en su zona de la plantilla: rótulos cortos con el nombre completo como nombre accesible.
    const nav = within(main).getByRole('navigation', { name: t('legal.navLabel') })
    expect(nav.closest('[data-screen-part="tabs"]')).not.toBeNull()
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(
      (['bases', 'terminos', 'privacidad', 'cookies'] as const).map((doc) => t(`legal.tabs.${doc}`)),
    )
    expect(links[0]).toHaveAccessibleName(t('legal.docs.bases'))
    expect(links[2]).toHaveAccessibleName(t('legal.docs.privacidad'))
    await act(async () => {})
  })

  it('RD-VIS-02 d / §3.8.14: el primer elemento de juego lleva el cursor sin robar el foco; ↓ e Intro van a él sin accionarlo', async () => {
    const user = userEvent.setup()
    const router = renderAt('/semanas')
    const main = screen.getByRole('main')
    const back = within(main).getByRole('link', { name: t('screen.backToMenu') })
    // «Volver al menú», la opción elegida de su grupo: el cursor se ve mientras el foco está fuera.
    expect(back).toHaveAttribute('data-cursor-active', 'true')
    expect(back.closest('[data-cursor-group]')).not.toBeNull()
    expect(back).not.toHaveFocus()
    main.focus()
    await user.keyboard('{ArrowDown}')
    expect(back).toHaveFocus()
    // Intro lo enfoca, no lo acciona (si lo accionara, al volver al <main> de la pantalla nueva otra
    // Intro, o la tecla mantenida, rebotaba entre pantallas).
    main.focus()
    await user.keyboard('{Enter}')
    expect(back).toHaveFocus()
    expect(router.state.location.pathname).toBe('/semanas')
  })

  it('RD-VIS-02 d / §3.8.14: «Volver al menú» solo es el primer elemento de juego si la pantalla lo dice (`backIsStart`)', async () => {
    const user = userEvent.setup()
    renderAt('/formulario')
    const main = screen.getByRole('main')
    const back = within(main).getByRole('link', { name: t('screen.backToMenu') })
    expect(back).not.toHaveAttribute('data-cursor-active')
    expect(back).not.toHaveAttribute('data-idle-start')
    main.focus()
    await user.keyboard('{ArrowDown}')
    expect(back).not.toHaveFocus()
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

  it('RD-VIS-02 e / §3.8.11: el orden de lectura y de foco de la 404 es titular, subtítulo, resumen, cómo se tocará, pad con su nota y «Volver al menú» (v0.6.7, P2)', async () => {
    renderAt('/legal/no-existe')
    const main = screen.getByRole('main')
    const heading = within(main).getByRole('heading', { level: 1 })
    const subtitle = within(main).getByText(t('pages.notFound.subtitle'))
    const summary = within(main).getByText(t('pages.notFound.summary'))
    const pad = main.querySelector('figure')!
    const caption = within(pad).getByText(t('pages.notFound.pad'))
    const back = within(main).getByRole('link', { name: t('screen.backToMenu') })
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const legend = within(main).getByRole('region', { name: t('pages.notFound.legendTitle') })
    // Lo que se lee y el orden del foco (el del DOM): la nota del pad («El beat pad de 4 × 4 llega
    // pronto.») va antes de la salida, no después. En móvil, el panel, el botón y el pad se colocan con
    // CSS (el botón, al pie del panel o, en el móvil bajo, tras el resumen), sin cambiar este orden.
    expect(follows(heading, subtitle)).toBe(true)
    expect(follows(subtitle, summary)).toBe(true)
    expect(follows(summary, legend)).toBe(true)
    expect(follows(legend, pad)).toBe(true)
    expect(follows(caption, back)).toBe(true)
    expect(main.querySelector('[data-panel-first]')).not.toBeNull()
    await act(async () => {})
  })

  it('§3.8.11 / RD-VIS-02 e: el panel de la 404 cuenta lo que traerá el pad (chops arriba, batería debajo, metrónomo y grabación)', async () => {
    renderAt('/legal/no-existe')
    const main = screen.getByRole('main')
    const legend = within(main).getByRole('region', { name: t('pages.notFound.legendTitle') })
    const rows = within(legend).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent(
      `${t('pages.notFound.legend.chops.keysLabel')} ${t('pages.notFound.legend.chops.text')}`,
    )
    expect(rows[1]).toHaveTextContent(
      `${t('pages.notFound.legend.drums.keysLabel')} ${t('pages.notFound.legend.drums.text')}`,
    )
    // El metrónomo opcional y la grabación de 4 compases (§3.8.11), sin tecla propia.
    expect(rows[2]).toHaveTextContent(t('pages.notFound.legend.extras.text'))
    expect(rows[2]!.querySelector('kbd')).toBeNull()
    // Las teclas se ven, pero se leen en palabras («Teclas del 1 al 4:»).
    expect(rows[0]!.querySelectorAll('[aria-hidden="true"] kbd[data-key="marked"]')).toHaveLength(4)
    await act(async () => {})
  })

  it('RD-VIS-02 e / §3.8.11: la leyenda de la 404 da la batería por filas del pad, no como un intervalo, y en futuro (L-404)', async () => {
    renderAt('/legal/no-existe')
    const main = screen.getByRole('main')
    // El pad aún no suena (Fase 8): la leyenda cuenta cómo será, no cómo se toca ya.
    const legend = within(main).getByRole('region', { name: 'Cuando llegue el pad' })
    const drums = within(legend).getAllByRole('listitem')[1]!
    // Las teclas, en las filas del pad (Q W E R / A S D F / Z X C V), sin guion de intervalo: «[Q]–[V]»
    // se leía como Q, R, S, T, U, V.
    const keyRows = [...drums.querySelectorAll('[aria-hidden="true"] [data-pad-row]')].map((row) =>
      [...row.querySelectorAll('kbd')].map((key) => key.textContent).join(''),
    )
    expect(keyRows).toEqual(['QWER', 'ASDF', 'ZXCV'])
    expect(drums).not.toHaveTextContent(t('howItWorks.keys.dash'))
    // En palabras, por filas también.
    expect(drums).toHaveTextContent('Q W E R, A S D F y Z X C V')
    expect(legend).not.toHaveTextContent(/de la Q a la V/i)
    await act(async () => {})
  })
})

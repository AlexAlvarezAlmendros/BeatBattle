import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { useShortcuts } from '../../ui/shortcuts'
import { toast, useToasts } from '../../ui/Toast/useToasts'
import { OTHER_PEOPLE_URL } from '../paths'
import { RootLayout } from './RootLayout'
import { interiorScreen, MENU_SCREEN } from './screen'
import { FrameSlot } from './slots'
import { useSound } from './soundStore'

/** Marco con dos pantallas: el menú (`/`) y una interior con su placa (`/como-funciona`). */
function renderFrame(path = '/', home = <h1>Menú</h1>) {
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          { index: true, handle: { screen: MENU_SCREEN }, element: home },
          {
            path: 'como-funciona',
            handle: {
              screen: interiorScreen({ kicker: 'frame.plates.howItWorks', title: 'pages.howItWorks.title' }),
            },
            element: <h1>Cómo funciona</h1>,
          },
          { path: '*', element: <h1>Página</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const regions = () => screen.getAllByRole('region', { name: t('ui.toast.region') })

beforeEach(() => {
  // jsdom no implementa el scroll que hace `ScrollRestoration`.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useSound.getState().set(true)
  useShortcuts.getState().set(true)
})

afterEach(() => {
  act(() => useToasts.getState().clear())
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('RootLayout: marco de juego (0.23, §3.4.1)', () => {
  it('pinta el HUD, el contenido y la barra de controles con la firma del sello (RF-OTP-01)', () => {
    renderFrame()
    const hud = screen.getByRole('banner')
    expect(within(hud).getByRole('link', { name: t('frame.hud.joinLabel') })).toHaveAttribute(
      'href',
      '/entrar',
    )
    expect(within(hud).getByRole('button', { name: t('frame.hud.sound') })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido')

    const bar = screen.getByRole('contentinfo')
    const signature = within(bar).getByRole('link', { name: t('frame.controls.signatureLabel') })
    expect(signature).toHaveAttribute('href', `${OTHER_PEOPLE_URL}/`)
    expect(signature).toHaveAttribute('target', '_blank')
    expect(signature).toHaveAttribute('data-otp-signature')
  })

  it('la barra enseña las teclas de la pantalla: las del menú y las de una interior', async () => {
    const router = renderFrame()
    const keys = () =>
      within(screen.getByRole('list', { name: t('frame.keys.label') }))
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('data-control'))
    expect(keys()).toEqual(['choose', 'enter', 'back', 'sound'])
    // Las flechas se leen con su nombre, no con el dibujo.
    expect(screen.getByText(t('frame.keys.glyph.upLabel'))).toHaveClass('sr-only')

    await act(() => router.navigate('/como-funciona'))
    expect(keys()).toEqual(['back', 'sound'])
  })

  it('la placa de título del HUD sale de la ruta (interiores) y repite el <h1> solo para la vista', async () => {
    const router = renderFrame()
    expect(screen.getByRole('banner').querySelector('[data-frame="title"]')).toBeNull()
    await act(() => router.navigate('/como-funciona'))
    const plate = screen.getByRole('banner').querySelector('[data-frame="title"]')
    expect(plate).toHaveTextContent(t('frame.plates.howItWorks'))
    expect(plate).toHaveTextContent(t('pages.howItWorks.title'))
    expect(plate).toHaveAttribute('aria-hidden', 'true')
  })

  it('la arena lleva la cuña de la pantalla: a la derecha en el menú y a la izquierda en una interior', async () => {
    const router = renderFrame()
    const arena = () => document.querySelector('[data-wedge]:not(.game-frame)')
    expect(arena()).toHaveAttribute('data-wedge', 'right')
    expect(arena()).toHaveAttribute('aria-hidden', 'true')
    await act(() => router.navigate('/como-funciona'))
    expect(arena()).toHaveAttribute('data-wedge', 'left')
  })

  it('RD-SND-06: el botón de sonido y la tecla M encienden y apagan los efectos', async () => {
    const user = userEvent.setup()
    renderFrame()
    const sound = screen.getByRole('button', { name: t('frame.hud.sound') })
    await user.click(sound)
    expect(sound).toHaveAttribute('aria-pressed', 'false')
    expect(useSound.getState().enabled).toBe(false)
    await user.keyboard('m')
    expect(sound).toHaveAttribute('aria-pressed', 'true')
    // Dentro de un campo de texto, la M se escribe: no apaga el sonido.
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    await user.keyboard('m')
    expect(sound).toHaveAttribute('aria-pressed', 'true')
    input.remove()
  })

  it('RNF-A11Y-08 / WCAG 2.1.4: con los atajos de una tecla apagados, M no toca el sonido (queda el botón) ni se enseña en la barra', async () => {
    const user = userEvent.setup()
    useShortcuts.getState().set(false)
    renderFrame()
    const sound = screen.getByRole('button', { name: t('frame.hud.soundNoKey') })
    await user.keyboard('m')
    expect(sound).toHaveAttribute('aria-pressed', 'true')
    expect(useSound.getState().enabled).toBe(true)
    const keys = within(screen.getByRole('contentinfo')).getByRole('list', { name: t('frame.keys.label') })
    expect(within(keys).queryByText(t('frame.keys.sound'))).not.toBeInTheDocument()
    await user.click(sound)
    expect(useSound.getState().enabled).toBe(false)
  })

  it('Esc vuelve al menú desde una pantalla interior; en el menú no hace nada', async () => {
    const router = renderFrame('/como-funciona')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(router.state.location.pathname).toBe('/')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(router.state.location.pathname).toBe('/')
  })

  it('Esc no sale de la pantalla si una pieza ya lo ha usado o hay un diálogo abierto', () => {
    const router = renderFrame('/como-funciona')
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(router.state.location.pathname).toBe('/como-funciona')
    dialog.remove()
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    event.preventDefault()
    document.body.dispatchEvent(event)
    expect(router.state.location.pathname).toBe('/como-funciona')
  })

  it('§3.6: la primera carga no se anima; al cambiar de pantalla entra con su transición y el foco va al <main>', async () => {
    const router = renderFrame()
    expect(document.querySelector('.game-screen')).not.toHaveAttribute('data-entering')
    expect(document.querySelector('.screen-sweep')).toBeNull()
    await act(() => router.navigate('/como-funciona'))
    expect(document.querySelector('.game-screen')).toHaveAttribute('data-entering')
    expect(document.querySelector('.screen-sweep')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('una pantalla rellena los huecos del marco y quita lo de por defecto', () => {
    renderFrame(
      '/',
      <>
        <h1>Menú</h1>
        <FrameSlot name="hudPlayer">
          <span>LilBru</span>
        </FrameSlot>
        <FrameSlot name="controlsRight">
          <span>Crédito 01</span>
        </FrameSlot>
      </>,
    )
    const hud = screen.getByRole('banner')
    expect(within(hud).getByText('LilBru')).toBeInTheDocument()
    expect(within(hud).queryByRole('link', { name: t('frame.hud.joinLabel') })).toBeNull()
    const bar = screen.getByRole('contentinfo')
    expect(within(bar).getByText('Crédito 01')).toBeInTheDocument()
    expect(within(bar).queryByRole('link', { name: t('frame.controls.legal') })).toBeNull()
    expect(bar.querySelector('[data-controls-rule]')).toBeNull()
  })

  it('RD-VIS-02 e: «Legal» lleva delante el filete que lo separa de la firma, decorativo', () => {
    renderFrame('/como-funciona')
    const bar = screen.getByRole('contentinfo')
    const legal = within(bar).getByRole('link', { name: t('frame.controls.legal') })
    const rule = bar.querySelector('[data-controls-rule]')
    expect(rule).toHaveAttribute('aria-hidden', 'true')
    expect(rule).toBeEmptyDOMElement()
    // Entre la firma y «Legal», en el orden de la barra.
    expect(rule?.nextElementSibling).toBe(legal)
    const signature = within(bar).getByRole('link', { name: t('frame.controls.signatureLabel') })
    expect(signature.compareDocumentPosition(rule!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
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

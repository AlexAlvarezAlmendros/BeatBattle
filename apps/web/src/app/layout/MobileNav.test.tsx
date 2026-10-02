import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { OTHER_PEOPLE_SOCIAL } from './navigation'
import { SiteHeader } from './SiteHeader'
import { renderInRouter } from './testing'

const toggle = () => screen.getByRole('button', { name: t('layout.mobileNav.toggle') })
const dialog = () => screen.getByRole('dialog', { name: t('layout.mobileNav.title') })
const waitClosed = () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

describe('MobileNav: menú móvil del sello (0.7, guía §2.17)', () => {
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('RNF-A11Y-01: el botón dice si está abierto (aria-expanded) y qué controla (aria-controls)', async () => {
    const user = userEvent.setup()
    renderInRouter(<SiteHeader />)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle()).toHaveAttribute('aria-controls', dialog().id)
    expect(dialog()).toHaveAttribute('aria-modal', 'true')
  })

  it('RNF-A11Y-01: al abrir, el foco entra en el panel y la página no se desplaza por debajo', async () => {
    const user = userEvent.setup()
    renderInRouter(<SiteHeader />)
    await user.click(toggle())
    expect(dialog()).toContainElement(document.activeElement as HTMLElement)
    expect(screen.getByRole('button', { name: t('layout.mobileNav.close') })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('RNF-A11Y-01: Esc cierra el panel y devuelve el foco al botón', async () => {
    const user = userEvent.setup()
    renderInRouter(<SiteHeader />)
    await user.click(toggle())
    await user.keyboard('{Escape}')
    await waitClosed()
    expect(toggle()).toHaveFocus()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(document.body.style.overflow).toBe('')
  })

  it('RNF-A11Y-01: el botón de cerrar también devuelve el foco', async () => {
    const user = userEvent.setup()
    renderInRouter(<SiteHeader />)
    await user.click(toggle())
    await user.click(screen.getByRole('button', { name: t('layout.mobileNav.close') }))
    await waitClosed()
    expect(toggle()).toHaveFocus()
  })

  it('RNF-A11Y-01: Tab no sale del panel (trampa de foco en los dos sentidos)', async () => {
    const user = userEvent.setup()
    renderInRouter(<SiteHeader />)
    await user.click(toggle())
    const panel = dialog()
    const focusables = panel.querySelectorAll<HTMLElement>('a[href], button')
    const last = focusables[focusables.length - 1]!
    last.focus()
    await user.tab()
    expect(focusables[0]).toHaveFocus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('el panel lleva los enlaces de la isla, «Entrar» y las redes del sello', async () => {
    const user = userEvent.setup()
    renderInRouter(<SiteHeader />, '/semanas')
    await user.click(toggle())
    const nav = within(dialog()).getByRole('navigation', { name: t('layout.nav.label') })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/', '/jurado', '/semanas', '/salon-de-la-fama', '/como-funciona'])
    expect(within(nav).getByRole('link', { name: t('layout.nav.results') })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(dialog()).getByRole('link', { name: t('layout.nav.signIn') })).toHaveAttribute(
      'href',
      '/entrar',
    )
    for (const { href } of OTHER_PEOPLE_SOCIAL) {
      const link = within(dialog())
        .getAllByRole('link')
        .find((a) => a.getAttribute('href') === href)
      expect(link, href).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveAttribute('target', '_blank')
    }
  })

  it('al pulsar un enlace del panel se navega y el panel se cierra', async () => {
    const user = userEvent.setup()
    const { router } = renderInRouter(<SiteHeader />)
    await user.click(toggle())
    await user.click(within(dialog()).getByRole('link', { name: t('layout.nav.jury') }))
    expect(router.state.location.pathname).toBe('/jurado')
    await waitClosed()
  })

  it('pulsar el enlace de la página actual cierra y devuelve el foco al botón (no hay navegación que lo mueva)', async () => {
    const user = userEvent.setup()
    renderInRouter(<SiteHeader />, '/jurado')
    await user.click(toggle())
    await user.click(within(dialog()).getByRole('link', { name: t('layout.nav.jury') }))
    await waitClosed()
    expect(toggle()).toHaveFocus()
  })

  it('RNF-A11Y-01: con el panel abierto, lo de detrás (la isla) queda inert; al cerrar, vuelve', async () => {
    const user = userEvent.setup()
    renderInRouter(<SiteHeader />)
    const header = screen.getByRole('banner')
    await user.click(toggle())
    expect(header).toHaveAttribute('inert')
    expect(dialog()).not.toHaveAttribute('inert')
    expect(document.querySelector('.mobile-nav__overlay')).not.toHaveAttribute('inert')

    await user.keyboard('{Escape}')
    await waitClosed()
    expect(header).not.toHaveAttribute('inert')
    // El foco vuelve al botón después de quitar `inert` (un elemento inert no lo acepta).
    expect(toggle()).toHaveFocus()
  })

  it('RNF-A11Y-01: Atrás del navegador (cambio de ruta sin pulsar el panel) lo cierra y libera la página', async () => {
    const user = userEvent.setup()
    const { router } = renderInRouter(<SiteHeader />)
    await act(() => router.navigate('/jurado'))
    await user.click(toggle())
    expect(dialog()).toBeInTheDocument()

    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/')
    await waitClosed()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(document.body.style.overflow).toBe('')
    expect(screen.getByRole('banner')).not.toHaveAttribute('inert')
    // Sin devolver el foco al botón: RootLayout lo lleva al <main> de la página nueva.
    expect(toggle()).not.toHaveFocus()
  })

  it('RNF-A11Y-01: también se cierra si la ruta cambia por código (p. ej. una redirección)', async () => {
    const user = userEvent.setup()
    const { router } = renderInRouter(<SiteHeader />)
    await user.click(toggle())
    await act(() => router.navigate('/semanas'))
    await waitClosed()
    expect(document.body.style.overflow).toBe('')
  })
})

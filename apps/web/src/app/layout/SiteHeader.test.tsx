import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { NAV_ITEMS, OTHER_PEOPLE_HOME } from './navigation'
import { OTP_LOGO_SRC } from './OtpLogo'
import { SiteHeader } from './SiteHeader'
import { renderInRouter } from './testing'

const mainNav = () => screen.getByRole('navigation', { name: t('layout.nav.label') })

describe('SiteHeader: isla de navegación del sello (0.7, guía §3.1)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.motion
  })

  it('es la cabecera (banner) con los enlaces de la guía, en orden y por i18n', () => {
    renderInRouter(<SiteHeader />)
    expect(screen.getByRole('banner')).toHaveClass('site-header')
    const links = within(mainNav()).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      [t('layout.nav.week'), '/'],
      [t('layout.nav.jury'), '/jurado'],
      [t('layout.nav.results'), '/semanas'],
      [t('layout.nav.hallOfFame'), '/salon-de-la-fama'],
      [t('layout.nav.howItWorks'), '/como-funciona'],
    ])
    expect(NAV_ITEMS).toHaveLength(5)
  })

  it.each([
    ['/', 'layout.nav.week'],
    ['/jurado', 'layout.nav.jury'],
    ['/semanas', 'layout.nav.results'],
    ['/salon-de-la-fama', 'layout.nav.hallOfFame'],
    ['/como-funciona', 'layout.nav.howItWorks'],
  ] as const)('en %s solo el enlace de su sección lleva aria-current="page"', (path, key) => {
    renderInRouter(<SiteHeader />, path)
    const current = within(mainNav())
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current.map((link) => link.textContent)).toEqual([t(key)])
  })

  it('«Semana» no queda activa en otras rutas (enlace exacto a /)', () => {
    renderInRouter(<SiteHeader />, '/semana/2026-41')
    expect(within(mainNav()).getByRole('link', { name: t('layout.nav.week') })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('a la derecha, el hueco del HUD (data-slot="hud") y «Entrar» a /entrar', () => {
    const { container } = renderInRouter(<SiteHeader />)
    const hud = container.querySelector('[data-slot="hud"]')
    expect(hud).toBeInTheDocument()
    expect(hud).toBeEmptyDOMElement()
    const signIn = within(screen.getByRole('banner')).getByRole('link', { name: t('layout.nav.signIn') })
    expect(signIn).toHaveAttribute('href', '/entrar')
  })

  it('RF-OTP-01: el logo OTP. enlaza a otherpeople.es en otra pestaña, con rel seguro y alt por i18n', () => {
    renderInRouter(<SiteHeader />)
    const logo = within(screen.getByRole('banner')).getByRole('img', { name: t('layout.logo.alt') })
    expect(logo).toHaveAttribute('src', OTP_LOGO_SRC)
    const link = logo.closest('a')
    expect(link).toHaveAttribute('href', 'https://www.otherpeople.es/')
    expect(OTHER_PEOPLE_HOME).toBe('https://www.otherpeople.es/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link?.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(link).toHaveAccessibleName(`${t('layout.logo.alt')} ${t('layout.newTab')}`)
    expect(link).toHaveClass('site-header__logo')
  })

  it('el logo es lo primero de la isla al tabular (antes de los enlaces)', () => {
    renderInRouter(<SiteHeader />)
    const focusables = screen.getByRole('banner').querySelectorAll('a[href], button')
    expect(focusables[0]).toHaveAttribute('href', OTHER_PEOPLE_HOME)
  })

  it('sin capacidad de cristal (jsdom, o «reducir movimiento») la isla no lleva data-glass ni filtro SVG', () => {
    document.documentElement.dataset.motion = 'reduced'
    renderInRouter(<SiteHeader />)
    const island = screen.getByRole('banner')
    expect(island).not.toHaveAttribute('data-glass')
    expect(island.querySelector('filter')).toBeNull()
  })
})

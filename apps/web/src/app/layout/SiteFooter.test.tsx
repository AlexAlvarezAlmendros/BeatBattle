import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { LEGAL_DOCS } from '../paths'
import { SiteFooter } from './SiteFooter'
import footerCss from './SiteFooter.css?raw'
import { renderInRouter } from './testing'

const footer = () => screen.getByRole('contentinfo')

describe('SiteFooter: pie del sello (0.7, guía §2.16)', () => {
  it('RF-OTP-01: enlaza las secciones del sello en otherpeople.es', () => {
    renderInRouter(<SiteFooter />)
    const nav = within(footer()).getByRole('navigation', { name: t('layout.footer.labelNav') })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      'https://www.otherpeople.es/artistas',
      'https://www.otherpeople.es/beats',
      'https://www.otherpeople.es/eventos',
      'https://www.otherpeople.es/contacto',
    ])
    for (const key of [
      'layout.footer.artists',
      'layout.footer.beats',
      'layout.footer.events',
      'layout.footer.contact',
    ] as const) {
      expect(within(nav).getByRole('link', { name: new RegExp(`^${t(key)}`) })).toBeInTheDocument()
    }
  })

  it('RF-OTP-01: las redes del sello son las de su JSON-LD (Instagram, YouTube, Threads), con nombre accesible', () => {
    renderInRouter(<SiteFooter />)
    const list = within(footer()).getByRole('list', { name: t('layout.footer.socialNav') })
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://www.instagram.com/otherpeople.records/',
      'https://www.youtube.com/@otherpeoplerecords',
      'https://www.threads.com/@otherpeople.records',
    ])
    expect(links[0]).toHaveAccessibleName(`${t('layout.footer.instagram')} ${t('layout.newTab')}`)
    expect(links[1]).toHaveAccessibleName(`${t('layout.footer.youtube')} ${t('layout.newTab')}`)
    expect(links[2]).toHaveAccessibleName(`${t('layout.footer.threads')} ${t('layout.newTab')}`)
  })

  it('RF-OTP-01: todo enlace externo se abre en otra pestaña con rel="noopener noreferrer"', () => {
    renderInRouter(<SiteFooter />)
    const external = within(footer())
      .getAllByRole('link')
      .filter((link) => /^https?:/.test(link.getAttribute('href') ?? ''))
    expect(external.length).toBeGreaterThanOrEqual(8)
    for (const link of external) {
      expect(link, link.getAttribute('href') ?? '').toHaveAttribute('target', '_blank')
      expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    }
  })

  it('enlaza los cuatro documentos legales de /legal/*', () => {
    renderInRouter(<SiteFooter />)
    const nav = within(footer()).getByRole('navigation', { name: t('footer.legalLabel') })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual(LEGAL_DOCS.map((doc) => [t(`legal.docs.${doc}`), `/legal/${doc}`]))
  })

  it('RF-OTP-01: lleva el crédito «Beat Battle by Other People» y el © de Other People Records', () => {
    renderInRouter(<SiteFooter />)
    expect(within(footer()).getByText(new RegExp(t('app.brand')))).toBeInTheDocument()
    expect(t('app.brand')).toBe('Beat Battle by Other People')
    const year = new Date().getFullYear()
    expect(within(footer()).getByText(`© ${year} Other People Records`)).toBeInTheDocument()
    const label = within(footer()).getByRole('link', { name: new RegExp(`^${t('footer.otherPeople')}`) })
    expect(label).toHaveAttribute('href', 'https://www.otherpeople.es')
  })

  it('el bloque de marca lleva el logo del sello con alt y el nombre de la batalla', () => {
    renderInRouter(<SiteFooter />)
    expect(within(footer()).getByRole('img', { name: t('layout.logo.alt') })).toBeInTheDocument()
    expect(within(footer()).getByRole('heading', { level: 2, name: t('app.name') })).toBeInTheDocument()
    expect(within(footer()).getByText(t('footer.tagline'))).toBeInTheDocument()
  })
})

describe('SiteFooter.css: maqueta del pie del sello (RD-VIS-02)', () => {
  /** Declaraciones de la primera regla con ese selector exacto (fuera de las media queries). */
  const rule = (selector: string) =>
    new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(footerCss)?.[1] ?? ''

  it('RD-VIS-02: títulos de tarjeta y entradilla centrados (heredan el `.container` del sello)', () => {
    expect(rule('.site-footer__card-title')).toMatch(/text-align: center;/)
    expect(rule('.site-footer__tagline')).toMatch(/text-align: center;/)
  })

  it('RD-VIS-02: las tarjetas de una fila se estiran a la misma altura; la marca no', () => {
    expect(rule('.site-footer__content')).toMatch(/align-items: normal;/)
    expect(rule('.site-footer__brand')).toMatch(/align-self: start;/)
  })

  it('RD-VIS-02: borde de tarjeta al 8 % (el `.glass` del pie) y enlaces con interlineado de etiqueta', () => {
    expect(rule('.site-footer__card')).toMatch(/border: 1px solid var\(--bb-line\);/)
    expect(rule('.site-footer__link')).toMatch(/line-height: var\(--bb-leading-label\);/)
  })

  it('RNF-A11Y-09: en táctil los enlaces del pie siguen midiendo 44 px', () => {
    const tablet = /@media \(max-width: 992px\) \{([\s\S]*?)\n\}/.exec(footerCss)?.[1] ?? ''
    expect(tablet).toMatch(
      /\.site-footer__link,\s*\.site-footer__legal-link \{[^}]*min-height: var\(--bb-space-11\);/,
    )
  })
})

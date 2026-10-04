import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { DROP_ALERT_ID } from '../../app/paths'
import { t } from '../../i18n'
import buttonStyles from '../../ui/Button/Button.module.css'
import { HomePage, IDLE_TICKER } from './HomePage'

const hero = () => screen.getByRole('region', { name: t('pages.home.title') })

describe('HomePage: hero en «calendario vacío» (0.7, guía §3.8.3 y §2.19)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.motion
  })

  it('el titular «BEAT / BATTLE» es el <h1> de la página y da nombre al hero', () => {
    renderInRouter(<HomePage />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveAccessibleName(t('pages.home.title'))
    expect(heading).toHaveTextContent(`${t('home.hero.titleSolid')} ${t('home.hero.titleOutline')}`)
    expect(hero()).toContainElement(heading)
  })

  it('pinta los textos del hero por i18n: rótulos, subtítulo y estado del calendario vacío', () => {
    renderInRouter(<HomePage />)
    for (const key of [
      'home.hero.sideWeek',
      'home.hero.sideSeason',
      'home.hero.subtitle',
      'home.hero.emptyCalendar',
    ] as const) {
      expect(within(hero()).getByText(t(key))).toBeInTheDocument()
    }
    expect(t('home.hero.emptyCalendar')).toBe('El próximo drop está en el horno.')
    expect(t('home.hero.subtitle')).toBe('Sample · Flip · Vota · Repite')
  })

  it('botones: «Avísame del próximo drop» (CTA rojo, a la sección de la alerta) y «Cómo funciona» (contorno)', () => {
    renderInRouter(<HomePage />)
    // El `Button` base en su tamaño `hero`; el contorno, sobre cristal (`glass`).
    const notify = within(hero()).getByRole('link', { name: t('home.hero.notify') })
    expect(notify).toHaveAttribute('href', `/#${DROP_ALERT_ID}`)
    expect(notify).toHaveAttribute('data-variant', 'cta')
    expect(notify).toHaveClass(buttonStyles.hero!)
    const howItWorks = within(hero()).getByRole('link', { name: t('home.hero.howItWorks') })
    expect(howItWorks).toHaveAttribute('href', '/como-funciona')
    expect(howItWorks).toHaveAttribute('data-variant', 'outline')
    expect(howItWorks).toHaveClass(buttonStyles.hero!, buttonStyles.glass!)
  })

  it('§2.12.3: el destino del CTA existe en la home, la sección «Avísame del próximo drop» con su título', () => {
    renderInRouter(<HomePage />)
    const section = screen.getByRole('region', { name: t('home.dropAlert.title') })
    expect(section).toHaveAttribute('id', DROP_ALERT_ID)
    expect(document.getElementById(DROP_ALERT_ID)).toBe(section)
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(t('home.dropAlert.title'))
    expect(within(section).getByText(t('home.dropAlert.summary'))).toBeInTheDocument()
    // Fuera del hero: es una sección de la home, debajo (§3.8.3).
    expect(hero()).not.toContainElement(section)
  })

  it('no hay cuenta atrás con el calendario vacío (§2.19)', () => {
    renderInRouter(<HomePage />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('debajo, la banda de marquee con las palabras del teletipo en reposo', () => {
    renderInRouter(<HomePage />)
    const band = within(hero()).getByRole('marquee', { name: t('home.ticker.label') })
    const words = within(band)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(words).toEqual(IDLE_TICKER.map((key) => t(key)))
  })

  it('RNF-A11Y-01 (WCAG 2.2.2): la banda lleva su botón de pausa, con nombre por i18n', () => {
    renderInRouter(<HomePage />)
    const band = within(hero()).getByRole('marquee', { name: t('home.ticker.label') })
    expect(within(band).getByRole('button', { name: t('home.ticker.pause') })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('RNF-A11Y-03: con «reducir movimiento», el teletipo es la lista estática', () => {
    document.documentElement.dataset.motion = 'reduced'
    renderInRouter(<HomePage />)
    expect(within(hero()).getByRole('marquee')).toHaveAttribute('data-static', 'true')
  })
})

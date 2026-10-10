import type { QueryClient } from '@tanstack/react-query'
import { getDefaultNormalizer, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { DROP_ALERT_ID, OTHER_PEOPLE_URL } from '../../app/paths'
import { t } from '../../i18n'
import { queryKeys } from '../../net/queryKeys'
import { HomePage } from './HomePage'

/** El calendario vacío, ya cargado (`GET /api/weeks/current` sin semana ni próxima). */
const emptyCalendar = (client: QueryClient) =>
  client.setQueryData(queryKeys.weeks.current(), { week: null, next: null })

describe('HomePage: menú principal en «calendario vacío» y visitante (0.24, §3.8.3, §2.19)', () => {
  it('el <h1> es el nombre del juego (el logo es decorativo) y el título lleva la firma del sello', () => {
    renderInRouter(<HomePage />)
    expect(screen.getByRole('heading', { level: 1, name: t('pages.home.title') })).toBeInTheDocument()
    const logos = document.querySelectorAll('[data-game-logo]')
    expect(logos).toHaveLength(2)
    for (const logo of logos) expect(logo).toHaveAttribute('aria-hidden', 'true')
    const signature = screen.getByRole('link', { name: t('ui.otpSlap.label') })
    expect(signature).toHaveAttribute('href', `${OTHER_PEOPLE_URL}/`)
    expect(signature).toHaveAttribute('data-otp-signature')
  })

  it('§2.19: sin semana, «El próximo drop está en el horno» y el hueco de «Avísame del próximo drop»', () => {
    renderInRouter(<HomePage />, '/', emptyCalendar)
    const stage = screen.getByRole('article', { name: t('home.empty.title') })
    const alert = within(stage).getByRole('region', { name: new RegExp(t('home.dropAlert.title')) })
    expect(alert).toHaveAttribute('id', DROP_ALERT_ID)
    expect(alert).toHaveTextContent(t('home.dropAlert.summary'))
    // Reloj oculto: sin semana no hay temporizador.
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('RD-MOT-05: «ELIGE MODO» con seis placas; Jugar y Resultados deshabilitados con su motivo y el cursor en Jurado', () => {
    renderInRouter(<HomePage />, '/', emptyCalendar)
    const menu = screen.getByRole('menu', { name: t('home.menu.title') })
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.querySelector('[class*="label"]')?.textContent)).toEqual(
      ['play', 'jury', 'results', 'hallOfFame', 'howItWorks', 'settings'].map((mode) =>
        t(`home.modes.${mode as 'play'}.label`),
      ),
    )
    expect(items[0]).toHaveAttribute('aria-disabled', 'true')
    expect(items[0]).toHaveTextContent(t('home.modes.play.empty'))
    expect(items[2]).toHaveAttribute('aria-disabled', 'true')
    expect(items[2]).toHaveTextContent(t('home.modes.results.none'))
    // Visitante: Jurado lleva a entrar (§3.8.3) y es la primera opción disponible.
    expect(items[1]).toHaveAttribute('href', '/entrar')
    expect(items[1]).toHaveAttribute('data-cursor-active', 'true')
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[1]])
    // El panel de ayuda describe el modo elegido (región viva educada). Se compara sin convertir los
    // espacios de no separación en normales.
    expect(
      screen.getByText(t('home.modes.jury.helpVisitor'), {
        normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
      }),
    ).toHaveAttribute('aria-live', 'polite')
  })

  it('§3.3: mientras llega la semana, la tarjeta en esqueleto y Jugar «Cargando…», no el calendario vacío', () => {
    renderInRouter(<HomePage />)
    expect(screen.queryByRole('article', { name: t('home.empty.title') })).toBeNull()
    expect(screen.queryByRole('region', { name: new RegExp(t('home.dropAlert.title')) })).toBeNull()
    expect(screen.getByRole('article', { name: t('home.loading.help') })).toHaveAttribute('aria-busy', 'true')
    const items = within(screen.getByRole('menu', { name: t('home.menu.title') })).getAllByRole('menuitem')
    expect(items[0]).toHaveAttribute('aria-disabled', 'true')
    expect(items[0]).toHaveTextContent(t('home.loading.detail'))
    expect(items[0]).not.toHaveTextContent(t('home.modes.play.empty'))
  })
})

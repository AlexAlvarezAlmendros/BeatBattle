import type { SeasonStandings } from '@beatbattle/shared'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { SeasonPage, seasonLoader } from './SeasonPage'
import { currentSeason, parseSeason, seasonLabel, shiftSeason } from './season'

/** Testing Library compara el texto con los espacios ya normalizados (el de no separación, también). */
const nbsp = (text: string) => text.replace(/\u00a0/g, ' ')

const KAIRO = { username: 'kairo.wav', displayName: 'Kairo.wav', avatarUrl: null }
const AINA = { username: 'aina', displayName: 'aina', avatarUrl: null }

const row = (position: number, producer: typeof KAIRO | null, points: number) => ({
  position,
  producer,
  points,
  wins: position === 1 ? 2 : 0,
  podiums: position <= 3 ? 3 : 0,
  weeks: 5,
  meanScoreMilli: 4100 - position * 100,
})

const CLOSED: SeasonStandings = {
  season: { id: '2026-T3', sealedWeeks: 13, closed: true },
  rows: [row(1, AINA, 222), row(2, KAIRO, 208), row(3, null, 164), row(4, KAIRO, 90)],
}

function renderSeason(path: string, reply: { status?: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(reply.body), {
          status: reply.status ?? 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  )
  const router = createMemoryRouter(
    [
      {
        path: '/temporada/:id',
        loader: seasonLoader,
        element: <SeasonPage />,
        errorElement: <h1>404</h1>,
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('temporada (§2.9, §3.8.14)', () => {
  it('RF-ARC-03: la clasificación con puntos, victorias, podios, semanas y media; cerrada, campeón en el podio', async () => {
    renderSeason('/temporada/2026-T3', { body: { data: CLOSED } })
    expect(
      await screen.findByRole('heading', { level: 1, name: `Temporada ${seasonLabel('2026-T3')}` }),
    ).toBeInTheDocument()
    expect(screen.getByText(nbsp(t('pages.season.closed', { count: 13 })))).toBeInTheDocument()
    const table = screen.getByRole('table', { name: t('pages.season.caption', { season: 'T3 de 2026' }) })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['1.º', '222', '2', '3', '5', '4,00'])
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'aina' })).toHaveAttribute(
      'href',
      '/p/aina',
    )
    expect(rows[2]).toHaveTextContent(t('results.deletedProducer'))
    // El top 3 en peanas, con «Campeón» en la del 1.º.
    const podium = screen.getByRole('region', { name: t('pages.season.podium', { season: 'T3 de 2026' }) })
    const steps = within(podium).getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-place'))).toEqual(['2', '1', '3'])
    expect(steps[1]).toHaveTextContent(t('pages.season.champion'))
    expect(steps[0]).not.toHaveTextContent(t('pages.season.champion'))
  })

  it('RF-ARC-03: la temporada en curso es pública con solo sus semanas selladas, sin campeón', async () => {
    renderSeason('/temporada/2026-T4', {
      body: { data: { season: { id: '2026-T4', sealedWeeks: 3, closed: false }, rows: [row(1, KAIRO, 68)] } },
    })
    expect(await screen.findByText(nbsp(t('pages.season.open', { count: 3 })))).toBeInTheDocument()
    expect(screen.queryByText(t('pages.season.champion'))).toBeNull()
    expect(screen.getByText(t('pages.season.rules.tiebreak'))).toBeInTheDocument()
  })

  it('RF-ARC-03: ↑ ↓ recorren la clasificación (el foco es el cursor)', async () => {
    renderSeason('/temporada/2026-T3', { body: { data: CLOSED } })
    const first = await screen.findByRole('link', { name: 'aina' })
    first.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('link', { name: 'Kairo.wav' })[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(first).toHaveFocus()
  })

  it('RF-ARC-04: «2026-t4» lleva a «2026-T4»; un id que no es una temporada pinta la 404', async () => {
    const router = renderSeason('/temporada/2026-t4', {
      body: { data: { season: { id: '2026-T4', sealedWeeks: 0, closed: false }, rows: [] } },
    })
    expect(await screen.findByText(t('pages.season.empty'))).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/temporada/2026-T4')
  })

  it('RF-ARC-04: un id que no es una temporada es la 404; una sin semanas empezadas, su estado vacío', async () => {
    renderSeason('/temporada/t4', { body: {} })
    expect(await screen.findByRole('heading', { name: '404' })).toBeInTheDocument()
  })

  it('RF-ARC-03: una temporada sin semanas empezadas (la API da 404) enseña la pantalla vacía', async () => {
    renderSeason('/temporada/2030-T1', { status: 404, body: { error: { code: 'NOT_FOUND', message: '' } } })
    expect(await screen.findByText(t('pages.season.notStarted'))).toBeInTheDocument()
  })
})

describe('temporadas en la web (§2.9)', () => {
  it('RF-ARC-04: la temporada en curso es la del lunes de hoy (la semana del 28 de diciembre sigue en la T4)', () => {
    expect(currentSeason(Date.UTC(2027, 0, 1, 12))).toBe('2026-T4')
    expect(currentSeason(Date.UTC(2027, 0, 4, 12))).toBe('2027-T1')
  })

  it('§2.9: leer, nombrar y moverse entre temporadas', () => {
    expect(parseSeason('2026-t4')).toEqual({ year: 2026, quarter: 4 })
    expect(parseSeason('t4')).toBeNull()
    expect(seasonLabel('2026-T4')).toBe('T4 de 2026')
    expect(shiftSeason('2026-T4', 1)).toBe('2027-T1')
    expect(shiftSeason('2027-T1', -1)).toBe('2026-T4')
  })
})

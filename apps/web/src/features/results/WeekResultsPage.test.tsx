import type { WeekResults } from '@beatbattle/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testQueryClient } from '../../app/layout/testing'
import { t } from '../../i18n'
import { resetPlayerForTests } from '../player/store'
import { WeekResultsPage } from './WeekResultsPage'

const row = (id: string, position: number | null, producer: string) => ({
  entry: {
    id,
    weekSlug: '2026-w41',
    alias: `Alias ${id}`,
    title: `Flip ${id}`,
    description: null,
    bpm: 92,
    musicalKey: 'Dm' as const,
    daw: null,
    genres: [],
    durationMs: 60_000,
    peaks: null,
    gainDb: -6,
    streamUrl: '/s',
    cover: { kind: 'generative' as const, seed: 7 },
    producer: { username: producer, displayName: producer, avatarUrl: null },
    result: null,
  },
  result: {
    position,
    scoreMilli: 4000,
    votes: 5,
    meanMilli: 4000,
    medianHalf: 8,
    histogram: [0, 0, 1, 2, 2] as [number, number, number, number, number],
    seasonPoints: 0,
  },
})

const BASE: WeekResults = {
  week: { slug: '2026-w41', number: 41, sampleTitle: 'Lluvia', sealedAt: 1, revision: 1, correctedAt: null },
  rows: [
    row('a', 1, 'kairo'),
    row('b', 2, 'noah'),
    row('c', 3, 'merce'),
    row('d', 4, 'lil'),
    row('e', null, 'nadie'),
  ],
  mine: null,
  myGame: null,
}

/** Testing Library normaliza los espacios del nodo (también el de no separación), no los del texto buscado. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

function renderPage(results: WeekResults) {
  const router = createMemoryRouter(
    [{ path: '/semana/:slug/resultados', loader: () => results, element: <WeekResultsPage /> }],
    { initialEntries: ['/semana/2026-w41/resultados'] },
  )
  const client = testQueryClient()
  client.setQueryData(['results', results.week.slug], results)
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetPlayerForTests()
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: null }), { headers: { 'content-type': 'application/json' } }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('la capa de juego en los resultados (§3.8.6, tarea 7.21)', () => {
  it('RF-RES-08: «TU RESULTADO» dice el XP del sellado, los puntos de temporada y el oído de oro', async () => {
    renderPage({ ...BASE, mine: row('d', 4, 'lil'), myGame: { xp: 137, goldenEar: true, seasonPoints: 12 } })
    const mine = await screen.findByRole('region', { name: t('results.mine.label') }, { timeout: 4000 })
    expect(within(mine).getByText(t('results.mine.xp'))).toBeInTheDocument()
    expect(within(mine).getByText(plain(t('results.mine.xpValue', { xp: 137 })))).toBeInTheDocument()
    expect(
      within(mine).getByText(plain(t('results.mine.seasonPointsValue', { points: 12 }))),
    ).toBeInTheDocument()
    expect(within(mine).getByText(t('results.mine.goldenEarYes'))).toBeInTheDocument()
  })

  it('RF-RES-08: un jurado sin entrada ve su XP y su oído de oro (sin posición ni puntos de temporada)', async () => {
    renderPage({ ...BASE, myGame: { xp: 75, goldenEar: true, seasonPoints: 0 } })
    const mine = await screen.findByRole('region', { name: t('results.mine.label') }, { timeout: 4000 })
    expect(within(mine).getByText(plain(t('results.mine.xpValue', { xp: 75 })))).toBeInTheDocument()
    expect(within(mine).queryByText(t('results.mine.position'))).toBeNull()
    expect(within(mine).queryByText(t('results.mine.seasonPoints'))).toBeNull()
  })

  it('RF-RES-08: sin nada que contar (no participó ni ganó nada), «TU RESULTADO» no sale', async () => {
    renderPage({ ...BASE, myGame: { xp: 0, goldenEar: false, seasonPoints: 0 } })
    await screen.findByText(t('results.standingsTitle'), {}, { timeout: 4000 })
    expect(screen.queryByRole('region', { name: t('results.mine.label') })).toBeNull()
  })

  it('RF-RES-08: el reparto de XP de la tabla es el XP base de cada puesto; la sin clasificar, nada', async () => {
    renderPage(BASE)
    const table = (await screen.findByText(t('results.standingsTitle'), {}, { timeout: 4000 })).closest(
      'section',
    ) as HTMLElement
    const votes = t('results.votes', { count: 5 })
    const subtitle = (alias: string, xp: number) =>
      plain(t('results.rowXp', { subtitle: t('results.rowSubtitle', { alias, votes }), xp }))
    expect(within(table).getByText(subtitle('Alias a', 500))).toBeInTheDocument()
    expect(within(table).getByText(subtitle('Alias b', 350))).toBeInTheDocument()
    expect(within(table).getByText(subtitle('Alias c', 250))).toBeInTheDocument()
    expect(within(table).getByText(subtitle('Alias d', 100))).toBeInTheDocument()
    expect(
      within(table).getByText(plain(t('results.unrankedRow', { alias: 'Alias e', votes }))),
    ).toBeInTheDocument()
  })
})

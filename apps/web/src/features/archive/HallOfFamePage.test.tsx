import type { HallOfFame } from '@beatbattle/shared'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { currentSeason, seasonLabel } from '../game/season'
import { HallOfFamePage, hallOfFameLoader } from './HallOfFamePage'

const KAIRO = { username: 'kairo.wav', displayName: 'Kairo.wav', avatarUrl: null }
const AINA = { username: 'aina', displayName: 'aina', avatarUrl: null }

const winner = (weekNumber: number, producer: typeof KAIRO | null) => ({
  weekSlug: `2026-w${weekNumber}`,
  weekNumber,
  entryId: `e-${weekNumber}`,
  alias: 'Faro Errante',
  title: `Flip ${weekNumber}`,
  cover: { kind: 'generative' as const, seed: weekNumber },
  producer,
})

const HALL: HallOfFame = {
  weeklyWinners: [winner(42, KAIRO), winner(41, null), winner(40, AINA)],
  seasonChampions: [
    { seasonId: '2026-T3', producers: [AINA] },
    { seasonId: '2026-T2', producers: [KAIRO, AINA] },
  ],
  records: {
    mostWins: { producer: KAIRO, value: 2 },
    longestStreak: { producer: null, value: 6 },
    bestScore: { producer: AINA, scoreMilli: 4702, weekSlug: '2026-w40', entryId: 'e-40' },
    mostVotesCast: null,
  },
}

function renderHall(hall: HallOfFame) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: hall }), { headers: { 'content-type': 'application/json' } }),
    ),
  )
  const router = createMemoryRouter(
    [{ path: '/salon-de-la-fama', loader: hallOfFameLoader, element: <HallOfFamePage /> }],
    { initialEntries: ['/salon-de-la-fama'] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('salón de la fama (§2.9, §3.8.14)', () => {
  it('RF-ARC-02: los récords con quién y su cifra; «Productor eliminado» y «Todavía sin récord»', async () => {
    renderHall(HALL)
    const records = await screen.findByRole('region', { name: t('pages.hallOfFame.records.title') })
    const rows = within(records).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      `01${t('pages.hallOfFame.records.mostWins')}Kairo.wav2 victorias`,
      `02${t('pages.hallOfFame.records.longestStreak')}${t('results.deletedProducer')}6 semanas`,
      `03${t('pages.hallOfFame.records.bestScore')}aina4,70${t('pages.hallOfFame.records.seeEntry')}`,
      `04${t('pages.hallOfFame.records.mostVotesCast')}${t('pages.hallOfFame.records.none')}`,
    ])
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'Kairo.wav' })).toHaveAttribute(
      'href',
      '/p/kairo.wav',
    )
    // Un productor eliminado ya no tiene perfil al que llevar.
    expect(within(rows[1] as HTMLElement).queryByRole('link')).toBeNull()
    expect(
      within(rows[2] as HTMLElement).getByRole('link', { name: t('pages.hallOfFame.records.seeEntry') }),
    ).toHaveAttribute('href', '/e/e-40')
  })

  it('RF-ARC-02: los campeones semana a semana (con su disco de oro) llevan a sus resultados y se recorren con ← →', async () => {
    renderHall(HALL)
    const menu = await screen.findByRole('menu', { name: t('pages.hallOfFame.winners.title') })
    const items = within(menu).getAllByRole('menuitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveAttribute('href', '/semana/2026-w42/resultados')
    expect(items[0]).toHaveTextContent('Semana 42')
    expect(items[1]).toHaveTextContent(t('results.deletedProducer'))
    expect(
      within(items[0] as HTMLElement).getByRole('img', { name: t('ui.medal.place1') }),
    ).toBeInTheDocument()
    // Una sola parada de tabulación; las flechas mueven el cursor.
    expect(items.map((item) => item.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    ;(items[0] as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(items[1]).toHaveFocus()
  })

  it('RF-ARC-02: los campeones de temporada en placas, a su clasificación; los ex aequo, juntos', async () => {
    renderHall(HALL)
    const champions = await screen.findByRole('region', { name: t('pages.hallOfFame.champions.title') })
    const plates = within(champions).getAllByRole('link')
    expect(plates[0]).toHaveAttribute('href', '/temporada/2026-T3')
    expect(plates[0]).toHaveTextContent(seasonLabel('2026-T3'))
    expect(plates[1]).toHaveTextContent(t('pages.hallOfFame.champions.kicker', { count: 2 }))
    expect(plates[1]).toHaveTextContent('Kairo.wav · aina')
  })

  it('RF-ARC-02: sin semanas selladas, el salón lo dice y lleva a la temporada en juego', async () => {
    renderHall({
      weeklyWinners: [],
      seasonChampions: [],
      records: { mostWins: null, longestStreak: null, bestScore: null, mostVotesCast: null },
    })
    expect(await screen.findByText(t('pages.hallOfFame.winners.none'))).toBeInTheDocument()
    const champions = screen.getByRole('region', { name: t('pages.hallOfFame.champions.title') })
    expect(within(champions).getByRole('link')).toHaveAttribute('href', `/temporada/${currentSeason()}`)
    expect(screen.getAllByText(t('pages.hallOfFame.records.none'))).toHaveLength(4)
  })
})

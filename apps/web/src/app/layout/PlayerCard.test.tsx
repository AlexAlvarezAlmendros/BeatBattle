import type { Me } from '@beatbattle/shared'
import { act, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playerOf, useSession } from '../../features/account/session'
import { useHud } from '../../features/game/hudStore'
import { t } from '../../i18n'
import { EMPTY_ME_GAME } from '../../test/game'
import { PlayerCard } from './PlayerCard'
import { RootLayout } from './RootLayout'
import { interiorScreen, simpleScreen } from './screen'

const ME: Me = {
  id: 'u1',
  email: 'lilbru@example.com',
  emailVerified: true,
  username: 'lilbru',
  displayUsername: 'LilBru',
  role: 'user',
  cardNumber: 42,
  xp: 2980,
  avatarUrl: null,
  game: {
    ...EMPTY_ME_GAME,
    xp: 2980,
    level: 7,
    levelSeen: 7,
    streak: { current: 3, best: 5, jokerAvailable: true },
    season: { id: '2026-T4', points: 12, position: 9 },
  },
}

/** Testing Library normaliza los espacios del nodo (también el de no separación), no los del texto buscado. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

function renderFrame(path = '/historia') {
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          {
            path: 'historia',
            handle: {
              screen: interiorScreen({ kicker: 'frame.plates.howItWorks', title: 'pages.howItWorks.title' }),
            },
            element: <h1>Historia</h1>,
          },
          { path: 'entrar', handle: { screen: simpleScreen() }, element: <h1>Entrar</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: ME }), { headers: { 'content-type': 'application/json' } }),
  )
  useHud.setState({ holds: 0 })
  useHud.getState().reset()
})

afterEach(() => {
  act(() => useSession.setState({ status: 'anonymous', me: null }))
  act(() => useHud.getState().reset())
  vi.restoreAllMocks()
})

describe('HUD de jugador (§3.4.1, tarea 7.18)', () => {
  it('RF-GAME-08: el nivel, el rango y el medidor salen de la capa de juego de `me`', async () => {
    useSession.setState({ status: 'signedIn', me: ME })
    renderFrame()
    const hud = screen.getByRole('banner')
    expect(await within(hud).findByText('LilBru')).toBeInTheDocument()
    const meter = within(hud).getByRole('meter', { name: t('frame.player.xp') })
    expect(meter).toHaveAttribute('aria-valuenow', '2980')
    expect(meter).toHaveAttribute('aria-valuemin', '2650')
    expect(meter).toHaveAttribute('aria-valuemax', '3350')
    expect(within(hud).getByText(t('rank.beatmaker'), { exact: false })).toBeInTheDocument()
  })

  it('RF-GAME-08: las teselas de temporada y racha van en las pantallas del marco de juego, con lo que oye el lector', async () => {
    useSession.setState({ status: 'signedIn', me: ME })
    renderFrame()
    const hud = screen.getByRole('banner')
    expect(await within(hud).findByText(t('game.hud.season', { season: 'T4' }))).toBeInTheDocument()
    expect(
      within(hud).getByText(plain(t('game.hud.seasonValue', { points: 12, position: 9 }))),
    ).toBeInTheDocument()
    expect(
      within(hud).getByText(t('game.hud.seasonSr', { season: 'T4', points: 12, position: 9 })),
    ).toHaveClass('sr-only')
    expect(within(hud).getByText(t('game.hud.streakValue', { count: 3 }))).toBeInTheDocument()
    expect(within(hud).getByText(t('game.hud.streakSr', { count: 3 }))).toHaveClass('sr-only')
  })

  it('RF-GAME-08: sin puesto en la temporada, solo los puntos; sin temporada, sin su tesela', () => {
    const unranked = playerOf({
      ...ME,
      game: { ...ME.game, season: { id: '2026-T4', points: 0, position: null } },
    })
    expect(unranked.season?.value).toBe(t('game.hud.seasonValueUnranked', { points: 0 }))
    expect(playerOf({ ...ME, game: { ...ME.game, season: null } }).season).toBeUndefined()
    expect(
      playerOf({ ...ME, game: { ...ME.game, streak: { current: 0, best: 2, jokerAvailable: false } } })
        .streak,
    ).toBe(0)
  })

  it('en el marco simple no hay capa de juego: ni ficha ni teselas', async () => {
    useSession.setState({ status: 'signedIn', me: ME })
    renderFrame('/entrar')
    const hud = screen.getByRole('banner')
    await screen.findByRole('heading', { name: 'Entrar' })
    expect(within(hud).queryByText(t('game.hud.streak'))).toBeNull()
    expect(within(hud).queryByText('LilBru')).toBeNull()
  })

  it('RF-GAME-08: el medidor no enseña el XP que aún vuela y sube cuando lo traga', () => {
    const player = playerOf({ ...ME, xp: 2985, game: { ...ME.game, xp: 2985 } })
    render(<PlayerCard {...player} />)
    const meter = screen.getByRole('meter', { name: t('frame.player.xp') })
    expect(meter).toHaveAttribute('aria-valuenow', '2985')
    let id = 0
    act(() => {
      id = useHud.getState().gain({ amount: 5 })
    })
    expect(meter).toHaveAttribute('aria-valuenow', '2980')
    act(() => useHud.getState().land(id))
    expect(meter).toHaveAttribute('aria-valuenow', '2985')
  })

  it('RF-GAME-08: con un «+XP» que cruza el nivel, la ficha sigue en el nivel de antes hasta tragarlo, y entonces se estampa', () => {
    const player = playerOf({ ...ME, xp: 3355, game: { ...ME.game, xp: 3355, level: 8 } })
    render(<PlayerCard {...player} />)
    let id = 0
    act(() => {
      id = useHud.getState().gain({ amount: 10 })
    })
    const level = () => screen.getByText(/^\d+$/, { selector: 'b' })
    expect(level()).toHaveTextContent('7')
    expect(level()).not.toHaveAttribute('data-stamp')
    act(() => useHud.getState().land(id))
    expect(level()).toHaveTextContent('8')
    expect(level()).toHaveAttribute('data-stamp')
  })

  it('RF-GAME-02: en el nivel 20 el medidor va lleno con «NV 20 · MÁX»', () => {
    const player = playerOf({ ...ME, xp: 17_000, game: { ...ME.game, xp: 17_000, level: 20 } })
    render(<PlayerCard {...player} />)
    const meter = screen.getByRole('meter', { name: t('frame.player.xp') })
    expect(meter).toHaveAttribute(
      'aria-valuetext',
      t('frame.player.xpTextMax', { value: '17.000', level: 20 }),
    )
    expect(screen.getByText(t('frame.player.xpEndMax', { level: 20 }))).toBeInTheDocument()
  })
})

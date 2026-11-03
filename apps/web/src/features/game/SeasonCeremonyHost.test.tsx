import type { Me } from '@beatbattle/shared'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_ME_GAME } from '../../test/game'
import { useSession } from '../account/session'
import { useHud } from './hudStore'
import { SeasonCeremonyHost } from './SeasonCeremonyHost'
import { resultsSeasonOf, SeasonCeremonyCue, useSeasonCeremony } from './seasonCeremony'

// La capa de verdad (la carta, la línea de tiempo) tiene sus pruebas; aquí, una que se cierra al pulsar.
vi.mock('./SeasonCeremony', () => ({
  SeasonCeremony: ({
    seasonId,
    champion,
    onDone,
  }: {
    seasonId: string
    champion: boolean
    onDone: (seen: boolean) => void
  }) => (
    <div role="dialog" aria-label={`ceremonia ${seasonId}${champion ? ' (campeón)' : ''}`}>
      <button type="button" onClick={() => onDone(true)}>
        acabar
      </button>
      <button type="button" onClick={() => onDone(false)}>
        sin red
      </button>
    </div>
  ),
}))

const ME: Me = {
  id: 'u1',
  email: 'aina@example.com',
  emailVerified: true,
  username: 'aina',
  displayUsername: 'Aina',
  role: 'user',
  cardNumber: 7,
  xp: 125,
  avatarUrl: null,
  game: { ...EMPTY_ME_GAME, xp: 125, seasonCeremony: { seasonId: '2026-T3', champion: true } },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  useHud.setState({ holds: 0 })
  useHud.getState().reset()
  useSeasonCeremony.setState({ cues: 0, done: [] })
  useSession.setState({ status: 'signedIn', me: ME })
})

afterEach(() => {
  act(() => useSession.setState({ status: 'anonymous', me: null }))
  vi.unstubAllGlobals()
})

/** Las peticiones a `POST /api/me/seen`, con su cuerpo. */
function seenRequests(): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith('/api/me/seen'))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

/**
 * El marco con el anfitrión y unas pantallas: el menú (que da el turno si `cue`), los resultados de una semana (también
 * con su turno) y el Modo Jurado (que no lo da nunca).
 */
function renderFrame(path: string, { cue = true } = {}) {
  const screenOf = (name: string, withCue: boolean) => (
    <>
      <h1>{name}</h1>
      {withCue && <SeasonCeremonyCue />}
    </>
  )
  // Como `RootLayout`: el anfitrión en el marco, que no se desmonta al cambiar de pantalla.
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <SeasonCeremonyHost />
          </>
        ),
        children: [
          { path: '/', element: screenOf('menú', cue) },
          { path: '/semana/:slug/resultados', element: screenOf('resultados', cue) },
          { path: '/jurado', element: screenOf('jurado', true) },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('la ceremonia del campeón de temporada en el marco (7.27, §3.8.15)', () => {
  it('RF-ARC-05: en el menú, con su turno, sale una vez; al cerrarla se marca vista (`season_champion`) y no vuelve', async () => {
    renderFrame('/')
    const dialog = await screen.findByRole('dialog', { name: 'ceremonia 2026-T3 (campeón)' })
    expect(dialog).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'acabar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(seenRequests()).toEqual([{ kind: 'season_champion', ref: '2026-T3' }])
    // La sesión ya no la trae pendiente: ni al volver a pedir el turno.
    expect(useSession.getState().me?.game.seasonCeremony).toBeNull()
    act(() => useSeasonCeremony.setState((state) => ({ cues: state.cues + 1 })))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(seenRequests()).toHaveLength(1)
  })

  it('§3.8.8: mientras está pendiente en el menú (también sin su turno) los avisos esperan; al cerrarse salen', async () => {
    renderFrame('/', { cue: false })
    act(() =>
      useHud
        .getState()
        .notify([{ kind: 'achievement', id: 'season_champ', rarity: 'legendary', xp: 300, pending: 0 }]),
    )
    // Retenidos: con la oferta de la ceremonia de la semana delante, aún no es su turno.
    expect(useHud.getState().holds).toBe(1)
    expect(useHud.getState().big).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    // Le llega el turno: sale, y los avisos siguen esperando.
    act(() => useSeasonCeremony.setState((state) => ({ cues: state.cues + 1 })))
    await screen.findByRole('dialog')
    expect(useHud.getState().big).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'acabar' }))
    // Al cerrarse, el «¡LOGRO LEGENDARIO!» de `season_champ`, después de ella.
    expect(useHud.getState().holds).toBe(0)
    expect(useHud.getState().big).toMatchObject({ kind: 'achievement', id: 'season_champ' })
  })

  it('§3.8.15: en otra pantalla (el Modo Jurado) ni sale ni retiene los avisos', () => {
    renderFrame('/jurado')
    expect(useHud.getState().holds).toBe(0)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('§3.8.15: en los resultados de una semana de esa temporada sale; en los de otra, no (ni retiene)', async () => {
    const router = renderFrame('/semana/2026-w39/resultados', { cue: false })
    expect(useHud.getState().holds).toBe(1)
    await act(() => router.navigate('/semana/2026-w41/resultados'))
    // La 41 es de la T4: ni la suya ni retiene.
    expect(useHud.getState().holds).toBe(0)
    await act(() => router.navigate('/semana/2026-w40/resultados'))
    expect(useHud.getState().holds).toBe(1)
    act(() => useSeasonCeremony.setState((state) => ({ cues: state.cues + 1 })))
    expect(await screen.findByRole('dialog', { name: /2026-T3/ })).toBeInTheDocument()
  })

  it('§3.8.8: al pasar del menú a los resultados de su temporada no suelta los avisos por el camino', async () => {
    const router = renderFrame('/', { cue: false })
    const holds: number[] = []
    const unsubscribe = useHud.subscribe((state) => holds.push(state.holds))
    await act(() => router.navigate('/semana/2026-w40/resultados'))
    unsubscribe()
    expect(useHud.getState().holds).toBe(1)
    expect(holds).not.toContain(0)
  })

  it('RF-ARC-05: si no se ha podido cargar, no vuelve a salir en esta pestaña pero sigue pendiente (no se marca vista)', async () => {
    renderFrame('/')
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'sin red' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(seenRequests()).toEqual([])
    expect(useSession.getState().me?.game.seasonCeremony).not.toBeNull()
    expect(useHud.getState().holds).toBe(0)
  })

  it('§3.8.15: sin sesión, o sin ceremonia pendiente, nada', () => {
    useSession.setState({ status: 'signedIn', me: { ...ME, game: { ...ME.game, seasonCeremony: null } } })
    renderFrame('/')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useHud.getState().holds).toBe(0)
  })
})

describe('la temporada de una página de resultados', () => {
  it('RF-ARC-04: la de su lunes; la semana del 2026-12-28 sigue siendo de la T4', () => {
    expect(resultsSeasonOf('/semana/2026-w40/resultados')).toBe('2026-T3')
    expect(resultsSeasonOf('/semana/2026-w53/resultados')).toBe('2026-T4')
    expect(resultsSeasonOf('/semana/2026-w40')).toBeNull()
    expect(resultsSeasonOf('/semana/no-es-una-semana/resultados')).toBeNull()
    expect(resultsSeasonOf('/')).toBeNull()
  })
})

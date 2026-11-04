import { SEASON_FANFARE_HIT } from '@beatbattle/audio'
import { duration } from '@beatbattle/shared/tokens'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { flash } from '../../ui/flash'
import { mockMatchMedia } from '../../ui/hooks/mockMatchMedia'
import { setSeriousMode } from '../../ui/hooks/useSeriousMode'
import {
  loadSeasonChampions,
  SEASON_CEREMONY_TIMELINE,
  SeasonCeremony,
  SeasonCeremonyLayer,
  type SeasonChampionsView,
} from './SeasonCeremony'

/** Testing Library normaliza los espacios del nodo (también el de no separación), no los del texto buscado. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

const card = (name: string, cardNumber: number) => ({
  name,
  initials: name.slice(0, 2).toUpperCase(),
  cardNumber,
  level: 14,
  levelFraction: 0.4,
  rank: 'Leyenda del barrio',
  stats: { wins: 6, podiums: 9, weeks: 12 },
  showcase: [],
  achievements: 9,
  since: '03/2026',
  avatarUrl: null,
  variant: 'champion' as const,
})

const VIEW: SeasonChampionsView = {
  seasonId: '2026-T3',
  points: 287,
  wins: 8,
  podiums: 13,
  champions: [{ name: 'kairo.wav', card: card('kairo.wav', 42) }],
}

const TIE: SeasonChampionsView = {
  ...VIEW,
  champions: [...VIEW.champions, { name: 'aina', card: card('aina', 7) }],
}

let play: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  play = vi.spyOn(audio, 'play').mockImplementation(() => {})
  flash.reset()
})

afterEach(() => {
  setSeriousMode(false)
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ceremonia del campeón de temporada (7.27, §3.8.15)', () => {
  it('RF-ARC-05: la placa de fin de temporada, la carta de campeón con «¡CAMPEÓN DE TEMPORADA!» en el acorde, las cifras y se cierra sola a los 6 s', () => {
    const onDone = vi.fn()
    render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={onDone} />)
    const dialog = screen.getByRole('dialog', {
      name: t('ceremony.season.label', { season: 'T3 de 2026' }),
    })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText(t('ceremony.season.kicker'))).toBeInTheDocument()
    expect(screen.getByText('T3 de 2026')).toBeInTheDocument()
    // Antes del acorde, ni la carta ni el anunciador.
    expect(document.querySelector('[data-producer-card]')).toBeNull()
    expect(screen.queryByText(t('ceremony.season.announcer', { count: 1 }))).toBeNull()
    // RD-MOT-02: la carta cae en el acorde de `cer.season`.
    expect(SEASON_CEREMONY_TIMELINE.card).toBe(SEASON_FANFARE_HIT * 1000)
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.card))
    const shown = document.querySelector('[data-producer-card]')
    expect(shown).toHaveAttribute('data-variant', 'champion')
    expect(shown).toHaveTextContent('kairo.wav')
    expect(screen.getByText(t('ceremony.season.announcer', { count: 1 }))).toBeInTheDocument()
    expect(screen.queryByText(t('ceremony.season.headline', { season: 'T3 de 2026' }))).toBeNull()
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.line - SEASON_CEREMONY_TIMELINE.card))
    expect(screen.getByText(t('ceremony.season.headline', { season: 'T3 de 2026' }))).toBeInTheDocument()
    expect(screen.getByText(plain('kairo.wav · 287 PTS · 8 victorias · 13 podios'))).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.total - SEASON_CEREMONY_TIMELINE.line))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('RNF-A11Y-05: `cer.season` suena una vez al empezar y su equivalente es la carta con el anunciador y la región viva', () => {
    render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={() => {}} />)
    expect(play).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledWith('cer.season')
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).toHaveTextContent('')
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.card))
    expect(live).toHaveTextContent(
      plain(
        t('ceremony.season.live', {
          headline: t('ceremony.season.headline', { season: 'T3 de 2026' }),
          names: 'kairo.wav',
          stats: '287 PTS · 8 victorias · 13 podios',
        }),
      ),
    )
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.total))
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('§3.8.15: a quien es campeón se le dice a él; con ex aequo, «¡CAMPEONES DE TEMPORADA!» y las dos cartas a la vez', () => {
    const { unmount } = render(<SeasonCeremonyLayer view={VIEW} you onDone={() => {}} />)
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.line))
    expect(screen.getByText(t('ceremony.season.headlineYou', { season: 'T3 de 2026' }))).toBeInTheDocument()
    unmount()
    render(<SeasonCeremonyLayer view={TIE} you={false} onDone={() => {}} />)
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.line))
    expect(screen.getByText(t('ceremony.season.announcer', { count: 2 }))).toBeInTheDocument()
    expect(screen.getByText(t('ceremony.season.headlineTie', { season: 'T3 de 2026' }))).toBeInTheDocument()
    const cards = document.querySelectorAll('[data-producer-card]')
    expect(cards).toHaveLength(2)
    for (const item of cards) expect(item).toHaveAttribute('data-variant', 'champion')
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('kairo.wav y aina')
  })

  it('RD-VIS-05 (excepción de la carta escalada, 2026-11-04): la línea de las cifras dice también quién es el campeón (y los ex aequo), y cada carta va en su caja de escala', () => {
    // En una ventana baja y vertical, o con ex aequo en el móvil, la carta se escala como un dibujo y su letra baja de
    // 12 px (`.cardBox`, CSS): lo que dice no se pierde, porque el nombre va también en la línea, a su tamaño.
    const { unmount } = render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={() => {}} />)
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.line))
    expect(screen.getByText(plain('kairo.wav · 287 PTS · 8 victorias · 13 podios'))).toBeInTheDocument()
    expect(document.querySelector('[data-card-box] > [data-producer-card]')).not.toBeNull()
    unmount()
    render(<SeasonCeremonyLayer view={TIE} you onDone={() => {}} />)
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.line))
    expect(
      screen.getByText(plain('kairo.wav y aina · 287 PTS · 8 victorias · 13 podios')),
    ).toBeInTheDocument()
    expect(document.querySelectorAll('[data-card-box] > [data-producer-card]')).toHaveLength(2)
  })

  it('RD-MOT-01: cualquier tecla la salta sin llegar a la pantalla de detrás, pero no la que cerró la capa anterior (los primeros 280 ms)', () => {
    const onDone = vi.fn()
    const behind = vi.fn()
    document.addEventListener('keydown', behind)
    render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={onDone} />)
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(duration.slam))
    // Tab y las de modificador no la saltan.
    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.keyDown(document, { key: 'Shift' })
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(onDone).toHaveBeenCalledTimes(1)
    // Ninguna de esas llegó a la pantalla de detrás (Shift no se toca).
    expect(behind.mock.calls.map(([event]) => (event as KeyboardEvent).key)).toEqual(['Shift'])
    document.removeEventListener('keydown', behind)
  })

  it('RD-MOT-01: M la salta y además silencia (le llega al marco); un clic, un toque o «Saltar» también la cierran', () => {
    const onDone = vi.fn()
    const behind = vi.fn()
    document.addEventListener('keydown', behind)
    const { unmount } = render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(duration.slam))
    fireEvent.keyDown(document, { key: 'm' })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(behind).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', behind)
    unmount()

    const clicked = vi.fn()
    const second = render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={clicked} />)
    act(() => vi.advanceTimersByTime(duration.slam))
    fireEvent.click(screen.getByRole('dialog'))
    expect(clicked).toHaveBeenCalledTimes(1)
    second.unmount()

    const skipped = vi.fn()
    render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={skipped} />)
    // «Saltar» tiene el foco y vale desde el primer instante (es un botón que se pulsa a propósito).
    const skip = screen.getByRole('button', { name: new RegExp(t('ceremony.skip')) })
    expect(skip).toHaveFocus()
    fireEvent.click(skip)
    expect(skipped).toHaveBeenCalledTimes(1)
  })

  it('§3.8.15: modal: lo de detrás queda `inert` mientras dura y lo vuelve a soltar al cerrarse', () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)
    const { unmount } = render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={() => {}} />)
    expect(root).toHaveAttribute('inert')
    unmount()
    expect(root).not.toHaveAttribute('inert')
    root.remove()
  })

  it('RD-MOT-04: el confeti es un destello pedido al limitador; sin movimiento o en modo serio, ninguno', () => {
    const request = vi.spyOn(flash, 'request')
    const first = render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={() => {}} />)
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.total - 1))
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({ reason: 'ceremony', area: 0.25, opacity: 0.4 })
    first.unmount()

    setSeriousMode(true)
    flash.reset()
    request.mockClear()
    const serious = render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={() => {}} />)
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.line))
    // En modo serio el limitador no autoriza nada: sin confeti.
    expect(request.mock.results.every((result) => result.value === null)).toBe(true)
    expect(document.querySelector('[data-fx] span[data-tone]')).toBeNull()
    serious.unmount()
    setSeriousMode(false)

    const media = mockMatchMedia({ '(prefers-reduced-motion: reduce)': true })
    request.mockClear()
    const reduced = render(<SeasonCeremonyLayer view={VIEW} you={false} onDone={() => {}} />)
    act(() => vi.advanceTimersByTime(SEASON_CEREMONY_TIMELINE.line))
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-reduced')
    // RF-GAME-07: sin movimiento, la carta plana.
    expect(document.querySelector('[data-producer-card]')).toHaveAttribute('data-flat')
    reduced.unmount()
    media.restore()
  })
})

/** Responde a `fetch` según la ruta, como la API (`{ data }` o `{ error }`). */
function stubApi(routes: Record<string, { status?: number; body: unknown }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const reply = routes[path] ?? { status: 404, body: { error: { code: 'not_found', message: 'No' } } }
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

const KAIRO = { username: 'kairo.wav', displayName: 'Kairo.wav', avatarUrl: null }

const standings = (closed: boolean, producers: (typeof KAIRO | null)[]) => ({
  data: {
    season: { id: '2026-T3', sealedWeeks: 13, closed },
    rows: producers.map((producer, index) => ({
      position: index < producers.length - 1 ? 1 : 2,
      producer,
      points: index < producers.length - 1 ? 287 : 200,
      wins: 8,
      podiums: 13,
      weeks: 12,
      meanScoreMilli: 4100,
    })),
  },
})

const PROFILE = {
  data: {
    username: 'kairo.wav',
    displayUsername: 'kairo.wav',
    cardNumber: 42,
    joinedAt: Date.UTC(2026, 2, 10),
    xp: 9000,
    bio: null,
    city: null,
    links: {},
    accent: 'red',
    avatarUrl: null,
    game: {
      level: 13,
      stats: {
        bestPosition: 1,
        streak: { current: 3, best: 6 },
        meanScoreMilli: 4180,
        goldenEars: 4,
        votesCast: 312,
        season: null,
      },
      history: [],
      achievements: [{ id: 'win', unlockedAt: Date.UTC(2026, 8, 1) }],
      showcase: ['win'],
    },
  },
}

describe('los campeones, de lo público (7.27, §3.8.15)', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('RF-ARC-05: la primera fila de la clasificación cerrada y la carta de cada campeón con su perfil, siempre la de campeón', async () => {
    stubApi({
      '/api/seasons/2026-T3/standings': { body: standings(true, [KAIRO, null, KAIRO]) },
      '/api/profiles/kairo.wav': { body: PROFILE },
    })
    const view = await loadSeasonChampions('2026-T3')
    expect(view).toMatchObject({ seasonId: '2026-T3', points: 287, wins: 8, podiums: 13 })
    // El ex aequo eliminado («Productor eliminado») no tiene carta.
    expect(view?.champions.map((item) => item.name)).toEqual(['kairo.wav'])
    expect(view?.champions[0]?.card.variant).toBe('champion')
    expect(view?.champions[0]?.card.showcase).toEqual(['win'])
  })

  it('§3.8.15: sin ningún campeón con perfil, nada que enseñar (`null`); sin cerrar o sin red, falla', async () => {
    stubApi({ '/api/seasons/2026-T3/standings': { body: standings(true, [null, KAIRO]) } })
    expect(await loadSeasonChampions('2026-T3')).toBeNull()
    stubApi({ '/api/seasons/2026-T3/standings': { body: standings(true, [KAIRO, KAIRO]) } })
    // El perfil del campeón ya no existe (404): como «Productor eliminado».
    expect(await loadSeasonChampions('2026-T3')).toBeNull()
    stubApi({ '/api/seasons/2026-T3/standings': { body: standings(false, [KAIRO, KAIRO]) } })
    await expect(loadSeasonChampions('2026-T3')).rejects.toThrow()
    stubApi({
      '/api/seasons/2026-T3/standings': {
        status: 500,
        body: { error: { code: 'internal', message: 'Fallo' } },
      },
    })
    await expect(loadSeasonChampions('2026-T3')).rejects.toThrow()
  })

  it('RF-ARC-05: sin red, `onDone(false)` (sigue pendiente); sin carta que enseñar, `onDone(true)` (vista sin enseñarla)', async () => {
    stubApi({
      '/api/seasons/2026-T3/standings': {
        status: 500,
        body: { error: { code: 'internal', message: 'Fallo' } },
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failed = vi.fn()
    const { unmount } = render(<SeasonCeremony seasonId="2026-T3" champion={false} onDone={failed} />)
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(false))
    expect(screen.queryByRole('dialog')).toBeNull()
    unmount()

    stubApi({ '/api/seasons/2026-T3/standings': { body: standings(true, [null, KAIRO]) } })
    const empty = vi.fn()
    render(<SeasonCeremony seasonId="2026-T3" champion={false} onDone={empty} />)
    await vi.waitFor(() => expect(empty).toHaveBeenCalledWith(true))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

import type { WeekResults } from '@beatbattle/shared'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { setCeremonyLive, setCeremonyProjected, useCeremonyStage } from '../../stage/ceremony'
import { resetPlayerForTests } from '../player/store'
import { CEREMONY_TIMELINE, ResultsCeremony } from './ResultsCeremony'

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

const RESULTS: WeekResults = {
  week: { slug: '2026-w41', number: 41, sampleTitle: 'Lluvia', sealedAt: 1, revision: 1, correctedAt: null },
  rows: [
    row('a', 1, 'kairo'),
    row('b', 2, 'noah'),
    row('c', 3, 'merce'),
    row('d', 4, 'lil'),
    row('e', null, 'nadie'),
  ],
  mine: row('d', 4, 'lil'),
}

beforeEach(() => {
  vi.useFakeTimers()
  resetPlayerForTests()
  // jsdom no reproduce audio: el reproductor global solo necesita que `play` prometa.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ceremonia de resultados (6.17, §3.8.6)', () => {
  it('RF-RES-09: luces fuera, la ráfaga, el 3.º, el 2.º y el 1.º revelados, «¡CAMPEÓN!», tu resultado y se cierra sola', () => {
    const onDone = vi.fn()
    render(<ResultsCeremony results={RESULTS} onDone={onDone} />)
    expect(screen.getByRole('dialog', { name: t('ceremony.label', { number: 41 }) })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(CEREMONY_TIMELINE.burst + 10))
    expect(screen.getByText(t('ceremony.sealed'))).toBeInTheDocument()
    expect(screen.getByText(/lil · 4,00/)).toBeInTheDocument()
    // El 3.º: antes de revelar, el alias; después, el productor (y su lectura para los lectores de pantalla).
    act(() => vi.advanceTimersByTime(CEREMONY_TIMELINE.places[3] - CEREMONY_TIMELINE.burst))
    expect(screen.getByText('Alias c')).toBeInTheDocument()
    expect(screen.queryByText('merce')).toBeNull()
    act(() => vi.advanceTimersByTime(CEREMONY_TIMELINE.name))
    expect(screen.getByText('merce')).toBeInTheDocument()
    expect(
      screen.getByText(t('ceremony.place', { position: 3, producer: 'merce', score: '4,00' })),
    ).toBeInTheDocument()
    act(() =>
      vi.advanceTimersByTime(
        CEREMONY_TIMELINE.champion - CEREMONY_TIMELINE.places[3] - CEREMONY_TIMELINE.name,
      ),
    )
    expect(screen.getByText(t('ceremony.champion'))).toBeInTheDocument()
    expect(screen.getByText('kairo')).toBeInTheDocument()
    // La sin clasificar nunca sale.
    expect(screen.queryByText('nadie')).toBeNull()
    act(() => vi.advanceTimersByTime(CEREMONY_TIMELINE.mine - CEREMONY_TIMELINE.champion))
    expect(screen.getByText('4.º')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(CEREMONY_TIMELINE.total - CEREMONY_TIMELINE.mine))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('RF-RES-09: Esc la salta (una sola vez) y «Saltar» también', () => {
    const onDone = vi.fn()
    const { unmount } = render(<ResultsCeremony results={RESULTS} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(CEREMONY_TIMELINE.places[2]))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDone).toHaveBeenCalledOnce()
    unmount()
    const again = vi.fn()
    render(<ResultsCeremony results={RESULTS} onDone={again} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('ceremony.skip')) }))
    expect(again).toHaveBeenCalledOnce()
  })

  it('RF-RES-09 / §3.5: en 3D, el Escenario recibe el podio y los pasos; los nombres van donde caen sus peanas', () => {
    const { unmount } = render(<ResultsCeremony results={RESULTS} onDone={vi.fn()} />)
    const stage = () => useCeremonyStage.getState()
    expect(stage().element).not.toBeNull()
    expect(
      stage()
        .places.map((item) => item.place)
        .sort(),
    ).toEqual([1, 2, 3])
    act(() => vi.advanceTimersByTime(CEREMONY_TIMELINE.places[3] + CEREMONY_TIMELINE.name))
    expect(stage().places.find((item) => item.place === 3)?.step).toBe('name')
    // Sin la vista pintada, el respaldo 2D.
    expect(document.documentElement.dataset.ceremony).toBeUndefined()
    // La vista pinta y dice dónde cae la peana del 3.º: el nombre va ahí y la página de detrás se oculta.
    act(() => {
      setCeremonyProjected(3, { x: 300, y: 500 })
      setCeremonyLive(true)
    })
    expect(document.documentElement.dataset.ceremony).toBe('3d')
    const label = screen.getByText('merce').closest('div') as HTMLElement
    expect(label.style.left).toBe('300px')
    expect(label.style.top).toBe('500px')
    unmount()
    expect(stage().element).toBeNull()
    expect(document.documentElement.dataset.ceremony).toBeUndefined()
  })
})

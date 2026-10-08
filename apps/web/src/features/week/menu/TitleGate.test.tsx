import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSound } from '../../../app/layout/soundStore'
import { audio } from '../../../audio/engine'
import { t } from '../../../i18n'
import { type MatchMediaController, mockMatchMedia } from '../../../ui/hooks/mockMatchMedia'
import type { MenuModel } from './model'
import { TitleGate } from './TitleGate'
import { markTitleSeen, shouldShowTitle, TITLE_KEY, TITLE_SEEN_KEY } from './titleGate'

const MODEL: MenuModel = {
  week: {
    phase: 'open',
    number: 41,
    title: 'Lluvia en Gràcia',
    credits: 'Rhodes y lluvia',
    range: '5–11 oct',
    code: '2026-W41',
    bpm: 92,
    musicalKey: 'Re menor',
    durationSeconds: 72,
    genre: 'Boom bap',
    peaks: [],
    challenge: 'Usa solo el primer compás',
    entries: 23,
    closesAt: Date.UTC(2026, 9, 11, 18),
    when: 'domingo 11 a las 20:00',
    clockWhen: 'Domingo 11 a las 20:00',
    weekBar: { today: 2, progress: 0.36 },
  },
  season: 'T4',
  champion: { producer: 'KAIRO.WAV', week: 40, title: 'Neón en Sants', score: '4,62' },
  player: null,
  lastSealed: null,
  chronicle: [],
}

let media: MatchMediaController
let play: ReturnType<typeof vi.spyOn>
let unlock: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  media = mockMatchMedia({ '(prefers-reduced-motion: reduce)': false })
  play = vi.spyOn(audio, 'play').mockImplementation(() => {})
  unlock = vi.spyOn(audio, 'unlock').mockImplementation(() => {})
  useSound.getState().set(true)
  sessionStorage.clear()
  localStorage.removeItem(TITLE_KEY)
})

afterEach(() => {
  vi.useRealTimers()
  media.restore()
  vi.restoreAllMocks()
})

const gate = () => screen.getByRole('dialog', { name: t('home.gate.heading') })
const phase = () => gate().getAttribute('data-phase')

describe('pantalla de título (§3.8.1, 1.13)', () => {
  it('§3.8.1: es un diálogo modal con su nombre y su ayuda; tras el arranque (~1,2 s), el foco está en «Pulsa para empezar»', () => {
    render(<TitleGate model={MODEL} onDone={() => {}} />)
    expect(gate()).toHaveAttribute('aria-modal', 'true')
    expect(document.getElementById(gate().getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      t('home.gate.hint'),
    )
    expect(phase()).toBe('boot')
    act(() => vi.advanceTimersByTime(1200))
    expect(phase()).toBe('title')
    expect(screen.getByRole('button', { name: t('home.gate.start') })).toHaveFocus()
  })

  it('RD-MOT-01: cualquier tecla durante el arranque lo salta (y no entra todavía)', () => {
    const onDone = vi.fn()
    render(<TitleGate model={MODEL} onDone={onDone} />)
    fireEvent.keyDown(gate(), { key: 'x' })
    expect(phase()).toBe('title')
    expect(onDone).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })

  it('RD-SND-01: al pulsar se crea el contexto de audio, suena `ui.enter`, se recuerda para la sesión y la diagonal abre el menú', () => {
    const onDone = vi.fn()
    render(<TitleGate model={MODEL} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(1200))
    fireEvent.keyDown(gate(), { key: 'Enter' })
    expect(unlock).toHaveBeenCalled()
    expect(play).toHaveBeenCalledWith('ui.enter')
    expect(phase()).toBe('leaving')
    expect(sessionStorage.getItem(TITLE_SEEN_KEY)).toBe('yes')
    act(() => vi.advanceTimersByTime(280))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('«Entrar sin sonido» (o S) entra con el sonido apagado y sin `ui.enter`', () => {
    const onDone = vi.fn()
    render(<TitleGate model={MODEL} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(1200))
    fireEvent.keyDown(gate(), { key: 's' })
    expect(useSound.getState().enabled).toBe(false)
    expect(play).not.toHaveBeenCalledWith('ui.enter')
    expect(unlock).toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(280))
    expect(onDone).toHaveBeenCalled()
  })

  it('Tab recorre la puerta y M cambia el sonido, sin entrar; un clic en el sonido tampoco entra', () => {
    const onDone = vi.fn()
    render(<TitleGate model={MODEL} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(1200))
    fireEvent.keyDown(gate(), { key: 'Tab' })
    fireEvent.keyDown(gate(), { key: 'm' })
    expect(useSound.getState().enabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { pressed: false }))
    expect(useSound.getState().enabled).toBe(true)
    expect(phase()).toBe('title')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('un clic o un toque en cualquier sitio entra', () => {
    const onDone = vi.fn()
    render(<TitleGate model={MODEL} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(1200))
    fireEvent.click(screen.getByText(t('home.gate.inBattle')))
    expect(play).toHaveBeenCalledWith('ui.enter')
    act(() => vi.advanceTimersByTime(280))
    expect(onDone).toHaveBeenCalled()
  })

  it('RD-MOT-03: sin movimiento, el título aparece montado y se entra sin la diagonal', () => {
    media.set('(prefers-reduced-motion: reduce)', true)
    const onDone = vi.fn()
    render(<TitleGate model={MODEL} onDone={onDone} />)
    expect(phase()).toBe('title')
    fireEvent.keyDown(gate(), { key: ' ' })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('RF-OTP-01: la firma del sello se ve en la puerta; y el campeón vigente y el cartel EN JUEGO, con la semana', () => {
    render(<TitleGate model={MODEL} onDone={() => {}} />)
    act(() => vi.advanceTimersByTime(1200))
    expect(gate().querySelector('[data-otp-signature]')).not.toBeNull()
    expect(gate()).toHaveTextContent('KAIRO.WAV')
    expect(gate()).toHaveTextContent('S40 · Neón en Sants · 4,62')
    expect(screen.getByRole('heading', { level: 2, name: 'Lluvia en Gràcia' })).toBeInTheDocument()
    expect(gate()).toHaveTextContent('Temporada T4 · semana 41 · 2026-W41')
  })
})

describe('cuándo sale (§3.8.1)', () => {
  it('la primera vez en la sesión; no si ya se ha visto ni si está desactivada', () => {
    expect(shouldShowTitle()).toBe(true)
    markTitleSeen()
    expect(shouldShowTitle()).toBe(false)
    sessionStorage.clear()
    localStorage.setItem(TITLE_KEY, 'off')
    expect(shouldShowTitle()).toBe(false)
  })
})

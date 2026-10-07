import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { flash } from '../flash/flash'
import { type MatchMediaController, mockMatchMedia } from '../hooks/mockMatchMedia'
import { Stars } from './Stars'

const LABEL = 'Tu nota para Tigre Púrpura, de 1 a 5'
const nbsp = (text: string | null) => (text ?? '').replaceAll(' ', ' ')

let media: MatchMediaController
let play: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  media = mockMatchMedia({ '(prefers-reduced-motion: reduce)': false })
  play = vi.spyOn(audio, 'play').mockImplementation(() => {})
  flash.reset()
})

afterEach(() => {
  vi.useRealTimers()
  media.restore()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-serious')
})

const group = () => screen.getByRole('radiogroup', { name: LABEL })
const star = (n: number) => screen.getAllByRole('radio')[n - 1] as HTMLElement

describe('Estrellas (§3.8.4, 1.5)', () => {
  it('RNF-A11Y-06: un grupo de radio de cinco, «4 de 5 estrellas: Muy bien», con el voto marcado', () => {
    render(<Stars label={LABEL} value={4} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual([
      '1 de 5 estrellas: Flojo',
      '2 de 5 estrellas: Regular',
      '3 de 5 estrellas: Bien',
      '4 de 5 estrellas: Muy bien',
      '5 de 5 estrellas: Brutal',
    ])
    expect(star(4)).toHaveAttribute('aria-checked', 'true')
    expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([star(4)])
  })

  it('RNF-A11Y-06: con las flechas, Inicio y Fin se mueve el cursor (y rellena hasta él, sonando su nota); con 1–5 se vota', () => {
    const onVote = vi.fn()
    render(<Stars label={LABEL} value={null} onVote={onVote} />)
    act(() => star(1).focus())
    fireEvent.keyDown(group(), { key: 'ArrowRight' })
    expect(star(2)).toHaveFocus()
    expect(star(2)).toHaveAttribute('data-on')
    expect(star(3)).not.toHaveAttribute('data-on')
    expect(play).toHaveBeenCalledWith('star.hover.2')
    fireEvent.keyDown(group(), { key: 'End' })
    expect(star(5)).toHaveFocus()
    fireEvent.keyDown(group(), { key: 'Home' })
    expect(star(1)).toHaveFocus()
    expect(onVote).not.toHaveBeenCalled()
    fireEvent.keyDown(group(), { key: '3' })
    expect(onVote).toHaveBeenCalledWith(3)
    expect(star(3)).toHaveAttribute('aria-checked', 'true')
    // El cursor (el foco) pasa a la votada.
    expect(star(3)).toHaveFocus()
  })

  it('RF-VOTE-10: dormidas muestran el progreso de la escucha y el motivo, y no votan', () => {
    const onVote = vi.fn()
    render(
      <Stars label={LABEL} value={null} onVote={onVote} listen={{ heardMs: 22_000, thresholdMs: 30_000 }} />,
    )
    expect(group()).toHaveAttribute('aria-disabled', 'true')
    const reason = document.getElementById(group().getAttribute('aria-describedby') ?? '')
    expect(nbsp(reason?.textContent ?? null)).toBe('Las estrellas despiertan a los 30 s: faltan 8 s.')
    const meter = screen.getByRole('meter', { name: t('ui.stars.listen') })
    expect(meter).toHaveAttribute('aria-valuenow', '22')
    expect(meter).toHaveAttribute('aria-valuemax', '30')
    fireEvent.click(star(5))
    fireEvent.keyDown(group(), { key: '4' })
    expect(onVote).not.toHaveBeenCalled()
  })

  it('RF-VOTE-10: al cumplir el umbral despiertan: barrido, `vote.unlocked` y «Ya puedes puntuar»', () => {
    const { rerender } = render(
      <Stars label={LABEL} value={null} listen={{ heardMs: 29_000, thresholdMs: 30_000 }} />,
    )
    expect(play).not.toHaveBeenCalledWith('vote.unlocked')
    rerender(<Stars label={LABEL} value={null} listen={{ heardMs: 30_000, thresholdMs: 30_000 }} />)
    expect(group()).not.toHaveAttribute('aria-disabled')
    expect(group()).toHaveAttribute('data-waking')
    expect(play).toHaveBeenCalledWith('vote.unlocked')
    expect(screen.getByText(t('ui.stars.awake'))).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(420))
    expect(group()).not.toHaveAttribute('data-waking')
  })

  it('ya despiertas al cargar no celebran nada', () => {
    render(<Stars label={LABEL} value={null} listen={{ heardMs: 40_000, thresholdMs: 30_000 }} />)
    expect(play).not.toHaveBeenCalledWith('vote.unlocked')
    expect(group()).not.toHaveAttribute('data-waking')
  })

  it('§3.8.4: votar es *hit-stop* de 70 ms, aplastado con su nota, chispas proporcionales y, confirmado, `vote.locked` y el texto', async () => {
    let resolve = () => {}
    const onVote = vi.fn(() => new Promise<void>((done) => (resolve = done)))
    render(<Stars label={LABEL} value={null} onVote={onVote} next />)
    fireEvent.click(star(4))
    expect(star(4)).toHaveAttribute('data-squash', 'hold')
    expect(play).not.toHaveBeenCalledWith('star.vote.4')
    expect(group()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(t('ui.stars.saving'))).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(70))
    expect(star(4)).toHaveAttribute('data-squash', 'squash')
    expect(play).toHaveBeenCalledWith('star.vote.4')
    expect(star(4).querySelectorAll('[data-tone]')).toHaveLength(16)
    await act(async () => resolve())
    expect(play).toHaveBeenCalledWith('vote.locked')
    expect(group()).not.toHaveAttribute('aria-busy')
    const saved = `4 de 5 · Muy bien. Voto guardado. ${t('ui.stars.savedNext')}`
    expect(
      screen.getAllByText((_, element) => nbsp(element?.textContent ?? '') === nbsp(saved)).length,
    ).toBeGreaterThan(0)
    act(() => vi.advanceTimersByTime(900))
    expect(star(4)).not.toHaveAttribute('data-squash')
  })

  it('RD-MOT-04: las chispas piden permiso al limitador de destellos; sin él, no hay', () => {
    const request = vi.spyOn(flash, 'request').mockReturnValue(null)
    render(<Stars label={LABEL} value={null} />)
    fireEvent.click(star(5))
    act(() => vi.advanceTimersByTime(70))
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ reason: 'vote' }))
    expect(star(5).querySelectorAll('[data-tone]')).toHaveLength(0)
  })

  it('el 5 vibra y hace temblar la tarjeta; en modo serio, no', () => {
    const onImpact = vi.fn()
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    const { unmount } = render(<Stars label={LABEL} value={null} onImpact={onImpact} />)
    fireEvent.click(star(5))
    act(() => vi.advanceTimersByTime(70))
    expect(onImpact).toHaveBeenCalledWith(5)
    expect(vibrate).toHaveBeenCalledWith(15)
    unmount()
    onImpact.mockClear()
    document.documentElement.setAttribute('data-serious', '')
    render(<Stars label={LABEL} value={null} onImpact={onImpact} />)
    fireEvent.click(star(5))
    act(() => vi.advanceTimersByTime(70))
    expect(onImpact).not.toHaveBeenCalled()
    expect(star(5).querySelectorAll('[data-tone]')).toHaveLength(0)
  })

  it('cambiar el voto rellena sin celebración: ni aplastado, ni nota, ni chispas', () => {
    const onVote = vi.fn()
    render(<Stars label={LABEL} value={2} onVote={onVote} />)
    fireEvent.click(star(5))
    act(() => vi.advanceTimersByTime(70))
    expect(onVote).toHaveBeenCalledWith(5)
    expect(star(5)).not.toHaveAttribute('data-squash')
    expect(play).not.toHaveBeenCalledWith('star.vote.5')
    expect(star(5).querySelectorAll('[data-tone]')).toHaveLength(0)
    expect(play).toHaveBeenCalledWith('vote.locked')
  })

  it('RD-MOT-03: con «reducir movimiento», el relleno cambia sin aplastado ni chispas', () => {
    media.set('(prefers-reduced-motion: reduce)', true)
    render(<Stars label={LABEL} value={null} />)
    fireEvent.click(star(3))
    act(() => vi.advanceTimersByTime(70))
    expect(star(3)).toHaveAttribute('aria-checked', 'true')
    expect(star(3)).not.toHaveAttribute('data-squash')
    expect(star(3).querySelectorAll('[data-tone]')).toHaveLength(0)
    expect(play).toHaveBeenCalledWith('star.vote.3')
  })

  it('si el servidor no lo guarda, vuelve el voto anterior y lo dice', async () => {
    let reject = () => {}
    const onVote = vi.fn(() => new Promise<void>((_, fail) => (reject = () => fail(new Error('500')))))
    render(<Stars label={LABEL} value={2} onVote={onVote} />)
    fireEvent.click(star(4))
    expect(star(4)).toHaveAttribute('aria-checked', 'true')
    await act(async () => reject())
    expect(star(2)).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByText(t('ui.stars.error')).length).toBeGreaterThan(0)
  })
})

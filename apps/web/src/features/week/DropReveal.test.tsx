import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { DropReveal, REVEAL_TIMELINE } from './DropReveal'
import { rememberDropSeen, seenLocally } from './dropSeen'

const WEEK = {
  number: 41,
  title: 'Lluvia en Gràcia',
  bpm: 92,
  musicalKey: 'Dm' as const,
  streamUrl: '/stream',
}

beforeEach(() => {
  vi.useFakeTimers()
  document.documentElement.removeAttribute('data-motion')
})
afterEach(() => {
  vi.useRealTimers()
  document.documentElement.removeAttribute('data-motion')
  window.localStorage.clear()
})

describe('DropReveal (§3.8.2)', () => {
  it('RF-DROP-11: anuncia la semana, estampa el título, fija BPM y tonalidad y termina sola a los 6 s', () => {
    const onDone = vi.fn()
    render(<DropReveal week={WEEK} onDone={onDone} />)
    const dialog = screen.getByRole('dialog', { name: t('reveal.label', { number: 41 }) })
    const details = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
    expect(details?.textContent).toBe('Lluvia en Gràcia · 92\u00a0BPM · Re menor')
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.announce))
    expect(screen.getByText(t('reveal.week', { number: 41 }))).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.slotsFixed - REVEAL_TIMELINE.announce))
    expect(screen.getByText('Lluvia en Gràcia')).toBeInTheDocument()
    expect(screen.getByText('92')).toBeInTheDocument()
    expect(screen.getByText('Re menor')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.total - REVEAL_TIMELINE.slotsFixed))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('RF-DROP-11: sigue hasta el final aunque la home vuelva a pedir la semana (otra URL firmada) a mitad', () => {
    const onDone = vi.fn()
    const { rerender } = render(<DropReveal week={WEEK} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.title))
    expect(screen.getByText('Lluvia en Gràcia')).toBeInTheDocument()
    rerender(<DropReveal week={{ ...WEEK, streamUrl: '/stream?firma=otra' }} onDone={onDone} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-stage', 'title')
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.slotsFixed - REVEAL_TIMELINE.title))
    expect(dialog).toHaveAttribute('data-stage', 'fixed')
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.total - REVEAL_TIMELINE.slotsFixed))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('modal: lo de detrás queda inerte, las flechas no le llegan y el foco vuelve al cerrar', () => {
    const root = document.createElement('div')
    root.id = 'root'
    const before = document.createElement('button')
    root.append(before)
    document.body.append(root)
    before.focus()
    const arrows = vi.fn()
    document.addEventListener('keydown', arrows)
    const { unmount } = render(<DropReveal week={WEEK} onDone={() => {}} />)
    expect(root).toHaveAttribute('inert')
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(arrows).not.toHaveBeenCalled()
    unmount()
    expect(root).not.toHaveAttribute('inert')
    expect(document.activeElement).toBe(before)
    document.removeEventListener('keydown', arrows)
    root.remove()
  })

  it('se salta con Esc (y una sola vez), con el foco en «Saltar» desde el principio', () => {
    const onDone = vi.fn()
    render(<DropReveal week={WEEK} onDone={onDone} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: new RegExp(t('reveal.skip')) }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Enter' })
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.total))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('RNF-A11Y-03: sin movimiento, los datos ya fijos desde el principio y un fundido más corto', () => {
    document.documentElement.setAttribute('data-motion', 'reduced')
    const onDone = vi.fn()
    render(<DropReveal week={WEEK} onDone={onDone} />)
    expect(screen.getByText('Lluvia en Gràcia')).toBeInTheDocument()
    expect(screen.getByText('92')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-reduced')
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.reducedTotal))
    expect(onDone).toHaveBeenCalledOnce()
  })
})

describe('dropSeen', () => {
  it('RF-DROP-11: sin sesión, queda vista en este navegador por semana', async () => {
    expect(seenLocally('2026-w41')).toBe(false)
    await rememberDropSeen('2026-w41', false)
    expect(seenLocally('2026-w41')).toBe(true)
    expect(seenLocally('2026-w42')).toBe(false)
  })
})

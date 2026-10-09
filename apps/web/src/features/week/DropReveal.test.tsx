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
    expect(screen.getByRole('dialog', { name: t('reveal.label', { number: 41 }) })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.announce))
    expect(screen.getByRole('status')).toHaveTextContent(t('reveal.week', { number: 41 }))
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.slotsFixed - REVEAL_TIMELINE.announce))
    expect(screen.getByText('Lluvia en Gràcia')).toBeInTheDocument()
    expect(screen.getByText('92')).toBeInTheDocument()
    expect(screen.getByText('Re menor')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(REVEAL_TIMELINE.total - REVEAL_TIMELINE.slotsFixed))
    expect(onDone).toHaveBeenCalledOnce()
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

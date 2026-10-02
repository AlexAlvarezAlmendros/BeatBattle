import { duration } from '@beatbattle/shared/tokens'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { type MatchMediaController, mockMatchMedia } from '../hooks/mockMatchMedia'
import { REDUCED_MOTION_QUERY } from '../hooks/useReducedMotion'
import { XpBar } from './XpBar'

let media: MatchMediaController | undefined
afterEach(() => {
  vi.useRealTimers()
  media?.restore()
  media = undefined
})

const fillRatio = (bar: HTMLElement) =>
  Number((bar.firstElementChild as HTMLElement).style.getPropertyValue('--xp-ratio'))
const shine = (bar: HTMLElement) => bar.querySelector('[class*="shine"]')
const flash = (bar: HTMLElement) => bar.querySelector('[class*="flash"]')

describe('XpBar', () => {
  it('es una progressbar con sus valores y un texto que se entiende', () => {
    render(<XpBar value={120} max={300} level={4} />)
    const bar = screen.getByRole('progressbar', { name: t('ui.xpBar.label') })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '300')
    expect(bar).toHaveAttribute('aria-valuenow', '120')
    expect(bar).toHaveAttribute('aria-valuetext', t('ui.xpBar.valueText', { value: 120, max: 300, next: 5 }))
    expect(fillRatio(bar)).toBeCloseTo(0.4)
    expect(screen.getByText(t('ui.xpBar.level', { level: 4 }))).toBeInTheDocument()
  })

  it('al subir, un brillo recorre el relleno', () => {
    media = mockMatchMedia()
    const { rerender } = render(<XpBar value={120} max={300} level={4} />)
    const bar = screen.getByRole('progressbar')
    expect(shine(bar)).toBeNull()
    rerender(<XpBar value={150} max={300} level={4} />)
    expect(shine(bar)).not.toBeNull()
    expect(fillRatio(bar)).toBeCloseTo(0.5)
  })

  it('al subir de nivel se llena, destella y vuelve a crecer desde cero', () => {
    media = mockMatchMedia()
    vi.useFakeTimers()
    const { rerender } = render(<XpBar value={280} max={300} level={4} />)
    const bar = screen.getByRole('progressbar')
    rerender(<XpBar value={40} max={400} level={5} />)
    expect(fillRatio(bar)).toBe(1)
    expect(flash(bar)).toBeNull()
    act(() => vi.advanceTimersByTime(duration.reward))
    expect(flash(bar)).not.toBeNull()
    expect(fillRatio(bar)).toBe(0)
    act(() => vi.advanceTimersToNextFrame())
    expect(fillRatio(bar)).toBeCloseTo(0.1)
  })

  it('RNF-A11Y-03 / RD-MOT-03: sin movimiento, solo el relleno (sin brillo ni destello)', () => {
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    const { rerender } = render(<XpBar value={120} max={300} level={4} />)
    const bar = screen.getByRole('progressbar')
    rerender(<XpBar value={150} max={300} level={4} />)
    expect(shine(bar)).toBeNull()
    rerender(<XpBar value={10} max={400} level={5} />)
    expect(flash(bar)).toBeNull()
    expect(fillRatio(bar)).toBeCloseTo(0.025)
  })

  it('RD-VIS-03: estados forzados de brillo y de subida de nivel', () => {
    render(
      <>
        <XpBar value={100} max={300} level={3} state="gain" label="A" />
        <XpBar value={100} max={300} level={3} state="levelUp" label="B" />
      </>,
    )
    expect(shine(screen.getByRole('progressbar', { name: 'A' }))).not.toBeNull()
    const levelUp = screen.getByRole('progressbar', { name: 'B' })
    expect(flash(levelUp)).not.toBeNull()
    expect(fillRatio(levelUp)).toBe(1)
  })
})

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { barsForWidth, playedBars, resamplePeaks, type WaveformPeak } from './peaks'
import { Waveform } from './Waveform'
import waveCss from './Waveform.module.css?raw'

const PEAKS: WaveformPeak[] = [
  [-0.2, 0.3],
  [-0.9, 0.8],
  [-0.1, 0.1],
  [-0.5, 0.6],
]

afterEach(() => {
  document.documentElement.removeAttribute('data-motion')
})

describe('Waveform: picos', () => {
  it('barras de 2 px con 1 px de hueco: n barras ocupan 3n − 1 px', () => {
    expect(barsForWidth(2)).toBe(1)
    expect(barsForWidth(5)).toBe(2)
    expect(barsForWidth(299)).toBe(100)
    expect(barsForWidth(0)).toBe(1)
  })

  it('al reducir, cada barra guarda el mínimo y el máximo de su tramo', () => {
    expect(resamplePeaks(PEAKS, 2)).toEqual([
      [-0.9, 0.8],
      [-0.5, 0.6],
    ])
  })

  it('al ampliar repite el pico más cercano; recorta fuera de [-1, 1]', () => {
    expect(resamplePeaks([[-2, 3]], 3)).toEqual([
      [-1, 1],
      [-1, 1],
      [-1, 1],
    ])
    expect(resamplePeaks([], 10)).toEqual([])
  })

  it('barras reproducidas según el progreso', () => {
    expect(playedBars(100, 0.355)).toBe(36)
    expect(playedBars(100, -1)).toBe(0)
    expect(playedBars(100, 2)).toBe(100)
    expect(playedBars(100, Number.NaN)).toBe(0)
  })
})

describe('Waveform', () => {
  it('es una imagen con nombre accesible que dice cuánto se ha escuchado', () => {
    render(<Waveform peaks={PEAKS} progress={0.5} />)
    expect(screen.getByRole('img', { name: t('ui.waveform.progress', { percent: 50 }) })).toBeInTheDocument()
  })

  it('sin progreso se llama «Forma de onda»; decorativa queda oculta', () => {
    const { container } = render(
      <>
        <Waveform peaks={PEAKS} />
        <Waveform peaks={PEAKS} decorative />
      </>,
    )
    expect(screen.getAllByRole('img', { name: t('ui.waveform.label') })).toHaveLength(1)
    expect(container.querySelectorAll('[aria-hidden="true"][data-progress]')).toHaveLength(1)
  })

  it('pinta en rojo las barras reproducidas y la cabeza de lectura en su punto', () => {
    const { container } = render(<Waveform peaks={PEAKS} progress={0.5} />)
    const rects = [...container.querySelectorAll('rect')]
    expect(rects).toHaveLength(4)
    const played = rects.filter((rect) => getComputedStyle(rect).fill === 'var(--bb-red)')
    expect(played).toHaveLength(2)
    expect(container.querySelector('[data-playhead]')).not.toBeNull()
  })

  it('sin cabeza de lectura al principio, al final o si no se pide', () => {
    const { container, rerender } = render(<Waveform peaks={PEAKS} progress={0} />)
    expect(container.querySelector('[data-playhead]')).toBeNull()
    rerender(<Waveform peaks={PEAKS} progress={1} />)
    expect(container.querySelector('[data-playhead]')).toBeNull()
    rerender(<Waveform peaks={PEAKS} progress={0.5} playhead={false} />)
    expect(container.querySelector('[data-playhead]')).toBeNull()
  })

  it('RNF-A11Y-03 / RD-MOT-03: crece desde el centro al montar, y sin movimiento aparece entera', () => {
    const { container } = render(<Waveform peaks={PEAKS} />)
    const svg = container.querySelector('svg')!
    const animation = () => getComputedStyle(svg).getPropertyValue('animation')
    expect(animation()).toMatch(/grow/)
    expect(animation()).toMatch(/sweep/)
    // Al terminar no queda «en efecto» (con `both` se recalculaba en cada fotograma).
    expect(animation()).not.toMatch(/\bboth\b/)
    // El barrido dura 2 ms por barra (`--bb-stagger-wave`), como el escalonado del Anexo E.
    expect(svg.style.getPropertyValue('--wave-bars')).toBe(String(container.querySelectorAll('rect').length))
    document.documentElement.setAttribute('data-motion', 'reduced')
    expect(animation()).toBe('none')
  })

  it('INP (§4.17): una sola animación por onda, en el <svg>; ninguna por barra', () => {
    const { container } = render(<Waveform peaks={PEAKS} progress={0.5} />)
    const rects = [...container.querySelectorAll('rect')]
    expect(rects.length).toBeGreaterThan(1)
    for (const rect of rects)
      expect(getComputedStyle(rect).getPropertyValue('animation-name')).toMatch(/^(none)?$/)
  })

  it('Anexo E: el barrido va de inset(0 100% 0 0) a inset(0) (sin el final explícito, no se interpola)', () => {
    const sweep = /@keyframes sweep \{([\s\S]*?)\n\}/.exec(waveCss)?.[1] ?? ''
    expect(sweep).toMatch(/from \{\s*clip-path: inset\(0 100% 0 0\);/)
    expect(sweep).toMatch(/to \{\s*clip-path: inset\(0\);/)
  })

  it('sin animateIn, ni el <svg> se anima', () => {
    const { container } = render(<Waveform peaks={PEAKS} animateIn={false} />)
    expect(getComputedStyle(container.querySelector('svg')!).getPropertyValue('animation-name')).toMatch(
      /^(none)?$/,
    )
  })
})

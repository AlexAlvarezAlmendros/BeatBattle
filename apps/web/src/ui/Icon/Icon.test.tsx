import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ICON_NAMES, Icon, PAUSE_PATH, PLAY_PATH } from './Icon'

afterEach(() => {
  document.documentElement.removeAttribute('data-motion')
})

describe('Icon', () => {
  it('es decorativo por defecto: aria-hidden y fuera del árbol de accesibilidad', () => {
    const { container } = render(<Icon name="play" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('con label es una imagen con nombre accesible', () => {
    render(<Icon name="alert" label="Error" />)
    expect(screen.getByRole('img', { name: 'Error' })).toHaveAttribute('data-icon', 'alert')
  })

  it('RD-MOT-03: play y pausa comparten la estructura del trazado y se transforman uno en otro', () => {
    const commands = (d: string) => d.replace(/[^A-Za-z]/g, '')
    expect(commands(PLAY_PATH)).toBe(commands(PAUSE_PATH))
    const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)?.length
    expect(numbers(PLAY_PATH)).toBe(numbers(PAUSE_PATH))
    // React reutiliza el mismo <path> al pasar de play a pausa: el navegador interpola `d`.
    const { container, rerender } = render(<Icon name="play" />)
    const path = container.querySelector('path')!
    expect(getComputedStyle(path).getPropertyValue('transition')).toMatch(/^d /)
    rerender(<Icon name="pause" />)
    expect(container.querySelector('path')).toBe(path)
    expect(path).toHaveAttribute('d', PAUSE_PATH)
  })

  it('RNF-A11Y-03: sin movimiento, el play cambia a pausa sin transformarse', () => {
    document.documentElement.setAttribute('data-motion', 'reduced')
    const { container } = render(<Icon name="play" />)
    expect(getComputedStyle(container.querySelector('path')!).getPropertyValue('transition')).toBe('none')
  })

  it('todos los iconos dibujan algo', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg')!.childElementCount, name).toBeGreaterThan(0)
      unmount()
    }
  })
})

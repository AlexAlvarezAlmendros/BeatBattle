import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ICON_NAMES, Icon } from './Icon'

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

  it('todos los iconos dibujan algo', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg')!.childElementCount, name).toBeGreaterThan(0)
      unmount()
    }
  })
})

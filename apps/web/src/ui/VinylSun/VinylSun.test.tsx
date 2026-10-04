import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VinylSun } from './VinylSun'

describe('VinylSun (§3.5 capa 1, §3.8.3; 0.24)', () => {
  it('es decorativo: un lienzo dentro de una pieza oculta a los lectores', () => {
    const { container } = render(<VinylSun label="S41" sub="92 BPM" bpm={92} />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('canvas[data-vinyl]')).not.toBeNull()
  })
})

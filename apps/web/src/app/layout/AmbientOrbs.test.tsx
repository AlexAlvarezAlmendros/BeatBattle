import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AmbientOrbs } from './AmbientOrbs'

describe('AmbientOrbs: fondo de orbes rojos del sello', () => {
  it('pinta los tres orbes, decorativos y sin nada enfocable', () => {
    const { container } = render(<AmbientOrbs />)
    const root = container.querySelector('.ambient-orbs')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root?.querySelectorAll('.ambient-orbs__orb')).toHaveLength(3)
    for (const n of [1, 2, 3]) expect(root?.querySelector(`.ambient-orbs__orb--${n}`)).toBeInTheDocument()
    expect(root?.querySelector('a, button, [tabindex]')).toBeNull()
  })
})

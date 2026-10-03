import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stamp } from './Stamp'

describe('Stamp (§3.3 «Sello de goma», 0.25)', () => {
  it('es texto con su tono y el giro acotado a ±9° (fracción de --bb-tilt-stamp)', () => {
    render(
      <>
        <Stamp tone="red" turn={3}>
          Sellada
        </Stamp>
        <Stamp>Sin votar</Stamp>
      </>,
    )
    const sealed = screen.getByText('Sellada')
    expect(sealed).toHaveAttribute('data-stamp', 'red')
    expect(sealed.style.getPropertyValue('--stamp-turn')).toBe('1')
    expect(screen.getByText('Sin votar').style.getPropertyValue('--stamp-turn')).toBe('-0.4')
  })
})

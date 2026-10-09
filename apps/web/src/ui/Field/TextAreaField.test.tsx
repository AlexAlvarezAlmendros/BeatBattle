import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TextAreaField } from './TextAreaField'

function Bio() {
  const [value, setValue] = useState('')
  return (
    <TextAreaField
      label="Bio"
      hint="Una línea."
      maxLength={20}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  )
}

describe('TextAreaField', () => {
  it('etiqueta, ayuda y contador unidos al campo; el tope corta la entrada', async () => {
    render(<Bio />)
    const field = screen.getByLabelText('Bio')
    expect(field.tagName).toBe('TEXTAREA')
    expect(field).toHaveAccessibleDescription('Una línea. 0 / 20')
    await userEvent.type(field, 'x'.repeat(25))
    expect(field).toHaveValue('x'.repeat(20))
    const counter = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '20\u00a0/\u00a020')
    expect(counter).toHaveAttribute('aria-live', 'polite')
  })
})

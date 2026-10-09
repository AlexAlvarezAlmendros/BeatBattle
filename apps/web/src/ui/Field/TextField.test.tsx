import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'

describe('TextField (§3.8.14)', () => {
  it('la etiqueta nombra el campo y la ayuda lo describe', () => {
    render(<TextField label="Email" hint="Te mandaremos un enlace" />)
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveAccessibleDescription('Te mandaremos un enlace')
  })

  it('con error: aria-invalid y el motivo en texto, antes que la ayuda', () => {
    render(<TextField label="Nombre de productor" hint="3–20 caracteres" error="Ese nombre ya está cogido" />)
    const input = screen.getByRole('textbox', { name: 'Nombre de productor' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Ese nombre ya está cogido 3–20 caracteres')
  })

  it('la contraseña se puede ver y ocultar (el botón dice qué hará)', async () => {
    render(<TextField label="Contraseña" type="password" revealable />)
    const input = screen.getByLabelText('Contraseña')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Ver Contraseña' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar Contraseña' })).toHaveAttribute('aria-pressed', 'true')
  })
})

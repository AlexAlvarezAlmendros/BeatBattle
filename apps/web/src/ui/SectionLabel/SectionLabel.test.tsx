import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('es un encabezado h2 por defecto, con el texto tal cual (las mayúsculas las pone el CSS)', () => {
    render(<SectionLabel>Información</SectionLabel>)
    expect(screen.getByRole('heading', { level: 2, name: 'Información' })).toBeInTheDocument()
  })

  it('admite otro nivel o un párrafo', () => {
    render(
      <>
        <SectionLabel as="h3">Licencias</SectionLabel>
        <SectionLabel as="p">Etiquetas</SectionLabel>
      </>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Licencias' })).toBeInTheDocument()
    expect(screen.getByText('Etiquetas').tagName).toBe('P')
  })
})

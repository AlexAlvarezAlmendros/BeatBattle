import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDisplacementMap } from './displacementMap'

const capability = vi.hoisted(() => ({ value: false }))

vi.mock('../glass', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../glass')>()),
  useGlassCapability: () => capability.value,
}))

const { GlassSurface } = await import('./GlassSurface')

describe('GlassSurface (portado del sello)', () => {
  afterEach(() => {
    capability.value = false
  })

  it('sin capacidad pinta la etiqueta tal cual: sin filtro, sin data-glass y con su clase', () => {
    render(
      <GlassSurface as="header" className="isla" data-testid="pieza">
        hola
      </GlassSurface>,
    )
    const node = screen.getByTestId('pieza')
    expect(node.tagName).toBe('HEADER')
    expect(node).toHaveClass('isla')
    expect(node).not.toHaveClass('bb-glass')
    expect(node).not.toHaveAttribute('data-glass')
    expect(node.querySelector('svg')).toBeNull()
    expect(node).toHaveTextContent('hola')
  })

  it('con capacidad: data-glass="on", filtro SVG de desplazamiento propio y variables del cristal', () => {
    capability.value = true
    render(
      <GlassSurface
        as="section"
        className="tarjeta"
        backdropBlur="var(--bb-glass-blur-card)"
        data-testid="pieza"
      >
        <p>contenido</p>
      </GlassSurface>,
    )
    const node = screen.getByTestId('pieza')
    expect(node).toHaveAttribute('data-glass', 'on')
    expect(node).toHaveClass('bb-glass', 'tarjeta')
    const filter = node.querySelector('filter')
    expect(filter).not.toBeNull()
    expect(node.style.getPropertyValue('--bb-glass-filter')).toBe(`url(#${filter?.id})`)
    expect(node.style.getPropertyValue('--bb-glass-backdrop-blur')).toBe('var(--bb-glass-blur-card)')
    expect(node.querySelector('feDisplacementMap')).toHaveAttribute('scale', '-170')
    expect(node.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    // Los hijos siguen siendo hijos directos (sin envoltorio).
    expect(node.querySelector(':scope > p')).toHaveTextContent('contenido')
    // El mapa se genera al montar, con el tamaño de la pieza.
    expect(node.querySelector('feImage')?.getAttribute('href')).toMatch(/^data:image\/svg\+xml,/)
  })

  it('con capacidad y aberración cromática, un desplazamiento por canal', () => {
    capability.value = true
    const { container } = render(<GlassSurface chromaticAberration>x</GlassSurface>)
    expect(container.querySelectorAll('feDisplacementMap')).toHaveLength(3)
  })

  it('cada pieza tiene su propio filtro (ids únicos)', () => {
    capability.value = true
    const { container } = render(
      <>
        <GlassSurface>a</GlassSurface>
        <GlassSurface>b</GlassSurface>
      </>,
    )
    const ids = [...container.querySelectorAll('filter')].map((filter) => filter.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('pasa la ref a la etiqueta, con y sin cristal', () => {
    for (const value of [false, true]) {
      capability.value = value
      const ref = createRef<HTMLElement>()
      const { unmount } = render(
        <GlassSurface as="nav" ref={ref}>
          x
        </GlassSurface>,
      )
      expect(ref.current?.tagName).toBe('NAV')
      unmount()
    }
  })
  it('si la capacidad cambia en caliente, los hijos no se vuelven a montar: conservan el estado y el foco', async () => {
    const user = userEvent.setup()
    // Un elemento nuevo en cada render: con el mismo, React no volvería a pintar la pieza.
    const ui = () => (
      <GlassSurface as="section" data-testid="pieza">
        <input aria-label="campo" />
      </GlassSurface>
    )
    const { rerender } = render(ui())
    const input = screen.getByRole('textbox', { name: 'campo' })
    await user.type(input, 'hola')

    // Con cristal, sin él («reducir movimiento» o «reducir transparencia» en caliente) y otra vez con él.
    for (const value of [true, false, true]) {
      capability.value = value
      rerender(ui())
      expect(screen.getByTestId('pieza').hasAttribute('data-glass')).toBe(value)
      expect(screen.getByRole('textbox', { name: 'campo' })).toBe(input)
      expect(input).toHaveFocus()
      expect(input).toHaveValue('hola')
    }
  })
})

describe('buildDisplacementMap', () => {
  it('genera un SVG con los dos degradados, el centro neutro y el radio de la pieza', () => {
    const uri = buildDisplacementMap({
      width: 200,
      height: 60,
      radius: 20,
      borderWidth: 0.07,
      brightness: 50,
      opacity: 0.91,
      blur: 11,
      mixBlendMode: 'difference',
      redGradientId: 'r',
      blueGradientId: 'b',
    })
    const svg = decodeURIComponent(uri.replace('data:image/svg+xml,', ''))
    expect(svg).toContain('viewBox="0 0 200 60"')
    expect(svg).toContain('fill="url(#r)"')
    expect(svg).toContain('fill="url(#b)"')
    expect(svg).toContain('rx="20"')
    expect(svg).toContain('mix-blend-mode: difference')
    // Borde de refracción: 7 % del lado menor, a cada lado.
    expect(svg).toContain('x="2.1" y="2.1" width="195.8" height="55.8"')
  })
})

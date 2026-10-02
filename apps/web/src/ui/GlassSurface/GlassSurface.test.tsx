import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildDisplacementMap,
  clearDisplacementMapCache,
  displacementMapFor,
  MAP_CACHE_SIZE,
} from './displacementMap'

const capability = vi.hoisted(() => ({ value: false }))

vi.mock('../glass', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../glass')>()),
  useGlassCapability: () => capability.value,
}))

const { GlassSurface, MAP_RESIZE_DEBOUNCE_MS } = await import('./GlassSurface')

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

const MAP_OPTIONS = {
  width: 200,
  height: 60,
  radius: 20,
  borderWidth: 0.07,
  brightness: 50,
  opacity: 0.91,
  blur: 11,
  mixBlendMode: 'difference',
}

describe('buildDisplacementMap', () => {
  it('genera un SVG con los dos degradados, el centro neutro y el radio de la pieza', () => {
    const uri = buildDisplacementMap(MAP_OPTIONS)
    const svg = decodeURIComponent(uri.replace('data:image/svg+xml,', ''))
    expect(svg).toContain('viewBox="0 0 200 60"')
    expect(svg).toContain('fill="url(#map-x)"')
    expect(svg).toContain('fill="url(#map-y)"')
    expect(svg).toContain('rx="20"')
    expect(svg).toContain('mix-blend-mode: difference')
    // Borde de refracción: 7 % del lado menor, a cada lado.
    expect(svg).toContain('x="2.1" y="2.1" width="195.8" height="55.8"')
  })
})

describe('displacementMapFor: caché de mapas (memoria del renderer)', () => {
  afterEach(() => clearDisplacementMapCache())

  it('el mismo tamaño redondeado devuelve la misma cadena; otro tamaño, otra', () => {
    const a = displacementMapFor(MAP_OPTIONS)
    expect(displacementMapFor({ ...MAP_OPTIONS, width: 202.4, height: 61 })).toBe(a)
    expect(displacementMapFor({ ...MAP_OPTIONS, width: 260 })).not.toBe(a)
    // Redondeado a la rejilla de 8 px.
    expect(decodeURIComponent(a)).toContain('viewBox="0 0 200 64"')
  })

  it('guarda como mucho MAP_CACHE_SIZE mapas y suelta primero el más antiguo', () => {
    const first = displacementMapFor(MAP_OPTIONS)
    for (let i = 1; i <= MAP_CACHE_SIZE; i++) displacementMapFor({ ...MAP_OPTIONS, width: 200 + i * 8 })
    // El primero ya salió: se vuelve a generar (misma cadena, pero otra entrada).
    expect(displacementMapFor(MAP_OPTIONS)).toBe(first)
  })
})

describe('GlassSurface: mapa al cambiar de tamaño', () => {
  let resize: (() => void) | undefined
  let size = { width: 300, height: 100 }

  class FakeResizeObserver {
    constructor(callback: () => void) {
      resize = callback
    }
    observe() {}
    disconnect() {
      resize = undefined
    }
  }

  afterEach(() => {
    capability.value = false
    resize = undefined
    size = { width: 300, height: 100 }
    vi.unstubAllGlobals()
    vi.useRealTimers()
    clearDisplacementMapCache()
  })

  function renderSized(testId: string) {
    const view = render(<GlassSurface data-testid={testId}>cristal</GlassSurface>)
    return view
  }

  it('redimensionar sin parar escribe el mapa una vez al final, y no si el tamaño redondeado no cambia', () => {
    capability.value = true
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const rect = () =>
      ({ ...size, left: 0, top: 0, right: size.width, bottom: size.height, x: 0, y: 0 }) as DOMRect
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = rect
    const writes: string[] = []
    const setAttribute = SVGElement.prototype.setAttribute
    SVGElement.prototype.setAttribute = function (name: string, value: string) {
      if (name === 'href' && this.tagName.toLowerCase() === 'feimage') writes.push(value)
      return setAttribute.call(this, name, value)
    }
    try {
      const { unmount } = renderSized('pieza')
      expect(writes).toHaveLength(1)

      // Veinte avisos seguidos mientras se arrastra la ventana: ninguno escribe hasta que para.
      for (let i = 0; i < 20; i++) {
        size = { width: 300 + i * 10, height: 100 }
        act(() => resize?.())
        act(() => vi.advanceTimersByTime(MAP_RESIZE_DEBOUNCE_MS / 3))
      }
      expect(writes).toHaveLength(1)
      act(() => vi.advanceTimersByTime(MAP_RESIZE_DEBOUNCE_MS))
      expect(writes).toHaveLength(2)

      // Un cambio dentro de la misma celda de 8 px: misma cadena, no se vuelve a escribir.
      size = { width: size.width + 1, height: 101 }
      act(() => resize?.())
      act(() => vi.advanceTimersByTime(MAP_RESIZE_DEBOUNCE_MS))
      expect(writes).toHaveLength(2)
      unmount()
    } finally {
      Element.prototype.getBoundingClientRect = original
      SVGElement.prototype.setAttribute = setAttribute
    }
  })

  it('dos piezas del mismo tamaño comparten el mismo mapa', () => {
    capability.value = true
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = () =>
      ({ width: 320, height: 120, left: 0, top: 0, right: 320, bottom: 120, x: 0, y: 0 }) as DOMRect
    try {
      render(
        <>
          <GlassSurface data-testid="a">a</GlassSurface>
          <GlassSurface data-testid="b">b</GlassSurface>
        </>,
      )
      const href = (id: string) => screen.getByTestId(id).querySelector('feImage')?.getAttribute('href')
      expect(href('a')).toBeTruthy()
      expect(href('a')).toBe(href('b'))
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })
})

import { loop } from '@beatbattle/shared/tokens'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeroDivider, HeroSection, HeroTitle, MarqueeBand, SideLabel } from './index'
import { heroRevealVariants } from './reveal'

const ITEMS = ['Uno', 'Dos', 'Tres'] as const

describe('HeroTitle: titular del sello en dos líneas', () => {
  it('es un <h1> con la línea maciza y la de contorno, y se lee como dos palabras', () => {
    render(<HeroTitle id="t" solid="Beat" outline="Battle" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Beat Battle' })
    expect(heading).toHaveAttribute('id', 't')
    const lines = heading.querySelectorAll('.hero-title__line')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent('Beat')
    expect(lines[1]).toHaveTextContent('Battle')
    expect(lines[1]).toHaveClass('hero-title__line--outline')
  })

  it('el filete es decorativo', () => {
    const { container } = render(<HeroDivider />)
    expect(container.querySelector('.hero-divider')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('SideLabel: rótulos verticales', () => {
  it('pinta su texto a la izquierda o a la derecha', () => {
    render(
      <>
        <SideLabel side="left">Próximo drop</SideLabel>
        <SideLabel side="right">Temporada —</SideLabel>
      </>,
    )
    expect(screen.getByText('Próximo drop').closest('.side-label')).toHaveClass('side-label--left')
    expect(screen.getByText('Temporada —').closest('.side-label')).toHaveClass('side-label--right')
  })
})

describe('HeroSection: hero a sangre bajo la isla', () => {
  it('se nombra con su titular, sube bajo la isla (bleed-top) y lleva rejilla y viñeta decorativas', () => {
    const { container } = render(
      <HeroSection labelledBy="titulo" overlay={<SideLabel side="left">Rótulo</SideLabel>}>
        <HeroTitle id="titulo" solid="Beat" outline="Battle" />
      </HeroSection>,
    )
    const section = screen.getByRole('region', { name: 'Beat Battle' })
    expect(section).toHaveClass('hero', 'bleed-top')
    const backdrop = container.querySelector('.hero__backdrop')
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop?.querySelector('.hero-grid')).toBeInTheDocument()
    expect(backdrop?.querySelector('.hero-vignette')).toBeInTheDocument()
    // El rótulo va fuera del contenido centrado, posicionado sobre la sección.
    expect(screen.getByText('Rótulo').closest('.hero__content')).toBeNull()
  })

  it('RNF-A11Y-03: con «reducir movimiento» la entrada es solo un fundido de ≤ 200 ms, sin desplazarse', () => {
    const reduced = heroRevealVariants(true)
    for (const variants of [reduced.item, reduced.fade, reduced.grow]) {
      const hidden = variants.hidden as Record<string, unknown>
      const shown = variants.shown as Record<string, unknown> & { transition: { duration: number } }
      expect(hidden.opacity).toBe(0)
      expect(shown.opacity).toBe(1)
      expect(hidden.y ?? 0).toBe(0)
      expect(hidden.scaleX ?? 1).toBe(1)
      expect(shown.transition.duration).toBeLessThanOrEqual(0.2)
    }
    expect(reduced.container.shown).toEqual({})
    const normal = heroRevealVariants(false)
    expect((normal.item.hidden as { y: number }).y).toBeGreaterThan(0)
  })
})

/** Palabras de la banda en el orden en que se ven (la rotación sin movimiento es `order` de flex). */
const visibleWords = () =>
  within(screen.getByRole('marquee'))
    .getAllByRole('listitem')
    .map((li) => ({ word: li.textContent, order: Number(li.style.order || 0) }))
    .sort((a, b) => a.order - b.order)
    .map(({ word }) => word)
const firstWord = () => visibleWords()[0]
const pauseButton = () => screen.getByRole('button', { name: 'Pausar' })

describe('MarqueeBand: banda del sello', () => {
  afterEach(() => {
    delete document.documentElement.dataset.motion
    vi.useRealTimers()
  })

  it('con movimiento: bucle de tres copias; el lector de pantalla solo lee la primera', () => {
    render(<MarqueeBand items={ITEMS} label="Teletipo" pauseLabel="Pausar" />)
    const band = screen.getByRole('marquee', { name: 'Teletipo' })
    expect(band).not.toHaveAttribute('data-static')
    const groups = band.querySelectorAll('.marquee__group')
    expect(groups).toHaveLength(3)
    expect(groups[0]).not.toHaveAttribute('aria-hidden')
    expect(groups[1]).toHaveAttribute('aria-hidden', 'true')
    expect(groups[2]).toHaveAttribute('aria-hidden', 'true')
    expect(
      within(band)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([...ITEMS])
    // Cada palabra lleva su punto rojo, decorativo.
    expect(band.querySelectorAll('.marquee__dot[aria-hidden="true"]')).toHaveLength(ITEMS.length * 3)
  })

  it('RNF-A11Y-01 (WCAG 2.2.2): con movimiento, el botón de pausa para y reanuda la banda con clic y con teclado', async () => {
    const user = userEvent.setup()
    render(<MarqueeBand items={ITEMS} label="Teletipo" pauseLabel="Pausar" />)
    const band = screen.getByRole('marquee')
    expect(pauseButton()).toHaveAttribute('aria-pressed', 'false')
    expect(band).not.toHaveAttribute('data-paused')

    await user.click(pauseButton())
    expect(pauseButton()).toHaveAttribute('aria-pressed', 'true')
    expect(band).toHaveAttribute('data-paused', 'true')
    // La pausa del botón es del usuario: no la deshace sacar el ratón.
    await user.unhover(band)
    expect(band).toHaveAttribute('data-paused', 'true')

    // Con teclado: Tab llega al botón; Intro y Espacio lo conmutan. El nombre no cambia.
    await user.click(document.body)
    await user.tab()
    expect(pauseButton()).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(pauseButton()).toHaveAttribute('aria-pressed', 'false')
    expect(band).not.toHaveAttribute('data-paused')
    await user.keyboard(' ')
    expect(pauseButton()).toHaveAttribute('aria-pressed', 'true')
    expect(band).toHaveAttribute('data-paused', 'true')
  })

  it('RD-MOT-03: con «reducir movimiento», lista estática (sin copias) que rota cada 5 s', () => {
    vi.useFakeTimers()
    document.documentElement.dataset.motion = 'reduced'
    render(<MarqueeBand items={ITEMS} label="Teletipo" pauseLabel="Pausar" />)
    const band = screen.getByRole('marquee', { name: 'Teletipo' })
    expect(band).toHaveAttribute('data-static', 'true')
    expect(band.querySelectorAll('.marquee__group')).toHaveLength(1)
    expect(band.querySelector('[aria-hidden="true"].marquee__group')).toBeNull()

    expect(firstWord()).toBe('Uno')
    act(() => vi.advanceTimersByTime(loop.tickerStep - 1))
    expect(firstWord()).toBe('Uno')
    act(() => vi.advanceTimersByTime(1))
    expect(visibleWords()).toEqual(['Dos', 'Tres', 'Uno'])
    act(() => vi.advanceTimersByTime(loop.tickerStep * 2))
    expect(firstWord()).toBe('Uno')
    expect(within(screen.getByRole('marquee')).getAllByRole('listitem')).toHaveLength(ITEMS.length)
  })

  it('RNF-A11Y-01: sin movimiento, la rotación es solo visual: la lista no se vuelve a montar y el DOM no cambia de orden', () => {
    vi.useFakeTimers()
    document.documentElement.dataset.motion = 'reduced'
    render(<MarqueeBand items={ITEMS} label="Teletipo" pauseLabel="Pausar" />)
    const list = within(screen.getByRole('marquee')).getByRole('list')
    const items = within(list).getAllByRole('listitem')
    act(() => vi.advanceTimersByTime(loop.tickerStep))
    expect(firstWord()).toBe('Dos')
    expect(within(screen.getByRole('marquee')).getByRole('list')).toBe(list)
    const after = within(list).getAllByRole('listitem')
    expect(after).toEqual(items)
    expect(after.every((li, index) => li === items[index])).toBe(true)
    expect(after.map((li) => li.textContent)).toEqual([...ITEMS])
  })

  it('RD-MOT-03: sin movimiento, la rotación se detiene con el ratón encima', () => {
    vi.useFakeTimers()
    document.documentElement.dataset.motion = 'reduced'
    render(<MarqueeBand items={ITEMS} label="Teletipo" pauseLabel="Pausar" />)
    const band = screen.getByRole('marquee')
    fireEvent.mouseEnter(band)
    act(() => vi.advanceTimersByTime(loop.tickerStep * 3))
    expect(firstWord()).toBe('Uno')
    fireEvent.mouseLeave(band)
    act(() => vi.advanceTimersByTime(loop.tickerStep))
    expect(firstWord()).toBe('Dos')
  })

  it('RNF-A11Y-01 (WCAG 2.2.2): sin movimiento, el botón de pausa detiene la rotación, con clic y con teclado', async () => {
    // `shouldAdvanceTime`: Testing Library espera un `setTimeout(0)` tras cada evento de user-event y
    // solo adelanta los temporizadores falsos de Jest; con los de Vitest, sin esto, se queda esperando.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    document.documentElement.dataset.motion = 'reduced'
    render(<MarqueeBand items={ITEMS} label="Teletipo" pauseLabel="Pausar" />)

    await user.click(pauseButton())
    await user.unhover(screen.getByRole('marquee'))
    expect(screen.getByRole('marquee')).toHaveAttribute('data-paused', 'true')
    act(() => vi.advanceTimersByTime(loop.tickerStep * 3))
    expect(firstWord()).toBe('Uno')

    // Reanudar con teclado.
    pauseButton().focus()
    await user.keyboard('{Enter}')
    expect(pauseButton()).toHaveAttribute('aria-pressed', 'false')
    act(() => vi.advanceTimersByTime(loop.tickerStep))
    expect(firstWord()).toBe('Dos')

    // Y otra vez en pausa con Espacio.
    await user.keyboard(' ')
    act(() => vi.advanceTimersByTime(loop.tickerStep * 2))
    expect(firstWord()).toBe('Dos')
  })

  it('RNF-A11Y-03: si «reducir movimiento» se activa en caliente, pasa a la variante estática', () => {
    render(<MarqueeBand items={ITEMS} label="Teletipo" pauseLabel="Pausar" />)
    expect(screen.getByRole('marquee').querySelectorAll('.marquee__group')).toHaveLength(3)
    act(() => {
      document.documentElement.dataset.motion = 'reduced'
    })
    return vi.waitFor(() => {
      expect(screen.getByRole('marquee')).toHaveAttribute('data-static', 'true')
      expect(screen.getByRole('marquee').querySelectorAll('.marquee__group')).toHaveLength(1)
    })
  })
})

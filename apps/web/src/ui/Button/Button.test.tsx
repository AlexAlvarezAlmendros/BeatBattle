import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { type MatchMediaController, mockMatchMedia } from '../hooks/mockMatchMedia'
import { REDUCED_MOTION_QUERY } from '../hooks/useReducedMotion'
import { WAVE_LOADER_BARS } from './WaveLoader'

// Espía del `animate` de Motion (el muelle del pulsado), con la implementación real detrás: así los
// tests sin movimiento comprueban que ni se llama, sin depender de cuántos fotogramas pasen.
const motion = vi.hoisted(() => ({ animate: undefined as unknown as ReturnType<typeof vi.fn> }))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  motion.animate = vi.fn(actual.animate)
  return { ...actual, animate: motion.animate }
})

const { Button, BUTTON_VARIANTS } = await import('./Button')

let media: MatchMediaController | undefined
afterEach(() => {
  media?.restore()
  media = undefined
  motion.animate.mockClear()
})

describe('Button (§3.3, 0.25)', () => {
  it('pinta un <button type="button"> con su texto, su variante y el marco de chaflán --bb-cut-md', () => {
    render(
      <div>
        {BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </div>,
    )
    for (const variant of BUTTON_VARIANTS) {
      const button = screen.getByRole('button', { name: variant })
      expect(button).toHaveAttribute('type', 'button')
      expect(button).toHaveAttribute('data-variant', variant)
      expect(button).toHaveAttribute('data-frame-cut', 'md')
    }
  })

  it('con `to` es un enlace de React Router y con `href`, un <a>', () => {
    render(
      <MemoryRouter>
        <Button to="/subir">Subir mi beat</Button>
        <Button href="https://www.otherpeople.es" variant="outline">
          Other People
        </Button>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Subir mi beat' })).toHaveAttribute('href', '/subir')
    expect(screen.getByRole('link', { name: 'Other People' })).toHaveAttribute(
      'href',
      'https://www.otherpeople.es',
    )
  })

  it('RD-MOT-05: el foco es el cursor de juego (el anillo va dentro, decorativo)', () => {
    render(<Button>Jugar</Button>)
    const button = screen.getByRole('button', { name: 'Jugar' })
    expect(button).toHaveAttribute('data-cursor')
    expect(button.querySelector('[data-cursor-ring="cut"]')).toHaveAttribute('data-cursor-cut', 'md')
    expect(button.querySelector('[data-cursor-ring]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('enseña su tecla a la derecha, oculta a los lectores (la acción ya la dice el texto)', () => {
    render(<Button keyHint="INTRO">Escuchar</Button>)
    const button = screen.getByRole('button', { name: 'Escuchar' })
    const key = button.querySelector('kbd[data-key]')
    expect(key).toHaveTextContent('INTRO')
    expect(key).toHaveAttribute('aria-hidden', 'true')
  })

  it('RNF-A11Y-01: solo con icono tiene nombre accesible y se usa con teclado', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button iconOnly icon="close" aria-label="Cerrar" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Cerrar' })
    button.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('cargando: onda de 5 barras, aria-busy, texto accesible y sin clics, pero sigue enfocable', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Subir mi beat
      </Button>,
    )
    const button = screen.getByRole('button', { name: /Cargando/ })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelectorAll('[data-wave-loader] > span')).toHaveLength(WAVE_LOADER_BARS)
    button.focus()
    expect(button).toHaveFocus()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('§3.3: deshabilitado es aria-disabled (enfocable), no responde y dice su motivo al lado', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled disabledReason="Disponible el lunes" onClick={onClick}>
        Jugar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Jugar' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription('Disponible el lunes')
    expect(screen.getByText('Disponible el lunes')).toBeVisible()
    button.focus()
    expect(button).toHaveFocus()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('un enlace deshabilitado se anuncia como tal y no navega', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Button to="/subir" disabled>
          Subir mi beat
        </Button>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Subir mi beat' })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    await user.click(link)
    expect(window.location.pathname).not.toBe('/subir')
  })

  it('éxito pinta check; error, icono de alerta y aviso de papel (nunca solo color)', () => {
    render(
      <>
        <Button status="success">Subido</Button>
        <Button status="error">Reintentar</Button>
      </>,
    )
    const success = screen.getByRole('button', { name: /Subido/ })
    const error = screen.getByRole('button', { name: /Reintentar/ })
    expect(success).toHaveAttribute('data-status', 'success')
    expect(success.querySelector('[data-icon="check"]')).not.toBeNull()
    expect(error).toHaveAttribute('data-status', 'error')
    expect(error.querySelector('[data-icon="alert"]')).not.toBeNull()
    expect(getComputedStyle(error).getPropertyValue('--frame-fill')).toBe('var(--bb-white)')
  })

  it('RNF-A11Y-01: éxito y error también con palabras en el nombre (WCAG 4.1.3)', () => {
    render(
      <>
        <Button status="success">Subido</Button>
        <Button status="error">Reintentar</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: `Subido (${t('ui.button.success')})` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Reintentar (${t('ui.button.error')})` })).toBeInTheDocument()
  })

  it('RNF-A11Y-01: solo con icono, compone su aria-label con la carga y con el estado', () => {
    render(
      <>
        <Button iconOnly icon="play" aria-label="Reproducir" loading />
        <Button iconOnly icon="play" aria-label="Pausar" status="error" />
      </>,
    )
    expect(screen.getByRole('button', { name: `Reproducir (${t('ui.button.loading')})` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Pausar (${t('ui.button.error')})` })).toBeInTheDocument()
  })

  it('WCAG 4.1.3: al pasar a éxito o error se anuncia por la región viva compartida (no al montar)', async () => {
    const { rerender } = render(<Button status="idle">Subir mi beat</Button>)
    const region = document.querySelector('[data-announcer]')!
    expect(region).toHaveTextContent('')
    rerender(<Button status="success">Subir mi beat</Button>)
    await waitFor(() => expect(region).toHaveTextContent(`Subir mi beat (${t('ui.button.success')})`))
  })

  it('RD-VIS-03: los estados forzados salen en data-force-state (el reposo no lleva atributo)', () => {
    render(
      <>
        <Button state="rest">Reposo</Button>
        <Button state="hover">Hover</Button>
        <Button state="focus">Foco</Button>
        <Button state="pressed">Pulsado</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Reposo' })).not.toHaveAttribute('data-force-state')
    for (const [name, state] of [
      ['Hover', 'hover'],
      ['Foco', 'focus'],
      ['Pulsado', 'pressed'],
    ])
      expect(screen.getByRole('button', { name })).toHaveAttribute('data-force-state', state)
  })

  it('pulsar con el muelle llama a Motion sin romper el clic', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Jugar</Button>)
    await user.click(screen.getByRole('button', { name: 'Jugar' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(motion.animate).toHaveBeenCalled()
  })

  it('RNF-A11Y-03: con «reducir movimiento» pulsar no escala', async () => {
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    const user = userEvent.setup()
    render(<Button>Jugar</Button>)
    await user.click(screen.getByRole('button', { name: 'Jugar' }))
    expect(motion.animate).not.toHaveBeenCalled()
  })
})

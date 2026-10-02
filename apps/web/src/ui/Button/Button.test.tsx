import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type MatchMediaController, mockMatchMedia } from '../../hooks/mockMatchMedia'
import { REDUCED_MOTION_QUERY } from '../../hooks/useReducedMotion'
import { t } from '../../i18n'
import { Button } from './Button'
import { WAVE_LOADER_BARS } from './WaveLoader'

let media: MatchMediaController | undefined
afterEach(() => {
  media?.restore()
  media = undefined
})

describe('Button', () => {
  it('pinta un <button type="button"> con su texto y sus variantes', () => {
    render(
      <>
        <Button>Pillar el sample</Button>
        <Button variant="outline">Escuchar</Button>
      </>,
    )
    const cta = screen.getByRole('button', { name: 'Pillar el sample' })
    expect(cta).toHaveAttribute('type', 'button')
    expect(cta).toHaveAttribute('data-variant', 'cta')
    expect(screen.getByRole('button', { name: 'Escuchar' })).toHaveAttribute('data-variant', 'outline')
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

  it('RNF-A11Y-01: el botón icono tiene nombre accesible y se usa con teclado', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button variant="icon" icon="play" aria-label="Reproducir" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Reproducir' })
    await user.tab()
    expect(button).toHaveFocus()
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
    const button = screen.getByRole('button', { name: t('ui.button.loading') })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button.querySelector('[data-wave-loader]')?.children).toHaveLength(WAVE_LOADER_BARS)
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
    await user.tab()
    await user.tab({ shift: true })
    expect(button).toHaveFocus()
  })

  it('cargando con un texto propio', () => {
    render(
      <Button loading loadingLabel="Subiendo tu beat…">
        Subir
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Subiendo tu beat…' })).toBeInTheDocument()
  })

  it('deshabilitado: no se enfoca ni responde', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Votar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Votar' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('un enlace deshabilitado se anuncia como tal y no navega', () => {
    render(
      <MemoryRouter>
        <Button to="/jurado" disabled>
          Modo Jurado
        </Button>
      </MemoryRouter>,
    )
    const link = screen.getByText('Modo Jurado').closest('a')!
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')
  })

  it('éxito pinta check y destello; error, icono de alerta (nunca solo color)', () => {
    const { rerender } = render(<Button status="success">Subido</Button>)
    const button = screen.getByRole('button', { name: /^Subido/ })
    expect(button).toHaveAttribute('data-status', 'success')
    expect(button.querySelector('[data-icon="check"]')).not.toBeNull()
    rerender(<Button status="error">Reintentar</Button>)
    expect(button).toHaveAttribute('data-status', 'error')
    expect(button.querySelector('[data-icon="alert"]')).not.toBeNull()
  })

  it('RNF-A11Y-01: éxito y error también con palabras en el nombre (WCAG 4.1.3)', () => {
    const { rerender } = render(<Button status="success">Subido</Button>)
    const hint = (state: string) => t('ui.button.stateHint', { state })
    expect(screen.getByRole('button')).toHaveAccessibleName(`Subido ${hint(t('ui.button.success'))}`)
    rerender(<Button status="error">Reintentar</Button>)
    expect(screen.getByRole('button')).toHaveAccessibleName(`Reintentar ${hint(t('ui.button.error'))}`)
    rerender(<Button status="idle">Subir</Button>)
    expect(screen.getByRole('button')).toHaveAccessibleName('Subir')
  })

  it('RNF-A11Y-01: el botón icono compone su aria-label con la carga y con el estado', () => {
    const name = (state: string) => t('ui.button.withState', { label: 'Reproducir', state })
    const { rerender } = render(<Button variant="icon" icon="play" aria-label="Reproducir" loading />)
    expect(screen.getByRole('button')).toHaveAccessibleName(name(t('ui.button.loading')))
    rerender(<Button variant="icon" icon="play" aria-label="Reproducir" status="error" />)
    expect(screen.getByRole('button')).toHaveAccessibleName(name(t('ui.button.error')))
    rerender(<Button variant="icon" icon="play" aria-label="Reproducir" />)
    expect(screen.getByRole('button')).toHaveAccessibleName('Reproducir')
  })

  it('WCAG 4.1.3: al pasar a éxito o error se anuncia por la región viva compartida (no al montar)', async () => {
    const region = () => document.querySelector('[data-announcer]')
    const { rerender } = render(<Button status="success">Subido</Button>)
    // La región existe desde el montaje, vacía: montar ya en éxito (la galería) no anuncia nada.
    expect(region()).toHaveAttribute('role', 'status')
    expect(region()).toBeEmptyDOMElement()
    rerender(<Button status="idle">Subir</Button>)
    rerender(<Button status="success">Subido</Button>)
    await waitFor(() =>
      expect(region()).toHaveTextContent(
        t('ui.button.withState', { label: 'Subido', state: t('ui.button.success') }),
      ),
    )
    rerender(<Button status="error">Reintentar</Button>)
    await waitFor(() =>
      expect(region()).toHaveTextContent(
        t('ui.button.withState', { label: 'Reintentar', state: t('ui.button.error') }),
      ),
    )
  })

  it('RD-VIS-03: los estados forzados salen en data-force-state (el reposo no lleva atributo)', () => {
    render(
      <>
        <Button state="hover">A</Button>
        <Button state="focus">B</Button>
        <Button state="pressed">C</Button>
        <Button state="rest">D</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('data-force-state', 'hover')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('data-force-state', 'focus')
    expect(screen.getByRole('button', { name: 'C' })).toHaveAttribute('data-force-state', 'pressed')
    expect(screen.getByRole('button', { name: 'D' })).not.toHaveAttribute('data-force-state')
  })

  it('RNF-A11Y-03: con «reducir movimiento» pulsar no escala (solo cambia el color)', async () => {
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    const user = userEvent.setup()
    render(<Button>Votar</Button>)
    const button = screen.getByRole('button', { name: 'Votar' })
    await user.pointer({ keys: '[MouseLeft>]', target: button })
    expect(button.style.transform).toBe('')
    await user.pointer({ keys: '[/MouseLeft]', target: button })
  })

  it('pulsar con el muelle llama a Motion sin romper el clic', async () => {
    media = mockMatchMedia()
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Votar</Button>)
    await user.click(screen.getByRole('button', { name: 'Votar' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

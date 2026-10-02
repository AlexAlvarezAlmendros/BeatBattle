import { color } from '@beatbattle/shared/tokens'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { useToasts } from '../../ui/Toast'
import { COMPONENT_ANCHORS } from './anchors'
import { GalleryPage } from './GalleryPage'

const SECTION_KEYS = ['color', 'typography', 'spacing', 'radii', 'shadows', 'motion', 'components'] as const

/** Pinta la galería y espera a su cuerpo, que se carga aparte (`React.lazy`). */
async function renderGallery() {
  const view = render(
    <MemoryRouter initialEntries={['/dev/galeria']}>
      <GalleryPage />
    </MemoryRouter>,
  )
  await screen.findByRole(
    'heading',
    { level: 2, name: t('dev.gallery.sections.components') },
    { timeout: 10_000 },
  )
  return view
}

afterEach(() => {
  document.documentElement.removeAttribute('data-motion')
  act(() => useToasts.getState().clear())
})

describe('galería /dev/galeria (0.9)', () => {
  it('la cabecera (título, ajustes e índice) sale al momento, sin esperar a los componentes', () => {
    render(
      <MemoryRouter initialEntries={['/dev/galeria']}>
        <GalleryPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: t('dev.gallery.title') })).toBeInTheDocument()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.getByRole('navigation', { name: t('dev.gallery.indexLabel') })).toBeInTheDocument()
  })

  it('RD-VIS-03: un solo <h1> y todas las secciones (tokens, tipografía, espaciado, radios, sombras, movimiento y componentes)', async () => {
    await renderGallery()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: t('dev.gallery.title') })).toBeInTheDocument()
    const sections = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(sections).toEqual(SECTION_KEYS.map((key) => t(`dev.gallery.sections.${key}`)))
  })

  it('RD-VIS-03: pinta cada componente base de §3.3 en su bloque', async () => {
    await renderGallery()
    for (const { id, key } of COMPONENT_ANCHORS) {
      const block = document.getElementById(id)
      expect(block, id).not.toBeNull()
      expect(within(block!).getAllByRole('heading', { level: 3 })[0]!.textContent).toMatch(
        new RegExp(`^${t(`dev.gallery.components.${key}`)}`),
      )
    }
    const byId = (id: string) => document.getElementById(id)!
    expect(byId('boton').querySelectorAll('[data-variant="cta"]').length).toBeGreaterThan(0)
    expect(byId('boton').querySelectorAll('[data-variant="outline"]').length).toBeGreaterThan(0)
    expect(byId('boton').querySelectorAll('[data-variant="icon"]').length).toBeGreaterThan(0)
    expect(within(byId('chip')).getAllByRole('button', { pressed: true }).length).toBeGreaterThan(0)
    expect(byId('tarjeta').querySelectorAll('[data-surface][data-tilt]').length).toBeGreaterThanOrEqual(4)
    expect(within(byId('tesela')).getAllByRole('term').length).toBeGreaterThan(0)
    expect(within(byId('rotulo')).getByText(t('dev.gallery.sample.sectionLabel.info'))).toBeInTheDocument()
    expect(within(byId('onda')).getAllByRole('img').length).toBeGreaterThanOrEqual(4)
    expect(within(byId('fila')).getAllByRole('article').length).toBeGreaterThanOrEqual(4)
    expect(within(byId('modal')).getByText(t('dev.gallery.sample.modal.title'))).toBeInTheDocument()
    expect(within(byId('aviso')).getByText(t('dev.gallery.sample.toast.error'))).toBeInTheDocument()
    expect(within(byId('xp')).getAllByRole('progressbar').length).toBeGreaterThanOrEqual(5)
    expect(byId('esqueleto').querySelectorAll('[data-skeleton]').length).toBeGreaterThan(0)
    expect(within(byId('cuenta-atras')).getAllByRole('timer')).toHaveLength(5)
  })

  it('RD-VIS-03: cada estado de §3.3 aparece (reposo, hover, foco, pulsado, cargando, deshabilitado, éxito y error)', async () => {
    await renderGallery()
    const buttons = document.getElementById('boton')!
    for (const state of ['hover', 'focus', 'pressed']) {
      expect(buttons.querySelectorAll(`[data-force-state="${state}"]`).length, state).toBeGreaterThanOrEqual(
        3,
      )
    }
    expect(buttons.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThanOrEqual(3)
    expect(buttons.querySelectorAll('[data-status="success"]').length).toBeGreaterThanOrEqual(3)
    expect(buttons.querySelectorAll('[data-status="error"]').length).toBeGreaterThanOrEqual(3)
    expect(buttons.querySelectorAll('button:disabled').length).toBeGreaterThanOrEqual(3)
    const captions = [...document.querySelectorAll('figcaption')].map((caption) => caption.textContent)
    for (const state of [
      'rest',
      'hover',
      'focus',
      'pressed',
      'loading',
      'disabled',
      'success',
      'error',
    ] as const) {
      expect(captions, state).toContain(t(`dev.gallery.states.${state}`))
    }
  })

  it('las muestras de color salen de @beatbattle/shared/tokens con su contraste', async () => {
    await renderGallery()
    const swatches = within(document.getElementById('color')!).getAllByRole('listitem')
    expect(swatches).toHaveLength(Object.keys(color).length)
    expect(swatches[0]).toHaveTextContent('--bb-black')
    expect(swatches[0]).toHaveTextContent(t('dev.gallery.color.onBlack'))
  })

  it('el índice enlaza con cada sección y con cada componente', async () => {
    await renderGallery()
    const index = screen.getByRole('navigation', { name: t('dev.gallery.indexLabel') })
    const targets = within(index)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href')!.slice(1))
    expect(targets).toHaveLength(SECTION_KEYS.length + COMPONENT_ANCHORS.length)
    for (const id of targets) expect(document.getElementById(id), id).not.toBeNull()
  })

  it('RNF-A11Y-03 / RD-MOT-03: el interruptor «Reducir movimiento» pone data-motion="reduced" en <html>', async () => {
    const user = userEvent.setup()
    await renderGallery()
    const toggle = screen.getByRole('switch', { name: t('dev.gallery.controls.reducedMotion') })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduced')
    // Las tarjetas dejan de inclinarse.
    await act(async () => {})
    for (const card of document.querySelectorAll('#tarjeta [data-tilt]'))
      expect(card).toHaveAttribute('data-tilt', 'off')
    await user.click(toggle)
    expect(document.documentElement).not.toHaveAttribute('data-motion')
  })

  it('RNF-A11Y-01: los interruptores se usan con teclado; cristal o macizo cambia las superficies', async () => {
    const user = userEvent.setup()
    await renderGallery()
    const glass = screen.getByRole('switch', { name: t('dev.gallery.controls.glass') })
    expect(glass).toHaveAttribute('aria-checked', 'true')
    expect(document.querySelectorAll('#tarjeta [data-surface="glass"]').length).toBeGreaterThan(0)
    glass.focus()
    await user.keyboard(' ')
    expect(glass).toHaveAttribute('aria-checked', 'false')
    expect(document.querySelectorAll('#tarjeta [data-surface="glass"]')).toHaveLength(0)
    expect(document.querySelectorAll('#modal [data-surface="solid"]').length).toBeGreaterThan(0)
  })

  it('los botones de la demo lanzan avisos de verdad', async () => {
    const user = userEvent.setup()
    await renderGallery()
    await user.click(screen.getByRole('button', { name: t('dev.gallery.demo.toastError') }))
    expect(useToasts.getState().toasts).toMatchObject([{ tone: 'error' }])
  })
})

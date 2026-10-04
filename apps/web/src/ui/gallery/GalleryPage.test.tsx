import { color } from '@beatbattle/shared/tokens'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { resetGlassCapabilityCache } from '../glass'
import { useToasts } from '../Toast'
import { COMPONENT_ANCHORS, LAYOUT_ANCHORS } from './anchors'
import { GalleryPage } from './GalleryPage'
import { SEAL_STATES, STATE_MATRIX } from './stateMatrix'

const SECTION_KEYS = [
  'color',
  'typography',
  'spacing',
  'radii',
  'shadows',
  'motion',
  'components',
  'layout',
] as const

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
  vi.unstubAllGlobals()
  resetGlassCapabilityCache()
})

// El cuerpo de la galería (todos los componentes y el layout) se importa aparte: con todo el monorepo
// en paralelo, la primera importación pasa de los 5 s por defecto. Mismo margen que `renderGallery`.
describe('galería /dev/galeria (0.9)', { timeout: 15_000 }, () => {
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

  it('RD-VIS-03: un solo <h1> y todas las secciones (tokens, tipografía, espaciado, radios, sombras, movimiento, componentes y layout)', async () => {
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
    expect(within(byId('modal')).getAllByText(t('dev.gallery.sample.modal.title')).length).toBeGreaterThan(0)
    expect(within(byId('aviso')).getByText(t('dev.gallery.sample.toast.error'))).toBeInTheDocument()
    expect(within(byId('xp')).getAllByRole('progressbar').length).toBeGreaterThanOrEqual(5)
    expect(byId('esqueleto').querySelectorAll('[data-skeleton]').length).toBeGreaterThan(0)
    expect(within(byId('cuenta-atras')).getAllByRole('timer')).toHaveLength(5)
  })

  it('RD-VIS-03: cada bloque enseña los estados de su matriz y dice por qué no enseña el resto', async () => {
    await renderGallery()
    // La matriz cubre todos los componentes de la galería (Estrellas llega con la tarea 1.5).
    expect(Object.keys(STATE_MATRIX).sort()).toEqual(COMPONENT_ANCHORS.map(({ key }) => key).sort())
    for (const { id, key } of COMPONENT_ANCHORS) {
      const block = document.getElementById(id)!
      for (const state of SEAL_STATES) {
        const coverage = STATE_MATRIX[key][state]
        // Dentro de su bloque, no en la galería entera: el botón ya no tapa a los demás.
        const cells = [...block.querySelectorAll<HTMLElement>(`figure[data-state="${state}"]`)]
        expect(cells.length, `${id} · ${state}`).toBeGreaterThan(0)
        for (const cell of cells) expect(cell.dataset.coverage, `${id} · ${state}`).toBe(coverage.kind)
        if (coverage.kind === 'shown') {
          // La celda enseña la pieza: algo más que el texto del motivo.
          expect(cells[0]!.querySelector('figcaption')?.textContent, `${id} · ${state}`).toContain(
            t(`dev.gallery.states.${state}`),
          )
        } else {
          expect(cells[0], `${id} · ${state}`).toHaveTextContent(
            t(`dev.gallery.matrix.reasons.${coverage.reason}`),
          )
          expect(cells[0], `${id} · ${state}`).toHaveTextContent(t(`dev.gallery.matrix.${coverage.kind}`))
        }
      }
    }
  })

  it('RD-VIS-03: los estados que se enseñan están forzados de verdad en su pieza', async () => {
    await renderGallery()
    const cell = (id: string, state: string) =>
      document.getElementById(id)!.querySelector<HTMLElement>(`figure[data-state="${state}"]`)!
    // Botón: los 8 en las tres variantes.
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
    // Chip.
    for (const state of ['hover', 'focus', 'pressed'])
      expect(cell('chip', state).querySelector(`[data-force-state="${state}"]`), state).not.toBeNull()
    expect(cell('chip', 'disabled').querySelector('button:disabled')).not.toBeNull()
    // Tarjeta.
    expect(cell('tarjeta', 'hover').querySelector('[data-force-state="hover"]')).not.toBeNull()
    expect(cell('tarjeta', 'loading').querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(cell('tarjeta', 'disabled').querySelector('[data-disabled]')).not.toBeNull()
    expect(cell('tarjeta', 'disabled').querySelector('button:disabled')).not.toBeNull()
    // Tesela.
    expect(cell('tesela', 'loading').querySelector('[aria-busy="true"], [data-skeleton]')).not.toBeNull()
    // Fila de entrada: play pulsado, cargando, deshabilitado y error de carga (RF-PLAY-09).
    expect(cell('fila', 'pressed').querySelector('button[data-force-state="pressed"]')).not.toBeNull()
    expect(cell('fila', 'loading').querySelector('button[aria-busy="true"]')).not.toBeNull()
    expect(cell('fila', 'disabled').querySelector('button:disabled')).not.toBeNull()
    expect(within(cell('fila', 'error')).getByText(t('ui.entryRow.loadError'))).toBeInTheDocument()
    // Modal: foco en cerrar, cuerpo que carga y cuerpo con error.
    expect(cell('modal', 'focus').querySelector('button[data-force-state="focus"]')).not.toBeNull()
    expect(cell('modal', 'loading').querySelector('[aria-busy="true"] [data-skeleton]')).not.toBeNull()
    expect(within(cell('modal', 'error')).getByText(t('dev.gallery.sample.modal.error'))).toBeInTheDocument()
    // Aviso: botón de cerrar pulsado; éxito y error con su tono.
    expect(cell('aviso', 'pressed').querySelector('button[data-force-state="pressed"]')).not.toBeNull()
    expect(cell('aviso', 'success').querySelector('[data-tone="success"]')).not.toBeNull()
    expect(cell('aviso', 'error').querySelector('[data-tone="error"]')).not.toBeNull()
    // Barra de XP: el éxito es la subida de nivel.
    expect(cell('xp', 'success').querySelector('[data-force-state="levelUp"]')).not.toBeNull()
  })

  it('RD-VIS-03: el layout del sello enseña isla, pie, titular, rótulos, rejilla y viñeta, marquee, orbes y GlassSurface', async () => {
    vi.stubGlobal('CSS', { supports: () => true })
    resetGlassCapabilityCache()
    await renderGallery()
    for (const { id, key } of LAYOUT_ANCHORS) {
      const block = document.getElementById(id)
      expect(block, id).not.toBeNull()
      expect(within(block!).getAllByRole('heading', { level: 3 })[0]!.textContent).toBe(
        t(`dev.gallery.layout.pieces.${key}`),
      )
    }
    const byId = (id: string) => document.getElementById(id)!
    // Isla con cristal y sin él (alternativa), como muestras inertes: no duplican la navegación.
    const islands = byId('isla').querySelectorAll('.site-header')
    expect(islands).toHaveLength(2)
    expect(islands[0]).toHaveAttribute('data-glass', 'on')
    expect(islands[1]).not.toHaveAttribute('data-glass')
    for (const island of islands) expect(island.closest('[inert][aria-hidden="true"]')).not.toBeNull()
    expect(within(byId('isla')).queryByRole('navigation')).toBeNull()
    expect(byId('pie').querySelector('.site-footer')?.closest('[inert]')).not.toBeNull()
    expect(byId('titular').querySelector('.hero-title')).not.toBeNull()
    expect(byId('rotulos').querySelectorAll('.side-label')).toHaveLength(2)
    expect(byId('rejilla').querySelectorAll('.hero-grid')).toHaveLength(2)
    expect(byId('rejilla').querySelectorAll('.hero-vignette')).toHaveLength(2)
    expect(within(byId('marquee')).getByRole('marquee', { name: t('home.ticker.label') })).toBeInTheDocument()
    expect(byId('orbes').querySelectorAll('.ambient-orbs__orb')).toHaveLength(3)
    const panels = byId('cristal').querySelectorAll('[data-glass="on"]')
    expect(panels).toHaveLength(3)
    expect(byId('cristal').querySelectorAll('[data-glass="on"] feColorMatrix')).toHaveLength(3)
  })

  it('RNF-A11Y-03 / RD-MOT-03: con «reducir movimiento» el layout pasa a su variante (marquee quieto, sin cristal)', async () => {
    vi.stubGlobal('CSS', { supports: () => true })
    resetGlassCapabilityCache()
    const user = userEvent.setup()
    await renderGallery()
    const layout = document.getElementById('layout')!
    const marquee = within(layout).getByRole('marquee')
    expect(marquee).not.toHaveAttribute('data-static')
    expect(layout.querySelectorAll('[data-glass="on"]').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('switch', { name: t('dev.gallery.controls.reducedMotion') }))
    await act(async () => {})
    expect(marquee).toHaveAttribute('data-static', 'true')
    expect(layout.querySelectorAll('[data-glass="on"]')).toHaveLength(0)
    expect(layout.querySelector('[data-glass-capability]')).toHaveAttribute('data-glass-capability', 'off')
  })

  it('el interruptor de cristal apaga también las GlassSurface del layout (calidad baja)', async () => {
    vi.stubGlobal('CSS', { supports: () => true })
    resetGlassCapabilityCache()
    const user = userEvent.setup()
    await renderGallery()
    const layout = document.getElementById('layout')!
    expect(layout.querySelectorAll('[data-glass="on"]').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('switch', { name: t('dev.gallery.controls.glass') }))
    expect(layout.querySelectorAll('[data-glass="on"]')).toHaveLength(0)
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
    expect(targets).toHaveLength(SECTION_KEYS.length + COMPONENT_ANCHORS.length + LAYOUT_ANCHORS.length)
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

  it('el interruptor sigue el atributo aunque cambie fuera y, al salir de la galería, lo deja como estaba', async () => {
    const user = userEvent.setup()
    const { unmount } = await renderGallery()
    const toggle = screen.getByRole('switch', { name: t('dev.gallery.controls.reducedMotion') })
    // Un cambio hecho fuera (el ajuste de accesibilidad de la app) se refleja.
    await act(async () => document.documentElement.setAttribute('data-motion', 'reduced'))
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await act(async () => document.documentElement.removeAttribute('data-motion'))
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    // Al salir con el ajuste de prueba puesto, se quita (al entrar no estaba).
    await user.click(toggle)
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduced')
    unmount()
    expect(document.documentElement).not.toHaveAttribute('data-motion')
  })

  it('al salir respeta el ajuste que ya había al entrar', async () => {
    const user = userEvent.setup()
    document.documentElement.setAttribute('data-motion', 'reduced')
    const { unmount } = await renderGallery()
    const toggle = screen.getByRole('switch', { name: t('dev.gallery.controls.reducedMotion') })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await user.click(toggle)
    expect(document.documentElement).not.toHaveAttribute('data-motion')
    unmount()
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduced')
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

  it('los botones de la demo lanzan avisos de verdad, que pinta la zona del marco (no una propia)', async () => {
    const user = userEvent.setup()
    await renderGallery()
    await user.click(screen.getByRole('button', { name: t('dev.gallery.demo.toastError') }))
    expect(useToasts.getState().toasts).toMatchObject([{ tone: 'error' }])
    // Sin el marco (`RootLayout`), la galería no tiene zona de avisos: no monta una segunda.
    expect(screen.queryByRole('region', { name: t('ui.toast.region') })).toBeNull()
  })
})

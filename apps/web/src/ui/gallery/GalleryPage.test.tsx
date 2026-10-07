import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { useToasts } from '../Toast'
import { COMPONENT_ANCHORS } from './anchors'
import { CONTRAST_RULES } from './contrast'
import { GalleryPage } from './GalleryPage'
import { GALLERY_SECTIONS } from './sections'
import { STATE_MATRIX, STATES } from './stateMatrix'

/** Pinta la galería y espera a sus secciones, que se cargan aparte (`React.lazy`). */
async function renderGallery() {
  const view = render(
    <MemoryRouter initialEntries={['/dev/galeria']}>
      <GalleryPage />
    </MemoryRouter>,
  )
  for (const section of GALLERY_SECTIONS) {
    await screen.findByRole('heading', { level: 2, name: t(section.title) }, { timeout: 10_000 })
  }
  return view
}

afterEach(() => {
  document.documentElement.removeAttribute('data-motion')
  document.documentElement.removeAttribute('data-serious')
  act(() => useToasts.getState().clear())
  vi.unstubAllGlobals()
})

// El cuerpo de la galería (todos los componentes y el layout) se importa aparte. Solo, la primera
// importación tarda ~3 s; con todo el monorepo en paralelo (o en un runner de CI con pocos núcleos)
// llegó a pasar de 15 s y el test fallaba por tiempo. Se precargan las secciones una vez antes de los
// tests, con su propio margen, para que el tiempo de los tests mida la galería y no el import.
beforeAll(async () => {
  await Promise.all(GALLERY_SECTIONS.map((section) => section.load()))
}, 120_000)

describe('galería /dev/galeria (0.9, 0.22, 0.25)', { timeout: 15_000 }, () => {
  it('la cabecera (título, ajustes e índice) sale al momento, sin esperar a los componentes', () => {
    render(
      <MemoryRouter initialEntries={['/dev/galeria']}>
        <GalleryPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: t('dev.gallery.title') })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: t('dev.gallery.controls.reducedMotion') })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: t('dev.gallery.controls.serious') })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: t('dev.gallery.indexLabel') })).toBeInTheDocument()
  })

  it('RD-VIS-03: un solo <h1> y las secciones del registro, en su orden, cada una con su ancla', async () => {
    await renderGallery()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: t('dev.gallery.title') })).toBeInTheDocument()
    // Los <h2> de sección (las piezas de muestra llevan los suyos dentro de sus bloques).
    const sections = [...document.querySelectorAll('section > h2')].map((heading) => heading.textContent)
    expect(sections).toEqual(GALLERY_SECTIONS.map((section) => t(section.title)))
    for (const section of GALLERY_SECTIONS) {
      const element = document.getElementById(section.id)
      expect(element, section.id).not.toBeNull()
      expect(element!.tagName).toBe('SECTION')
    }
    // Los ids del registro no se repiten.
    expect(new Set(GALLERY_SECTIONS.map((section) => section.id)).size).toBe(GALLERY_SECTIONS.length)
  })

  it('RD-VIS-03: la sección «Base» enseña paleta, contraste, tipografía, escala, forma, primitivas y cursor', async () => {
    await renderGallery()
    const base = document.getElementById('base')!
    for (const id of [
      'base-paleta',
      'base-contraste',
      'base-tipografia',
      'base-escala',
      'base-forma',
      'base-primitivas',
      'base-cursor',
    ]) {
      expect(
        within(base)
          .getAllByRole('heading', { level: 3 })
          .map((h) => h.closest('section')?.id),
      ).toContain(id)
    }
    // Paleta: los cuatro colores del sello con su variable.
    const palette = document.getElementById('base-paleta')!
    for (const name of ['--bb-black', '--bb-red', '--bb-white', '--bb-wine']) {
      expect(within(palette).getAllByText(name).length, name).toBeGreaterThan(0)
    }
    // Contraste: una fila por par de §3.2.
    const rows = document.querySelectorAll('#base-contraste tbody tr')
    expect(rows).toHaveLength(CONTRAST_RULES.length)
    // Primitivas: marcos de las tres variantes, teclas, etiquetas y la pegatina con la firma.
    const primitives = document.getElementById('base-primitivas')!
    for (const variant of ['panel', 'stage', 'title']) {
      expect(primitives.querySelector(`[data-frame="${variant}"]`), variant).not.toBeNull()
    }
    expect(primitives.querySelectorAll('kbd[data-key]').length).toBeGreaterThanOrEqual(9)
    expect(primitives.querySelectorAll('[data-tag]').length).toBeGreaterThanOrEqual(9)
    expect(within(primitives).getAllByRole('link', { name: t('ui.otpSlap.label') }).length).toBeGreaterThan(0)
    // Cursor: forzado (entero y, §3.3 v0.6.7, el apagado de la elegida con el foco en otro control) y
    // en los tres grupos de foco itinerante.
    const cursor = document.getElementById('base-cursor')!
    expect(cursor.querySelectorAll('[data-force-state="focus"] [data-cursor-ring]')).toHaveLength(2)
    expect(cursor.querySelectorAll('[data-force-state="away"] [data-cursor-ring]')).toHaveLength(1)
    expect(within(cursor).getByRole('menu')).toBeInTheDocument()
    expect(within(cursor).getByRole('listbox')).toBeInTheDocument()
    expect(within(cursor).getByRole('tablist')).toBeInTheDocument()
  })

  it('RD-MOT-05: el menú de la galería se recorre con el teclado y el foco es el cursor', async () => {
    const user = userEvent.setup()
    await renderGallery()
    const menu = within(document.getElementById('base-cursor')!).getByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1)
    items[0]!.focus()
    await user.keyboard('{ArrowUp}')
    expect(items.at(-1)).toHaveFocus()
    expect(items.at(-1)).toHaveAttribute('data-cursor-active', 'true')
  })

  it('el índice enlaza con cada sección y con cada bloque del registro', async () => {
    await renderGallery()
    const index = screen.getByRole('navigation', { name: t('dev.gallery.indexLabel') })
    const targets = within(index)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href')!.slice(1))
    const expected = GALLERY_SECTIONS.flatMap((section) => [
      section.id,
      ...(section.anchors ?? []).map((a) => a.id),
    ])
    expect(targets).toEqual(expected)
    for (const id of targets) expect(document.getElementById(id), id).not.toBeNull()
  })

  it('RD-VIS-03: el interruptor «Modo serio» pone data-serious en <html> y lo deja como estaba al salir', async () => {
    const user = userEvent.setup()
    const { unmount } = await renderGallery()
    const toggle = screen.getByRole('switch', { name: t('dev.gallery.controls.serious') })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement).toHaveAttribute('data-serious')
    // Un cambio hecho fuera (los ajustes de la app) se refleja.
    await act(async () => document.documentElement.removeAttribute('data-serious'))
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    unmount()
    expect(document.documentElement).not.toHaveAttribute('data-serious')
  })

  it('RD-VIS-03: en modo serio, las teselas del anunciador dicen que se calla y lo que lee la región viva', async () => {
    const user = userEvent.setup()
    await renderGallery()
    const block = document.getElementById('anunciador')!
    const cells = [...block.querySelectorAll<HTMLElement>('figure')].filter((cell) =>
      cell.querySelector('[data-announcer]'),
    )
    expect(cells).toHaveLength(2)
    const note = t('dev.gallery.arena.announcer.seriousNote')
    const live = (key: 'round' | 'voteSaved') =>
      t('dev.gallery.arena.announcer.liveText', { text: t(`dev.gallery.arena.announcer.${key}`) })
    // Sin modo serio, el rótulo y nada más.
    for (const cell of cells) expect(cell).not.toHaveTextContent(note)
    await user.click(screen.getByRole('switch', { name: t('dev.gallery.controls.serious') }))
    // Con él, cada tesela lo explica (no es un marco vacío) y enseña el texto de su región viva.
    for (const cell of cells) expect(cell).toHaveTextContent(note)
    expect(cells[0]).toHaveTextContent(live('round'))
    expect(cells[1]).toHaveTextContent(live('voteSaved'))
    // Volver al modo normal la quita.
    await user.click(screen.getByRole('switch', { name: t('dev.gallery.controls.serious') }))
    for (const cell of cells) expect(cell).not.toHaveTextContent(note)
  })

  it('RD-VIS-03: pinta cada componente de §3.3 en su bloque, en el orden del registro', async () => {
    await renderGallery()
    for (const { id, key } of COMPONENT_ANCHORS) {
      const block = document.getElementById(id)
      expect(block, id).not.toBeNull()
      expect(within(block!).getAllByRole('heading', { level: 3 })[0]!.textContent).toBe(
        t(`dev.gallery.components.${key}`),
      )
    }
    const byId = (id: string) => document.getElementById(id)!
    for (const variant of ['cta', 'brand', 'white', 'outline'])
      expect(byId('boton').querySelectorAll(`[data-variant="${variant}"]`).length, variant).toBeGreaterThan(0)
    expect(within(byId('opcion-menu')).getAllByRole('menuitem').length).toBeGreaterThanOrEqual(4)
    expect(within(byId('pestanas')).getAllByRole('tablist').length).toBeGreaterThan(0)
    expect(within(byId('chip-filtro')).getAllByRole('button', { pressed: true }).length).toBeGreaterThan(0)
    expect(byId('sello').querySelectorAll('[data-stamp]').length).toBeGreaterThanOrEqual(4)
    expect(within(byId('ficha')).getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(within(byId('casilla')).getAllByRole('option').length).toBeGreaterThanOrEqual(8)
    expect(within(byId('fila')).getAllByRole('article').length).toBeGreaterThanOrEqual(4)
    expect(within(byId('tesela')).getAllByRole('term').length).toBeGreaterThan(0)
    expect(within(byId('onda')).getAllByRole('slider').length).toBeGreaterThanOrEqual(4)
    expect(byId('ventana').querySelectorAll('[data-frame="title"]').length).toBeGreaterThanOrEqual(4)
    expect(byId('anunciador').querySelectorAll('[data-announcer]').length).toBeGreaterThanOrEqual(2)
    expect(byId('aviso').querySelectorAll('[data-tone]').length).toBeGreaterThanOrEqual(4)
    expect(within(byId('medidor')).getAllByRole('meter').length).toBeGreaterThanOrEqual(4)
    expect(byId('esqueleto').querySelectorAll('[data-skeleton]').length).toBeGreaterThan(0)
    expect(within(byId('reloj')).getAllByRole('timer')).toHaveLength(5)
    expect(within(byId('portada')).getAllByRole('img', { name: /Disco/ })).toHaveLength(3)
  })

  it('RD-VIS-03: cada bloque enseña los estados de su matriz y dice por qué no enseña el resto', async () => {
    await renderGallery()
    // La matriz cubre los componentes de §3.3 de la galería.
    const inMatrix = COMPONENT_ANCHORS.filter((anchor) => anchor.matrix)
    expect(Object.keys(STATE_MATRIX).sort()).toEqual(inMatrix.map(({ key }) => key).sort())
    for (const { id, key } of inMatrix) {
      const block = document.getElementById(id)!
      for (const state of STATES) {
        const coverage = STATE_MATRIX[key as keyof typeof STATE_MATRIX][state]
        const cells = [...block.querySelectorAll<HTMLElement>(`figure[data-state="${state}"]`)]
        expect(cells.length, `${id} · ${state}`).toBeGreaterThan(0)
        for (const cell of cells) expect(cell.dataset.coverage, `${id} · ${state}`).toBe(coverage.kind)
        if (coverage.kind === 'notApplicable') {
          expect(cells[0], `${id} · ${state}`).toHaveTextContent(
            t(`dev.gallery.matrix.reasons.${coverage.reason}`),
          )
          expect(cells[0], `${id} · ${state}`).toHaveTextContent(t('dev.gallery.matrix.notApplicable'))
        }
      }
    }
  })

  it('RD-VIS-03: los estados que se enseñan están forzados de verdad en su pieza', async () => {
    await renderGallery()
    const cell = (id: string, state: string) =>
      document.getElementById(id)!.querySelector<HTMLElement>(`figure[data-state="${state}"]`)!
    // Botón: los 8 en las cuatro variantes.
    const buttons = document.getElementById('boton')!
    for (const state of ['hover', 'focus', 'pressed'])
      expect(buttons.querySelectorAll(`[data-force-state="${state}"]`).length, state).toBeGreaterThanOrEqual(
        4,
      )
    expect(buttons.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThanOrEqual(4)
    expect(buttons.querySelectorAll('[data-status="success"]').length).toBeGreaterThanOrEqual(4)
    expect(buttons.querySelectorAll('[data-status="error"]').length).toBeGreaterThanOrEqual(4)
    expect(buttons.querySelectorAll('[aria-disabled="true"]:not([aria-busy])').length).toBeGreaterThanOrEqual(
      4,
    )
    // Opción de menú, pestañas, chip y casilla: los forzados y los deshabilitados.
    for (const state of ['hover', 'focus', 'pressed']) {
      expect(cell('opcion-menu', state).querySelector(`[data-force-state="${state}"]`), state).not.toBeNull()
      expect(cell('pestanas', state).querySelector(`[data-force-state="${state}"]`), state).not.toBeNull()
      expect(cell('chip-filtro', state).querySelector(`[data-force-state="${state}"]`), state).not.toBeNull()
      expect(cell('casilla', state).querySelector(`[data-force-state="${state}"]`), state).not.toBeNull()
      expect(cell('onda', state).querySelector(`[data-force-state="${state}"]`), state).not.toBeNull()
    }
    expect(cell('opcion-menu', 'disabled').querySelector('[data-disabled]')).not.toBeNull()
    expect(cell('pestanas', 'disabled').querySelector('[aria-disabled="true"]')).not.toBeNull()
    expect(cell('chip-filtro', 'disabled').querySelector('button:disabled')).not.toBeNull()
    expect(cell('casilla', 'disabled').querySelector('[data-voted]')).not.toBeNull()
    expect(cell('casilla', 'loading').querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(cell('casilla', 'error').querySelector('[data-error]')).not.toBeNull()
    // Ficha: cargando y error.
    expect(cell('ficha', 'loading').querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(within(cell('ficha', 'error')).getByRole('alert')).toBeInTheDocument()
    // Fila: play pulsado, cargando, deshabilitado y error de carga (RF-PLAY-09).
    expect(cell('fila', 'pressed').querySelector('button[data-force-state="pressed"]')).not.toBeNull()
    expect(cell('fila', 'loading').querySelector('button[aria-busy="true"]')).not.toBeNull()
    expect(cell('fila', 'disabled').querySelector('[data-disabled]')).not.toBeNull()
    expect(within(cell('fila', 'error')).getByText(t('ui.entryRow.loadError'))).toBeInTheDocument()
    // Onda: cargando, deshabilitada y error.
    expect(cell('onda', 'loading').querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(cell('onda', 'disabled').querySelector('[aria-disabled="true"]')).not.toBeNull()
    expect(within(cell('onda', 'error')).getByRole('alert')).toBeInTheDocument()
    // Ventana: foco en cerrar, cuerpo que carga y cuerpo con error.
    expect(cell('ventana', 'focus').querySelector('button[data-force-state="focus"]')).not.toBeNull()
    expect(cell('ventana', 'loading').querySelector('[aria-busy="true"] [data-skeleton]')).not.toBeNull()
    expect(cell('ventana', 'error').querySelector('[role="alert"]')).not.toBeNull()
    // Aviso: botón de cerrar pulsado; éxito y error con su tono.
    expect(cell('aviso', 'pressed').querySelector('button[data-force-state="pressed"]')).not.toBeNull()
    expect(cell('aviso', 'success').querySelector('[data-tone="success"]')).not.toBeNull()
    expect(cell('aviso', 'error').querySelector('[data-tone="error"]')).not.toBeNull()
    // Medidor lleno y reloj agotado.
    expect(cell('medidor', 'success').querySelector('[data-full]')).not.toBeNull()
    expect(cell('reloj', 'error').querySelector('[data-phase="ended"]')).not.toBeNull()
  })

  it('RNF-A11Y-03 / RD-MOT-03: el interruptor «Reducir movimiento» pone data-motion="reduced" en <html>', async () => {
    const user = userEvent.setup()
    await renderGallery()
    const toggle = screen.getByRole('switch', { name: t('dev.gallery.controls.reducedMotion') })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduced')
    // La crónica y las piezas con bucle se quedan quietas: lo comprueban sus propios tests y el E2E.
    await act(async () => {})
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

  it('los botones de la demo lanzan avisos de verdad, que pinta la zona del marco (no una propia)', async () => {
    const user = userEvent.setup()
    await renderGallery()
    await user.click(screen.getByRole('button', { name: t('dev.gallery.arena.toast.launchError') }))
    expect(useToasts.getState().toasts).toMatchObject([{ tone: 'error' }])
    // Sin el marco (`RootLayout`), la galería no tiene zona de avisos: no monta una segunda.
    expect(screen.queryByRole('region', { name: t('ui.toast.region') })).toBeNull()
  })
})

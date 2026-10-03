import { expect, type Page, test } from '@playwright/test'
import { collectErrors, expectVisibleFocus, focusRingClippedBy, openGallery } from './support'

/**
 * Galería `/dev/galeria` (tareas 0.9, 0.22 y 0.25, `RD-VIS-03`): solo existe en desarrollo, y por eso
 * los E2E corren contra el servidor de Vite. Comprueba que están todas las secciones del índice (el
 * registro de `ui/gallery/sections`), cada una con su ancla y su título, sin errores de la página.
 */

const SECTIONS = [
  { id: 'base', name: 'Base de la arena' },
  { id: 'componentes', name: 'Componentes' },
] as const

/** Bloques de la sección «Base» (tarea 0.22). */
const BASE = [
  { id: 'base-paleta', name: 'Paleta' },
  { id: 'base-contraste', name: 'Contraste' },
  { id: 'base-tipografia', name: 'Tipografía' },
  { id: 'base-escala', name: 'Escala' },
  { id: 'base-forma', name: 'Forma' },
  { id: 'base-primitivas', name: 'Primitivas' },
  { id: 'base-cursor', name: 'Cursor de juego' },
] as const

/** Componentes de §3.3, en su orden (tarea 0.25). */
const COMPONENTS = [
  { id: 'boton', name: 'Botón' },
  { id: 'opcion-menu', name: 'Opción de menú' },
  { id: 'pestanas', name: 'Pestañas' },
  { id: 'chip-dato', name: 'Chip de dato' },
  { id: 'chip-filtro', name: 'Chip de filtro' },
  { id: 'sello', name: 'Sello de goma' },
  { id: 'ficha', name: 'Ficha de luchador' },
  { id: 'casilla', name: 'Casilla de entrada' },
  { id: 'fila', name: 'Fila de entrada' },
  { id: 'tesela', name: 'Tesela' },
  { id: 'onda', name: 'Forma de onda' },
  { id: 'ventana', name: 'Ventana (modal)' },
  { id: 'anunciador', name: 'Anunciador' },
  { id: 'aviso', name: 'Aviso' },
  { id: 'medidor', name: 'Medidor' },
  { id: 'esqueleto', name: 'Esqueleto' },
  { id: 'reloj', name: 'Reloj de ronda' },
  { id: 'placa', name: 'Placa de título' },
  { id: 'portada', name: 'Portada y medallas' },
] as const

test('RD-VIS-03: la galería pinta todas sus secciones y bloques, en el orden del índice', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await openGallery(page)
  await expect(page).toHaveTitle('Galería · Beat Battle')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Galería' })).toBeVisible()

  // El índice enlaza exactamente estas anclas, en este orden: una sección nueva sin test hace fallar.
  const index = main.getByRole('navigation', { name: 'Índice de la galería' })
  const links = await index
    .getByRole('link')
    .evaluateAll((anchors) =>
      anchors.map((a) => ({ id: a.getAttribute('href')?.slice(1), name: a.textContent })),
    )
  const expected = [SECTIONS[0], ...BASE, SECTIONS[1], ...COMPONENTS]
  expect(links).toEqual(expected.map(({ id, name }) => ({ id, name })))

  // Cada ancla es una sección pintada (con tamaño) cuyo título es el del índice.
  const sections = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const section = document.querySelector(`main section#${id}`)
        const heading = section?.querySelector(':scope > h2, :scope > h3')
        const box = section?.getBoundingClientRect()
        return { id, title: heading?.textContent, painted: !!box && box.width > 0 && box.height > 0 }
      }),
    expected.map(({ id }) => id),
  )
  for (const [i, { id, name }] of expected.entries())
    expect(sections[i], id).toEqual({ id, title: name, painted: true })

  // Un enlace del índice lleva a su sección.
  await index.getByRole('link', { name: 'Reloj de ronda' }).click()
  await expect(page).toHaveURL(/#reloj$/)
  await expect(main.locator('section#reloj')).toBeInViewport()
  expect(errors).toEqual([])
})

test('RD-MOT-03: el interruptor «Reducir movimiento» pone data-motion="reduced" y se deshace al salir', async ({
  page,
}) => {
  await openGallery(page)
  const html = page.locator('html')
  const toggle = page.getByRole('switch', { name: /Reducir movimiento/ })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(html).toHaveAttribute('data-motion', 'reduced')

  // Al salir de la galería (Esc vuelve al menú) el ajuste de prueba no se arrastra al resto de la app.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
  await expect(html).not.toHaveAttribute('data-motion', 'reduced')
})

test('RD-VIS-03: el modo serio quita el espectáculo (anunciador, rayos) y deja la información', async ({
  page,
}) => {
  await openGallery(page)
  const announcer = page.locator('section#anunciador [data-fx]').first()
  await expect(announcer).toBeVisible()
  await page.getByRole('switch', { name: /Modo serio/ }).click()
  await expect(announcer).toBeHidden()
  await expect(page.locator('section#anunciador [data-announcer]').first()).toBeAttached()
  // La tesela no se queda en un marco vacío: dice que se calla y lo que lee la región viva.
  const notes = page.locator('section#anunciador figure').getByText(/^Modo serio: el anunciador se calla/)
  await expect(notes).toHaveCount(2)
  for (const note of await notes.all()) await expect(note).toBeVisible()
  await expect(page.locator('section#anunciador').getByText('La región viva lee: «Ronda 01»')).toBeVisible()
})

test('RNF-A11Y-01: el anillo de foco del título de una fila de entrada se ve entero', async ({ page }) => {
  await openGallery(page)
  const link = page.locator('section#fila').getByRole('link', { name: 'Neón en Sants' }).first()
  await link.scrollIntoViewIfNeeded()
  await page
    .locator('section#fila')
    .getByRole('button', { name: /Reproducir «Neón en Sants»/ })
    .first()
    .focus()
  await page.keyboard.press('Tab')
  await expectVisibleFocus(link)
  expect(await focusRingClippedBy(link)).toBeNull()
})

/**
 * Lo que pintan los dos rótulos del anunciador frente al marco de su tesela: el aire a cada lado y si
 * el texto desborda su caja. Del display, los glifos con la mitad del contorno y la sombra dura; de la
 * etiqueta girada, su caja ya girada.
 */
function announcerAir(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const probe = document.createElement('div')
    probe.style.width = 'var(--bb-space-3)'
    document.body.append(probe)
    const space3 = probe.getBoundingClientRect().width
    probe.remove()
    const viewport = document.documentElement.clientWidth
    const measure = (painted: DOMRect, piece: HTMLElement) => {
      const frame = piece.closest<HTMLElement>('[data-frame]')!.getBoundingClientRect()
      return {
        left: painted.left - frame.left,
        right: frame.right - painted.right,
        overflow: piece.scrollWidth - piece.clientWidth,
        inViewport: painted.left >= 0 && painted.right <= viewport,
      }
    }
    const word = document.querySelector<HTMLElement>('section#anunciador [data-announcer="display"] p')!
    const range = document.createRange()
    range.selectNodeContents(word)
    const glyphs = range.getBoundingClientRect()
    const style = getComputedStyle(word)
    const halfStroke = Number.parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) / 2 || 0
    const [shadowX = 0] = (style.textShadow.match(/-?[\d.]+px/g) ?? []).map(Number.parseFloat)
    const left = glyphs.left - halfStroke - Math.max(0, -shadowX)
    const right = glyphs.right + halfStroke + Math.max(0, shadowX)
    const tag = document.querySelector<HTMLElement>('section#anunciador [data-announcer="tag"] [data-tag]')!
    return {
      space3,
      display: measure(new DOMRect(left, glyphs.top, right - left, glyphs.height), word),
      tag: measure(tag.getBoundingClientRect(), tag),
    }
  })
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
]) {
  test(`RD-VIS-02 e: los rótulos del anunciador caben en su tesela con aire a los dos lados (${viewport.width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openGallery(page)
    await page.locator('section#anunciador').scrollIntoViewIfNeeded()
    const { space3, ...pieces } = await announcerAir(page)
    for (const [name, air] of Object.entries(pieces)) {
      expect(air.overflow, `${name}: el rótulo desborda su caja`).toBeLessThanOrEqual(1)
      expect(air.inViewport, `${name}: el rótulo se sale de la ventana`).toBe(true)
      // Ni la sombra dura ni la esquina de la etiqueta girada tocan el marco: `--bb-space-3` como poco.
      expect(air.left, `${name}: aire a la izquierda`).toBeGreaterThanOrEqual(space3)
      expect(air.right, `${name}: aire a la derecha`).toBeGreaterThanOrEqual(space3)
    }
  })
}

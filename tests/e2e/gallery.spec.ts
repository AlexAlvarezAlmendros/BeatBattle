import { expect, test } from '@playwright/test'
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

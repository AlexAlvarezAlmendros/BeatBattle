import { expect, test } from '@playwright/test'
import { collectErrors, openGallery } from './support'

/**
 * Galería `/dev/galeria` (tarea 0.9, `RD-VIS-03`): solo existe en desarrollo, y por eso los E2E corren
 * contra el servidor de Vite. Comprueba que están todas las secciones del índice, cada una con su
 * ancla y su título, sin errores de la página.
 */

const SECTIONS = [
  { id: 'color', name: 'Color' },
  { id: 'tipografia', name: 'Tipografía' },
  { id: 'espaciado', name: 'Espaciado' },
  { id: 'radios', name: 'Radios' },
  { id: 'sombras', name: 'Sombras' },
  { id: 'movimiento', name: 'Movimiento' },
  { id: 'componentes', name: 'Componentes' },
  { id: 'layout', name: 'Layout del sello' },
] as const

/** Componentes base de §3.3, en su orden (cuelgan de «Componentes»). */
const COMPONENTS = [
  { id: 'boton', name: 'Botón' },
  { id: 'chip', name: 'Chip' },
  { id: 'tarjeta', name: 'Tarjeta' },
  { id: 'tesela', name: 'Tesela de dato' },
  { id: 'rotulo', name: 'Rótulo de sección' },
  { id: 'onda', name: 'Forma de onda' },
  { id: 'fila', name: 'Fila de entrada' },
  { id: 'modal', name: 'Modal' },
  { id: 'aviso', name: 'Aviso' },
  { id: 'xp', name: 'Barra de XP' },
  { id: 'esqueleto', name: 'Esqueleto de carga' },
  { id: 'cuenta-atras', name: 'Cuenta atrás' },
] as const

/** Piezas del layout del sello (tarea 0.7; cuelgan de «Layout del sello»). */
const LAYOUT = [
  { id: 'isla', name: 'Isla de navegación' },
  { id: 'pie', name: 'Pie del sello' },
  { id: 'titular', name: 'Titular del hero' },
  { id: 'rotulos', name: 'Rótulos laterales' },
  { id: 'rejilla', name: 'Rejilla y viñeta' },
  { id: 'marquee', name: 'Banda de marquee' },
  { id: 'orbes', name: 'Orbes del fondo' },
  { id: 'cristal', name: 'GlassSurface' },
] as const

test('RD-VIS-03: la galería pinta todas sus secciones, componentes y piezas del layout', async ({ page }) => {
  const errors = collectErrors(page)
  await openGallery(page)
  await expect(page).toHaveTitle('Galería de componentes · Beat Battle')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Galería de componentes' })).toBeVisible()

  // El índice enlaza exactamente estas anclas, en este orden: una sección nueva sin test hace fallar.
  const index = main.getByRole('navigation', { name: 'Índice de la galería' })
  const expected = [
    ...SECTIONS.map((item) => ({ ...item, level: 'H2' })),
    ...COMPONENTS.map((item) => ({ ...item, level: 'H3' })),
    ...LAYOUT.map((item) => ({ ...item, level: 'H3' })),
  ]
  const links = await index
    .getByRole('link')
    .evaluateAll((anchors) =>
      anchors.map((a) => ({ id: a.getAttribute('href')?.slice(1), name: a.textContent })),
    )
  // Orden del índice: cada sección, con sus componentes o piezas del layout colgando de ella.
  const indexOrder = SECTIONS.flatMap((section) => [
    section,
    ...(section.id === 'componentes' ? COMPONENTS : section.id === 'layout' ? LAYOUT : []),
  ])
  expect(links).toEqual(indexOrder.map(({ id, name }) => ({ id, name })))

  // Cada ancla es una sección pintada (con tamaño) cuyo título empieza por el nombre del índice (el de
  // la tarjeta añade la variante: «Tarjeta · cristal»). Se lee todo de una vez: la galería es pesada.
  const sections = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const section = document.querySelector(`main section#${id}`)
        const heading = section?.querySelector(':scope > h2, :scope > h3')
        const box = section?.getBoundingClientRect()
        return {
          id,
          level: heading?.tagName,
          title: heading?.textContent,
          painted: !!box && box.width > 0 && box.height > 0,
        }
      }),
    expected.map(({ id }) => id),
  )
  for (const [i, { id, name, level }] of expected.entries()) {
    const section = sections[i]
    expect(section, id).toMatchObject({ id, level, painted: true })
    expect(section?.title, id).toMatch(new RegExp(`^${name}`))
  }

  // Un enlace del índice lleva a su sección.
  await index.getByRole('link', { name: 'Cuenta atrás' }).click()
  await expect(page).toHaveURL(/#cuenta-atras$/)
  await expect(main.locator('section#cuenta-atras')).toBeInViewport()

  expect(errors).toEqual([])
})

test('RD-MOT-03: el interruptor «Reducir movimiento» de la galería pone data-motion="reduced" y se deshace al salir', async ({
  page,
}) => {
  await openGallery(page)
  const html = page.locator('html')
  const toggle = page.getByRole('switch', { name: /Reducir movimiento/ })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(html).toHaveAttribute('data-motion', 'reduced')

  // Al salir de la galería el ajuste de prueba no se arrastra al resto de la app.
  await page.getByRole('banner').getByRole('link', { name: 'Semana', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(html).not.toHaveAttribute('data-motion', 'reduced')
})

import { expect, test } from '@playwright/test'
import { collectErrors, expectVisibleFocus, focusRingClippedBy, openGallery } from './support'

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

test('RNF-A11Y-01: el anillo de foco del título de la fila de entrada se ve entero', async ({ page }) => {
  await openGallery(page)
  const row = page.locator('section#fila').getByRole('article', { name: 'Tigre púrpura' }).last()
  const link = row.getByRole('link', { name: 'Tigre púrpura' })
  // Con el teclado: del play de la fila al enlace del título.
  await row.getByRole('button', { name: /Reproducir/ }).focus()
  await page.keyboard.press('Tab')
  await expectVisibleFocus(link)
  expect(await focusRingClippedBy(link)).toBeNull()
})

test.describe('móvil (390 × 844, táctil)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('§3.3: el botón icono sigue siendo un círculo en móvil (ancho igual al alto)', async ({ page }) => {
    await openGallery(page)
    const sizes = await page.locator('section#boton [data-variant="icon"]').evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { width: Math.round(box.width), height: Math.round(box.height) }
      }),
    )
    expect(sizes.length).toBeGreaterThan(0)
    for (const size of sizes) expect(size.width, JSON.stringify(sizes)).toBe(size.height)
  })

  test('RNF-A11Y-01: el anillo de foco del título de la fila de entrada se ve entero en móvil', async ({
    page,
  }) => {
    await openGallery(page)
    const row = page.locator('section#fila').getByRole('article', { name: 'Tigre púrpura' }).last()
    const link = row.getByRole('link', { name: 'Tigre púrpura' })
    await link.focus()
    expect(await focusRingClippedBy(link)).toBeNull()
  })

  test('RNF-A11Y-09: los chips de un grupo de varias filas conservan su área de 44 px', async ({ page }) => {
    await openGallery(page)
    const group = page.locator('section#chip').getByRole('group')
    // `elementFromPoint` solo ve lo que está en la ventana.
    await group.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    const chips = group.getByRole('button')
    const rows = await chips.evaluateAll(
      (elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().top))).size,
    )
    // Que el grupo salte de línea: si no, el test no mediría nada.
    expect(rows).toBeGreaterThan(1)
    // Área efectiva: lo que hay 21 px por encima y por debajo del centro de cada chip es el propio chip.
    const short = await chips.evaluateAll((elements) =>
      elements
        .filter((element) => {
          const box = element.getBoundingClientRect()
          const x = box.left + box.width / 2
          const y = box.top + box.height / 2
          return [y - 21, y + 21].some(
            (at) => document.elementFromPoint(x, at)?.closest('button') !== element,
          )
        })
        .map((element) => element.textContent),
    )
    expect(short).toEqual([])
  })
})

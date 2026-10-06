import { expect, type Locator, type Page, test } from '@playwright/test'
import { collectErrors, expectVisibleFocus, focusRingClippedBy, openGallery } from './support'

/**
 * Galería `/dev/galeria` (tareas 0.9, 0.22 y 0.25, `RD-VIS-03`): solo existe en desarrollo, y por eso
 * los E2E corren contra el servidor de Vite. Comprueba que están todas las secciones del índice (el
 * registro de `ui/gallery/sections`), cada una con su ancla y su título, sin errores de la página.
 */

const SECTIONS = [
  { id: 'base', name: 'Base de la arena' },
  { id: 'componentes', name: 'Componentes' },
  { id: 'sonido', name: 'Sonido' },
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

/** Bloques de la sección «Sonido» (tarea 1.4): el banco de escucha de los efectos. */
const SOUND = [
  { id: 'sonido-ui', name: 'Interfaz' },
  { id: 'sonido-stars', name: 'Estrellas' },
  { id: 'sonido-game', name: 'Voto y progreso' },
] as const

test('RD-VIS-03: la galería pinta todas sus secciones y bloques, en el orden del índice', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await openGallery(page)
  await expect(page).toHaveTitle('Galería · Beat Battle')
  const main = page.getByRole('main')
  // En escritorio el título se ve en la placa del HUD y el `<h1>` es para los lectores de pantalla.
  await expect(main.getByRole('heading', { level: 1, name: 'Galería' })).toBeAttached()

  // El índice enlaza exactamente estas anclas, en este orden: una sección nueva sin test hace fallar.
  const index = main.getByRole('navigation', { name: 'Índice de la galería' })
  const links = await index
    .getByRole('link')
    .evaluateAll((anchors) =>
      anchors.map((a) => ({ id: a.getAttribute('href')?.slice(1), name: a.textContent })),
    )
  const expected = [SECTIONS[0], ...BASE, SECTIONS[1], ...COMPONENTS, SECTIONS[2], ...SOUND]
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

/**
 * El título de la galería sale una sola vez (acta del jurado de la 0.28, grupo 8; tercer pase, L4): con
 * la placa del HUD («DESARROLLO · GALERÍA», desde 721 px) el `<h1>` queda para los lectores de pantalla,
 * como en las pantallas interiores; el rótulo y el resumen se siguen viendo. En móvil el HUD no lleva
 * placa y el `<h1>` se ve.
 */
for (const viewport of [
  { width: 1440, height: 900, plate: true },
  { width: 721, height: 900, plate: true },
  { width: 390, height: 844, plate: false },
]) {
  test(`RD-VIS-02 e: el título de la galería sale una sola vez (${viewport.width} px)`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openGallery(page)
    const main = page.getByRole('main')
    const heading = main.getByRole('heading', { level: 1, name: 'Galería' })
    await expect(heading).toBeAttached()
    const box = (await heading.boundingBox())!
    if (viewport.plate) {
      await expect(page.getByRole('banner').locator('[data-frame="title"]')).toContainText('Galería')
      expect(box.width * box.height, 'el <h1> se ve además de la placa del HUD').toBeLessThanOrEqual(1)
    } else {
      expect(box.height, 'sin placa en el HUD, el <h1> se ve').toBeGreaterThan(20)
    }
    await expect(main.getByText('Beat Battle · banco de pruebas de la arena')).toBeVisible()
    await expect(main.getByText(/^La base de la arena \(paleta/)).toBeVisible()
  })
}

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

/**
 * La etiqueta girada del anunciador, como en la maqueta `03-jurado` (`03b-jurado-votado-1440x900.png`):
 * «¡VOTO GUARDADO!» va en la etiqueta roja con texto blanco (`Tag` `cta`, `--bb-red-cta`, 4,75:1; §3.3
 * v0.6.7), no en la roja de marca con texto negro ni en la blanca (esa es la de «¡A ESCUCHAR!»,
 * `03-jurado-escuchando`).
 */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`RD-VIS-02 e: la etiqueta girada del anunciador («¡VOTO GUARDADO!») es roja con texto blanco (cta), como en 03-jurado (${viewport.width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openGallery(page)
    const tag = page.locator('section#anunciador [data-announcer="tag"] [data-tag]')
    await expect(tag).toHaveText('¡Voto guardado!')
    await expect(tag).toHaveAttribute('data-tag', 'cta')
    const paint = await tag.evaluate((element) => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, color: style.color }
    })
    expect(paint).toEqual({ background: 'rgb(230, 0, 58)', color: 'rgb(255, 255, 255)' })
  })
}

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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
]) {
  test(`RD-VIS-03 / §3.3: la casilla «SÍ | NO» del chip de filtro no sale de su marco en ningún estado (${viewport.width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openGallery(page)
    const chips = page.locator('section#chip-filtro button[aria-pressed]')
    expect(await chips.count()).toBeGreaterThanOrEqual(6)
    const boxes = await chips.evaluateAll((elements) =>
      elements.map((chip) => {
        const box = chip.getBoundingClientRect()
        const label = chip.querySelector(':scope > span:not([aria-hidden])')!.getBoundingClientRect()
        const yesNo = chip.querySelector(':scope > [aria-hidden="true"]:not([data-cursor-ring])')!
        const marks = yesNo.getBoundingClientRect()
        const style = getComputedStyle(chip)
        return {
          state: chip.closest('[data-state]')?.getAttribute('data-state') ?? 'selected',
          // Caja de contenido del chip: dentro del relleno, lejos del chaflán y del anillo del cursor.
          left: box.left + Number.parseFloat(style.paddingLeft),
          right: box.right - Number.parseFloat(style.paddingRight),
          top: box.top,
          bottom: box.bottom,
          label: { left: label.left, right: label.right },
          marks: { left: marks.left, right: marks.right, top: marks.top, bottom: marks.bottom },
        }
      }),
    )
    for (const chip of boxes) {
      expect(chip.marks.right, `${chip.state}: «SÍ | NO» se sale por la derecha`).toBeLessThanOrEqual(
        chip.right + 0.5,
      )
      expect(chip.marks.top, `${chip.state}: «SÍ | NO» se sale por arriba`).toBeGreaterThanOrEqual(chip.top)
      expect(chip.marks.bottom, `${chip.state}: «SÍ | NO» se sale por abajo`).toBeLessThanOrEqual(chip.bottom)
      expect(chip.label.left, `${chip.state}: la etiqueta se sale por la izquierda`).toBeGreaterThanOrEqual(
        chip.left - 0.5,
      )
      expect(chip.label.right, `${chip.state}: la etiqueta pisa «SÍ | NO»`).toBeLessThanOrEqual(
        chip.marks.left + 0.5,
      )
    }
  })
}

/**
 * Espaciado de texto de WCAG 1.4.12 (el de `fit.spec.ts`: interlineado 1,5, letras 0,12 em, palabras
 * 0,16 em y párrafos 2 em, con `!important`), puesto desde la carga, como lo pone quien lo necesita.
 */
const TEXT_SPACING = `*, *::before, *::after { line-height: 1.5 !important; letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`

async function withTextSpacing(page: Page): Promise<void> {
  await page.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = css
      document.head.append(style)
    })
  }, TEXT_SPACING)
}

/**
 * Las filas de entrada de la galería: los textos (título y subtítulo) que no caben en su caja (se cortan
 * con «…» o se salen) y dónde cae el resultado (posición, nota y medalla) respecto del enlace del título
 * y de la fila.
 */
function entryRows(page: Page) {
  return page.locator('section#fila article').evaluateAll((rows) =>
    rows.map((row) => {
      const state = row.closest('[data-state]')?.getAttribute('data-state') ?? '?'
      const heading = row.querySelector<HTMLElement>(':is(h2, h3, h4)')!
      const info = heading.parentElement!.getBoundingClientRect()
      const box = row.getBoundingClientRect()
      const cut = [...row.querySelectorAll<HTMLElement>(':is(h2, h3, h4), :is(h2, h3, h4) > span, p')]
        .filter((text) => text.scrollWidth > text.clientWidth + 1)
        .map((text) => `«${text.textContent}» ${text.scrollWidth} > ${text.clientWidth}`)
      const result = row.querySelector('[data-entry-result]')?.getBoundingClientRect()
      return {
        row: `${state}: ${heading.textContent}`,
        cut,
        infoInside: info.left >= box.left && info.right <= box.right + 0.5,
        result: result && {
          below: result.top >= info.bottom - 1,
          inside: result.left >= box.left && result.right <= box.right + 0.5,
        },
      }
    }),
  )
}

/**
 * Fila de entrada estrecha (guía §3.3 v0.6.6; WCAG 1.4.10 y 1.4.12): a 320 px, y a 390 táctil con el
 * espaciado de texto, el título se cortaba con «…» hasta no leerse («Neón en Sants» → «Neó…», 46 de
 * 109 px) y el subtítulo también («S40 · …»), en reposo, hover y foco, mientras posición, nota y medalla
 * se quedaban la columna. Ahora título y subtítulo parten en líneas, sin «…», y el resultado baja a una
 * segunda fila. A 1440 con el espaciado la fila es ancha y el resultado se queda a la derecha, pero
 * tampoco se corta nada.
 */
for (const { viewport, touch, spacing, narrow } of [
  { viewport: { width: 320, height: 568 }, touch: false, spacing: false, narrow: true },
  { viewport: { width: 320, height: 568 }, touch: false, spacing: true, narrow: true },
  { viewport: { width: 390, height: 844 }, touch: true, spacing: true, narrow: true },
  { viewport: { width: 1440, height: 900 }, touch: false, spacing: true, narrow: false },
]) {
  const input = touch ? 'táctil' : 'con teclado'
  const name = `${viewport.width} × ${viewport.height} ${input}${spacing ? ' y el espaciado de 1.4.12' : ''}`
  test.describe(`fila de entrada a ${name}`, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })

    test(`RD-VIS-05 / WCAG 1.4.10 y 1.4.12: el título y el subtítulo de la fila de entrada no se cortan${narrow ? ' y el resultado baja a una segunda fila' : ''}`, async ({
      page,
    }) => {
      if (spacing) await withTextSpacing(page)
      await openGallery(page)
      await page.evaluate(() => document.fonts.ready)
      if (spacing)
        expect(await page.evaluate(() => getComputedStyle(document.body).letterSpacing)).not.toBe('normal')
      const rows = await entryRows(page)
      expect(rows.length).toBeGreaterThanOrEqual(8)
      for (const row of rows) {
        expect(row.cut, `${row.row}: texto cortado`).toEqual([])
        expect(row.infoInside, `${row.row}: el título se sale de la fila`).toBe(true)
        if (!row.result) continue
        expect(row.result.inside, `${row.row}: el resultado se sale de la fila`).toBe(true)
        if (narrow) expect(row.result.below, `${row.row}: el resultado no baja a una segunda fila`).toBe(true)
      }
      // Hay filas con resultado (posición y nota) en todas las anchuras.
      expect(rows.filter((row) => row.result).length).toBeGreaterThanOrEqual(4)
    })
  })
}

/**
 * Lo que les sobra al anillo (contorno a `outline-offset`, con su trazo) y al halo (la extensión de
 * `--bb-focus-halo`) del enlace de título y subtítulo hasta el borde de su fila, que lleva por dentro un
 * filete de `--bb-stroke-hair`: negativo si se salen de la fila o pisan el filete. Y el área efectiva
 * del enlace en vertical (lo que `elementFromPoint` da por suyo por encima y por debajo de su centro).
 */
function linkFocusAir(link: Locator) {
  return link.evaluate((element) => {
    // `elementFromPoint` solo ve lo que está en la ventana.
    element.scrollIntoView({ block: 'center' })
    const probe = document.createElement('div')
    probe.style.width = 'var(--bb-stroke-hair)'
    document.body.append(probe)
    const hair = probe.getBoundingClientRect().width
    probe.remove()
    const style = getComputedStyle(element)
    const ring = Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.outlineWidth)
    // `rgba(255, 0, 60, 0.35) 0px 0px 0px 10px`: la cuarta longitud es la extensión.
    const spread = Number.parseFloat([...style.boxShadow.matchAll(/(-?[\d.]+)px/g)][3]?.[1] ?? '0')
    const reach = Math.max(ring, spread)
    const box = element.getBoundingClientRect()
    const row = element.closest('article')!.getBoundingClientRect()
    const owns = (y: number) =>
      document.elementFromPoint(box.left + box.width / 2, y)?.closest('a') === element
    let up = 0
    while (up < 30 && owns(box.top + box.height / 2 - up - 1)) up++
    let down = 0
    while (down < 30 && owns(box.top + box.height / 2 + down + 1)) down++
    return {
      halo: spread,
      ring,
      air: {
        top: +(box.top - reach - (row.top + hair)).toFixed(1),
        bottom: +(row.bottom - hair - (box.bottom + reach)).toFixed(1),
        left: +(box.left - reach - (row.left + hair)).toFixed(1),
        right: +(row.right - hair - (box.right + reach)).toFixed(1),
      },
      target: up + down + 1,
    }
  })
}

/**
 * El foco del enlace de título y subtítulo de la fila de entrada (§3.3 v0.6.6: «su anillo de foco cabe
 * dentro de la fila»): con el enlace a 44 px de alto en una fila de 58, el anillo (4 + 3 px) quedaba
 * justo encima del borde de la fila y el halo de 10 px asomaba 3 px por fuera. Ahora el enlace mide lo
 * que su texto, su objetivo sigue teniendo 44 px de alto (por pseudoelemento, como el botón `sm`) y la
 * fila deja aire para el anillo y el halo también cuando el texto parte en líneas (estrecha, 1.4.12).
 * La fila sigue siendo un marcador de 56–58 px a 1440.
 */
for (const { viewport, touch, spacing } of [
  { viewport: { width: 1440, height: 900 }, touch: false, spacing: false },
  { viewport: { width: 390, height: 844 }, touch: true, spacing: false },
  { viewport: { width: 320, height: 568 }, touch: false, spacing: false },
  { viewport: { width: 1440, height: 900 }, touch: false, spacing: true },
  { viewport: { width: 390, height: 844 }, touch: true, spacing: true },
]) {
  const input = touch ? 'táctil' : 'con teclado'
  const name = `${viewport.width} × ${viewport.height} ${input}${spacing ? ' y el espaciado de 1.4.12' : ''}`
  test.describe(`foco de la fila de entrada a ${name}`, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })

    test('RNF-A11Y-01 / RNF-A11Y-09: el anillo y el halo del foco del título caben dentro de la fila y el enlace tiene 44 px de alto de objetivo', async ({
      page,
    }) => {
      if (spacing) await withTextSpacing(page)
      await openGallery(page)
      await page.evaluate(() => document.fonts.ready)
      const section = page.locator('section#fila')
      // El foco forzado de la galería (estado «Foco») y el de verdad, con el tabulador desde el play.
      const forced = section.locator('a[data-force-state="focus"]')
      await forced.scrollIntoViewIfNeeded()
      const link = section.getByRole('link', { name: 'Neón en Sants' }).first()
      await section
        .getByRole('button', { name: /Reproducir «Neón en Sants»/ })
        .first()
        .focus()
      await page.keyboard.press('Tab')
      await expectVisibleFocus(link)
      for (const [which, locator] of [
        ['forzado', forced],
        ['con el tabulador', link],
      ] as const) {
        const focus = await linkFocusAir(locator)
        expect(focus.halo, `${which}: el foco lleva el halo`).toBeGreaterThan(focus.ring)
        for (const [side, air] of Object.entries(focus.air))
          expect(air, `${which}: el anillo o el halo se sale por ${side}`).toBeGreaterThanOrEqual(0)
        expect(focus.target, `${which}: objetivo en vertical`).toBeGreaterThanOrEqual(44)
      }
      if (viewport.width === 1440 && !spacing) {
        // Marcador de 56–58 px (§3.3), también con error de audio.
        const heights = await section
          .locator('article')
          .evaluateAll((rows) => rows.map((row) => +row.getBoundingClientRect().height.toFixed(1)))
        for (const height of heights) {
          expect(height).toBeGreaterThanOrEqual(56)
          expect(height).toBeLessThanOrEqual(58)
        }
      }
    })
  })
}

/**
 * La medalla de la fila de entrada (§3.3 v0.6.6: «la medalla solo se oculta en táctil»): por debajo de
 * 720 px se ocultaba también con teclado y ratón (una ventana estrecha o ampliada al 200 %), y con
 * teclado y ratón no se esconde nada que informe (WCAG 1.4.4 y 1.4.10).
 */
for (const { viewport, touch, medal } of [
  { viewport: { width: 1440, height: 900 }, touch: false, medal: true },
  { viewport: { width: 390, height: 844 }, touch: false, medal: true },
  { viewport: { width: 390, height: 844 }, touch: true, medal: false },
]) {
  test.describe(`medalla de la fila de entrada a ${viewport.width} × ${viewport.height}${touch ? ' táctil' : ' con teclado'}`, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })

    test(`WCAG 1.4.4 / 1.4.10: la medalla de la fila de entrada ${medal ? 'se ve' : 'se oculta (móvil táctil)'}`, async ({
      page,
    }) => {
      await openGallery(page)
      const medals = page.locator('section#fila [data-entry-result] [role="img"]')
      expect(await medals.count()).toBeGreaterThanOrEqual(3)
      for (const item of await medals.all())
        if (medal) await expect(item).toBeVisible()
        else await expect(item).toBeHidden()
      // La posición y la nota se ven siempre.
      for (const result of await page.locator('section#fila [data-entry-result]').all())
        await expect(result).toBeVisible()
    })
  })
}

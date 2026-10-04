import { expect, type Page, test } from '@playwright/test'
import { open, openGallery, settle } from './support'

/**
 * Que nada se corte (tarea 0.28, jurado visual; `RD-VIS-02`, `RD-VIS-05`, guía §3.3 «Opción de menú»
 * y §2.17, reflow de WCAG 1.4.10):
 *
 * - **Placas del menú**: con cada placa elegida (crece a 31 px), y con las demás en reposo, ni la
 *   etiqueta ni el dato desbordan su caja y el dato y la tecla `[INTRO]` quedan dentro del corte del
 *   paralelogramo; también deshabilitadas (el motivo pasa a dos líneas antes que cortarse) y a 320 px.
 * - **Tildes**: las mayúsculas en display («GRÀCIA», «SALÓN», «PRÓXIMO», «PÚRPURA») no las recorta
 *   ningún antepasado por arriba (las cajas solo recortan en horizontal).
 * - **Galería a 390 y 320 px**: ninguna hoja de texto ni ninguna pieza (control, marco, placa) se sale de
 *   la ventana (salvo dentro de una fila que se desplaza, como las pestañas en móvil).
 */

interface PlateCut {
  plate: string
  problem: string
}

/**
 * Elige cada placa del menú (foco) y mide si su etiqueta, su dato o su tecla se cortan, en ella (la
 * elegida) y en las demás (en reposo, con el cursor en otra placa; jurado de la 0.28, tercer pase: de 721
 * a unos 765 px, «SONIDO · MOVIMIENTO» de AJUSTES en reposo se salía por el borde de la placa).
 */
function plateCuts(page: Page, selector = 'main [data-menu-plate]'): Promise<PlateCut[]> {
  return page.evaluate(async (scope) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const cuts: { plate: string; problem: string }[] = []
    const plates = [...document.querySelectorAll<HTMLElement>(scope)]
    const check = (plate: HTMLElement, state: string) => {
      const name = `${plate.querySelector('[data-plate-label]')?.textContent ?? '?'}${state}`
      const label = plate.querySelector<HTMLElement>('[data-plate-label]')!
      if (label.scrollWidth > label.clientWidth + 1)
        cuts.push({ plate: name, problem: `etiqueta ${label.scrollWidth} > ${label.clientWidth}` })
      const detail = plate.querySelector<HTMLElement>('[data-plate-detail]')
      if (detail && detail.scrollWidth > detail.clientWidth + 1)
        cuts.push({ plate: name, problem: `dato ${detail.scrollWidth} > ${detail.clientWidth}` })
      // El relleno del final es, como poco, el desplazamiento del paralelogramo más un margen: lo que
      // acaba antes de él queda dentro del corte. Se mide el texto (no la caja, que puede ser más ancha).
      const box = plate.getBoundingClientRect()
      const end = box.right - Number.parseFloat(getComputedStyle(plate).paddingRight)
      for (const piece of plate.querySelectorAll<HTMLElement>(
        'kbd, [data-plate-detail], [data-plate-extra]',
      )) {
        if (getComputedStyle(piece).display === 'none') continue
        const range = document.createRange()
        range.selectNodeContents(piece)
        for (const rect of [piece.getBoundingClientRect(), range.getBoundingClientRect()])
          if (rect.width > 0 && (rect.right > end + 1 || rect.left < box.left)) {
            const overflow = (rect.right - end).toFixed(1)
            cuts.push({
              plate: name,
              problem: `${piece.tagName.toLowerCase()} fuera del corte (${overflow} px)`,
            })
            break
          }
      }
    }
    for (const plate of plates) {
      plate.focus()
      await frame()
      // El ajuste de la etiqueta va en el fotograma siguiente al cambio de ancho (transición de 120 ms).
      await new Promise((done) => setTimeout(done, 250))
      await frame()
      check(plate, '')
      for (const other of plates) if (other !== plate) check(other, ' (en reposo)')
    }
    return [...new Map(cuts.map((cut) => [`${cut.plate}|${cut.problem}`, cut])).values()]
  }, selector)
}

/** Textos en display con tilde que algún antepasado recorta por arriba. */
function clippedAccents(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((targets) => {
    const clipped: string[] = []
    for (const element of document.querySelectorAll<HTMLElement>(targets)) {
      const text = element.textContent ?? ''
      if (!/[ÀÁÈÉÍÒÓÚÜàáèéíòóúü]/.test(text)) continue
      const range = document.createRange()
      range.selectNodeContents(element)
      const top = range.getBoundingClientRect().top
      for (
        let node: HTMLElement | null = element;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node)
        const clips =
          style.overflowY !== 'visible' ||
          style.clipPath !== 'none' ||
          /paint|strict|content/.test(style.contain)
        if (clips && top < node.getBoundingClientRect().top - 0.5) {
          clipped.push(
            `«${text.trim()}» recortado por ${node.tagName.toLowerCase()}.${String(node.className)}`,
          )
          break
        }
      }
    }
    return clipped
  }, selector)
}

const DISPLAY_TEXTS = '[data-plate-label], article h2, [data-accents], [data-accents] [data-plate-label]'

for (const viewport of [
  { width: 1440, height: 900, touch: false },
  { width: 390, height: 844, touch: true },
  { width: 320, height: 568, touch: true },
]) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    for (const path of ['/dev/menu', '/']) {
      test(`§3.3 / RD-VIS-02: ninguna placa elegida de ${path} corta su etiqueta, su dato ni su tecla`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await page.evaluate(() => document.fonts.ready)
        expect(await plateCuts(page)).toEqual([])
      })

      test(`RD-VIS-05: las tildes de las mayúsculas en display de ${path} salen enteras`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await page.evaluate(() => document.fonts.ready)
        expect(await clippedAccents(page, DISPLAY_TEXTS)).toEqual([])
      })
    }
  })
}

/**
 * Elige cada placa del menú y mide, en reposo y elegida, si el texto de su etiqueta, su dato y su tecla
 * se sale por arriba o por abajo del relleno de la placa (dentro del borde, `--bb-stroke`).
 */
function plateOverflowY(page: Page, selector = 'main [data-menu-plate]'): Promise<string[]> {
  return page.evaluate(async (scope) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const problems: string[] = []
    const plates = [...document.querySelectorAll<HTMLElement>(scope)]
    const check = (plate: HTMLElement, state: string) => {
      const box = plate.getBoundingClientRect()
      const stroke = Number.parseFloat(getComputedStyle(plate, '::after').top) || 0
      const name = plate.querySelector('[data-plate-label]')?.textContent ?? '?'
      const pieces = plate.querySelectorAll<HTMLElement>('[data-plate-label], [data-plate-detail], kbd')
      for (const piece of [...pieces, ...plate.querySelectorAll<HTMLElement>('[data-plate-extra]')]) {
        if (piece.closest('[hidden]') || getComputedStyle(piece).display === 'none') continue
        let rect = piece.getBoundingClientRect()
        if (piece.tagName !== 'KBD') {
          const range = document.createRange()
          range.selectNodeContents(piece)
          rect = range.getBoundingClientRect()
        }
        if (rect.height === 0) continue
        const what =
          piece.tagName === 'KBD' ? 'tecla' : piece.matches('[data-plate-label]') ? 'etiqueta' : 'dato'
        if (rect.top < box.top + stroke - 0.5)
          problems.push(
            `${name} (${state}): ${what} ${(box.top + stroke - rect.top).toFixed(1)} px por arriba`,
          )
        if (rect.bottom > box.bottom - stroke + 0.5)
          problems.push(
            `${name} (${state}): ${what} ${(rect.bottom - box.bottom + stroke).toFixed(1)} px por abajo`,
          )
      }
    }
    for (const plate of plates) {
      ;(document.activeElement as HTMLElement | null)?.blur()
      await frame()
      if (plate.getAttribute('data-cursor-active') !== 'true') check(plate, 'reposo')
      plate.focus()
      await frame()
      await new Promise((done) => setTimeout(done, 250))
      await frame()
      check(plate, 'elegida')
    }
    return problems
  }, selector)
}

/**
 * Reflow a 320 px con la ventana baja (jurado de la 0.28, segundo pase; WCAG 1.4.10): por debajo de
 * 360 px el dato baja a una segunda línea, y la placa tiene que crecer con él (antes la regla del móvil
 * bajo la dejaba en 44 px y el texto se salía 1–1,5 px por arriba y la tecla por abajo).
 */
for (const touch of [false, true]) {
  test.describe(`placas a 320 × 568 ${touch ? 'en táctil' : 'con teclado'}`, () => {
    test.use({ viewport: { width: 320, height: 568 }, isMobile: touch, hasTouch: touch })

    for (const path of ['/dev/menu', '/']) {
      test(`§3.3 / WCAG 1.4.10: el texto de cada placa de ${path} (etiqueta, dato y tecla) queda dentro de la placa`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await page.evaluate(() => document.fonts.ready)
        expect(await plateOverflowY(page)).toEqual([])
      })
    }
  })
}

/**
 * Espaciado de texto de WCAG 1.4.12 (interlineado 1,5, letras 0,12 em, palabras 0,16 em, párrafos 2 em),
 * con `!important` en todo, como lo aplica quien lo necesita (una hoja de estilo propia o un
 * marcador).
 */
const TEXT_SPACING = `*, *::before, *::after { line-height: 1.5 !important; letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`

/**
 * Textos y marcos (los chips) de `<main>` (o de `scope`) que recorta en horizontal un antepasado (o el
 * propio elemento, si recorta su texto con «…»): se perderían con el espaciado de 1.4.12.
 */
function clippedHorizontally(page: Page, scope = 'main'): Promise<string[]> {
  return page.evaluate((root) => {
    const clipped: string[] = []
    for (const element of document.querySelectorAll<HTMLElement>(`${root} *`)) {
      const ownText = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      )
      const frame = element.matches('[data-frame]')
      if (!ownText && !frame) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (element.closest('.sr-only, [hidden], [aria-hidden="true"]')) continue
      let box = element.getBoundingClientRect()
      if (ownText) {
        const range = document.createRange()
        range.selectNodeContents(element)
        box = range.getBoundingClientRect()
      }
      if (box.width === 0) continue
      for (
        let node: HTMLElement | null = ownText ? element : element.parentElement;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const clip = getComputedStyle(node)
        if (clip.overflowX === 'visible' && clip.clipPath === 'none') continue
        const rect = node.getBoundingClientRect()
        if (box.right > rect.right + 1 || box.left < rect.left - 1) {
          const text = (element.textContent ?? '').trim().slice(0, 40)
          clipped.push(`«${text}» recortado por ${node.tagName.toLowerCase()}.${String(node.className)}`)
          break
        }
      }
    }
    return clipped
  }, scope)
}

test.describe('espaciado de texto (WCAG 1.4.12) a 390 × 844 táctil', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const path of ['/dev/menu', '/']) {
    test(`WCAG 1.4.12: con el espaciado de texto aplicado desde la carga, nada de ${path} se corta (la cinta del lockup, los chips de la semana)`, async ({
      page,
    }) => {
      await page.addInitScript((css) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style')
          style.textContent = css
          document.head.append(style)
        })
      }, TEXT_SPACING)
      await open(page, path, 'Beat Battle')
      await settle(page)
      expect(await page.evaluate(() => getComputedStyle(document.body).letterSpacing)).not.toBe('normal')
      expect(await clippedHorizontally(page)).toEqual([])
    })
  }
})

/** La cinta del lockup: su texto visible y en cuántas líneas va. */
function ribbonLines(page: Page): Promise<{ text: string; lines: number }> {
  return page.evaluate(() => {
    const ribbon = document.querySelector<HTMLElement>('main [class*=lockup] p')!
    const range = document.createRange()
    range.selectNodeContents(ribbon)
    const tops = [...range.getClientRects()]
      .filter((rect) => rect.width > 1)
      .map((rect) => Math.round(rect.top))
    return { text: ribbon.innerText.replace(/\s+/g, ' ').trim(), lines: new Set(tops).size }
  })
}

/**
 * La cinta del lockup según su sitio (guía §3.1, §3.8.3; revisión de los arreglos de la 0.28): de 721 a
 * unos 1000 px la columna del título es tan estrecha como un móvil, y la cinta partía en cuatro líneas
 * con «PRODUCTORES» cortado por el chaflán. Ahora cada paso (estrecha, 12 px, la del móvil, sin «de
 * productores») depende del ancho del lockup: con el espaciado normal va en una línea a cualquier ancho
 * y ningún texto del lockup se corta.
 */
for (const viewport of [
  { width: 721, height: 900, touch: false, short: true },
  // En la tableta vertical el menú va apilado (§3.8.3): el lockup mide lo que el logo y la cinta va entera.
  { width: 768, height: 1024, touch: true, short: false },
  { width: 823, height: 514, touch: false, short: true },
  // Por debajo de 1200 px y hasta 968 de alto, la ventana es baja para el menú (la barra lleva las teclas y
  // la crónica en sus filas, `MainMenu`): el logo baja con el alto y el lockup, con él.
  { width: 900, height: 900, touch: false, short: true },
  { width: 1024, height: 768, touch: false, short: false },
  { width: 1100, height: 900, touch: false, short: false },
  { width: 1280, height: 800, touch: false, short: false },
  { width: 390, height: 844, touch: true, short: false },
  { width: 360, height: 640, touch: true, short: true },
]) {
  test.describe(`cinta a ${viewport.width} × ${viewport.height}${viewport.touch ? ' táctil' : ''}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    test('§3.1: la cinta del lockup de /dev/menu va en una línea y no se corta', async ({ page }) => {
      await open(page, '/dev/menu', 'Beat Battle')
      await settle(page)
      expect(await ribbonLines(page)).toEqual({
        text: viewport.short ? 'TORNEO SEMANAL' : 'TORNEO SEMANAL DE PRODUCTORES',
        lines: 1,
      })
      expect(await clippedHorizontally(page, 'main [class*=lockup]')).toEqual([])
    })
  })
}

/**
 * La cinta del lockup de la autenticación (§3.8.14; jurado de la 0.28, tercer pase): a 1024 × 768, y entre
 * unos 1000 y 1040 px, salía cortada a mitad de palabra («TORNEO SEMANAL DE PRODUCTOR…»). Desde que cada
 * paso de la cinta depende del ancho del propio lockup, va entera y en una línea.
 */
for (const width of [1000, 1024, 1040]) {
  test.describe(`cinta de /entrar a ${width} × 768`, () => {
    test.use({ viewport: { width, height: 768 } })

    test('RD-VIS-02 e / §3.8.14: la cinta del lockup de /entrar va entera, en una línea y sin cortarse', async ({
      page,
    }) => {
      await open(page, '/entrar', 'Entrar')
      await settle(page)
      expect(await ribbonLines(page)).toEqual({ text: 'TORNEO SEMANAL DE PRODUCTORES', lines: 1 })
      expect(await clippedHorizontally(page, 'main [class*=lockup]')).toEqual([])
    })
  })
}

/** Con el espaciado de 1.4.12, en la composición intermedia (la del jurado) tampoco se corta nada. */
for (const viewport of [
  { width: 721, height: 900, touch: false },
  { width: 768, height: 1024, touch: true },
  { width: 1024, height: 768, touch: false },
]) {
  test.describe(`espaciado de texto (WCAG 1.4.12) a ${viewport.width} × ${viewport.height}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    for (const path of ['/dev/menu', '/']) {
      test(`WCAG 1.4.12 / §3.1: con el espaciado de texto, nada de ${path} se corta (la cinta parte antes que cortarse)`, async ({
        page,
      }) => {
        await page.addInitScript((css) => {
          document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style')
            style.textContent = css
            document.head.append(style)
          })
        }, TEXT_SPACING)
        await open(page, path, 'Beat Battle')
        await settle(page)
        expect(await clippedHorizontally(page)).toEqual([])
      })
    }
  })
}

interface LockupOverLogo {
  /** Píxeles de la pegatina OTP girada que caen sobre la zona opaca del logo. */
  sticker: number
  /** Píxeles de la caja de la cinta que caen sobre la zona opaca del logo. */
  ribbon: number
}

/**
 * Cuánto pisa el lockup del título al logo del juego (guía §3.1 «La firma»: margen alrededor de la
 * pegatina; §3.8.3). La zona opaca del logo es la de su canvas (alfa ≥ ½), y la de la pegatina, la de su
 * imagen girada −7° (alfa ≥ ½: no cuentan las esquinas transparentes de la caja); la cinta cuenta entera.
 */
async function lockupOverLogo(page: Page): Promise<LockupOverLogo> {
  // El logo se pinta cuando la fuente del display está lista: hasta entonces el canvas está vacío.
  await page.waitForFunction(() => {
    const canvas = [...document.querySelectorAll<HTMLCanvasElement>('main [data-game-logo] canvas')].find(
      (element) => element.getBoundingClientRect().width > 0,
    )
    const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
    return pixels?.some((value, index) => index % 4 === 3 && value > 0) ?? false
  })
  return page.evaluate(async () => {
    const OPAQUE = 128
    const canvas = [...document.querySelectorAll<HTMLCanvasElement>('main [data-game-logo] canvas')].find(
      (element) => element.getBoundingClientRect().width > 0,
    )!
    const logoBox = canvas.getBoundingClientRect()
    const density = canvas.width / logoBox.width
    const logo = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const logoOpaque = (x: number, y: number) => {
      const px = Math.floor((x - logoBox.left) * density)
      const py = Math.floor((y - logoBox.top) * density)
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false
      return logo[(py * canvas.width + px) * 4 + 3]! >= OPAQUE
    }
    /** Recorre, a la resolución del canvas, la parte de una caja de la ventana que cae sobre el logo. */
    const countOver = (box: DOMRect, covers: (x: number, y: number) => boolean) => {
      let count = 0
      const top = Math.max(box.top, logoBox.top)
      const bottom = Math.min(box.bottom, logoBox.bottom)
      const left = Math.max(box.left, logoBox.left)
      const right = Math.min(box.right, logoBox.right)
      for (let y = top; y < bottom; y += 1 / density)
        for (let x = left; x < right; x += 1 / density) if (logoOpaque(x, y) && covers(x, y)) count++
      return count
    }

    // La pegatina: su imagen, en sus coordenadas sin girar (el giro va en un antepasado, alrededor del centro).
    const img = document.querySelector<HTMLImageElement>('main [class*=lockup] img')!
    await img.decode()
    const sticker = document.createElement('canvas')
    sticker.width = img.naturalWidth
    sticker.height = img.naturalHeight
    const stickerContext = sticker.getContext('2d')!
    stickerContext.drawImage(img, 0, 0, sticker.width, sticker.height)
    const stickerAlpha = stickerContext.getImageData(0, 0, sticker.width, sticker.height).data
    let angle = 0
    for (let node: HTMLElement | null = img; node; node = node.parentElement) {
      const transform = getComputedStyle(node).transform
      if (transform !== 'none') {
        const matrix = new DOMMatrix(transform)
        angle += Math.atan2(matrix.b, matrix.a)
      }
    }
    const stickerBox = img.getBoundingClientRect()
    const centerX = stickerBox.left + stickerBox.width / 2
    const centerY = stickerBox.top + stickerBox.height / 2
    const [width, height] = [img.offsetWidth, img.offsetHeight]
    const [cos, sin] = [Math.cos(-angle), Math.sin(-angle)]
    const stickerOpaque = (x: number, y: number) => {
      const dx = x - centerX
      const dy = y - centerY
      const u = ((dx * cos - dy * sin + width / 2) / width) * sticker.width
      const v = ((dx * sin + dy * cos + height / 2) / height) * sticker.height
      if (u < 0 || v < 0 || u >= sticker.width || v >= sticker.height) return false
      return stickerAlpha[(Math.floor(v) * sticker.width + Math.floor(u)) * 4 + 3]! >= OPAQUE
    }

    const ribbon = document.querySelector<HTMLElement>('main [class*=lockup] p')!
    return {
      sticker: countOver(stickerBox, stickerOpaque),
      ribbon: countOver(ribbon.getBoundingClientRect(), () => true),
    }
  })
}

/**
 * El lockup no pisa el logo (jurado visual de la 0.28, segundo pase; guía §3.1 y §3.8.3): con el logo en
 * una línea (móvil bajo, 360 × 640 y 375 × 667) la cinta y la pegatina quedaban sobre la extrusión de
 * «BEAT» y de «BATTLE». A 390 × 844 y en escritorio, con el logo en dos líneas, tampoco. Y el menú sigue
 * cabiendo sin desplazar en los móviles de la guía.
 */
for (const viewport of [
  { width: 360, height: 640, touch: true },
  { width: 375, height: 667, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 1440, height: 900, touch: false },
  // De 721 a unos 1060 px la pegatina es la pequeña y el logo, estrecho: la pegatina pisaba el pie de
  // «BATTLE»; y con la ventana baja, el logo baja y el lockup va con él (revisión de la 0.28, tercer pase).
  { width: 721, height: 900, touch: false },
  { width: 1024, height: 768, touch: false },
  { width: 900, height: 800, touch: false },
  { width: 1366, height: 657, touch: false },
  { width: 1536, height: 730, touch: false },
  { width: 1280, height: 720, touch: false },
]) {
  test.describe(`lockup a ${viewport.width} × ${viewport.height}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    for (const path of ['/dev/menu', '/']) {
      test(`RD-VIS-02 e / §3.1: ni la pegatina OTP ni la cinta del lockup pisan el logo de ${path}`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        expect(await lockupOverLogo(page)).toEqual({ sticker: 0, ribbon: 0 })
      })

      if (viewport.touch)
        test(`§3.8.3: el menú de ${path} cabe sin desplazar`, async ({ page }) => {
          await open(page, path, 'Beat Battle')
          await settle(page)
          const { scroll, view } = await page.evaluate(() => ({
            scroll: document.scrollingElement!.scrollHeight,
            view: window.innerHeight,
          }))
          expect(scroll).toBeLessThanOrEqual(view)
        })
    }
  })
}

test('RD-VIS-05: las tildes en display de la galería (la muestra «ÀÓÚ», placas y alias) salen enteras', async ({
  page,
}) => {
  await openGallery(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('[data-accents]').first()).toBeVisible()
  expect(await clippedAccents(page, `${DISPLAY_TEXTS}, section#ficha h2`)).toEqual([])
})

/**
 * La galería en móvil (`RD-VIS-03`; WCAG 1.4.10 a 320 px): ni el texto ni las piezas se salen por la
 * derecha. El marco de juego recorta lo que se sale, así que una pieza que desborda pierde el lado
 * derecho, el chaflán y el anillo del cursor aunque su texto quepa (la demo de `useRovingMenu` llegaba a
 * x = 343 en una ventana de 320; tercer pase del jurado, L10).
 */
for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`galería a ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true })

    test('RD-VIS-03: ninguna hoja de texto ni ninguna pieza se sale por la derecha de la ventana', async ({
      page,
    }) => {
      await openGallery(page)
      await page.evaluate(() => document.fonts.ready)
      const outside = await page.evaluate(() => {
        const width = window.innerWidth
        const out: string[] = []
        // Dentro de una fila que se desplaza en horizontal (las pestañas en móvil), salirse es lo normal.
        const inScroller = (element: Element) => {
          for (let a: Element | null = element; a; a = a.parentElement)
            if (/auto|scroll/.test(getComputedStyle(a).overflowX)) return true
          return false
        }
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const element = node.parentElement
          if (!node.textContent?.trim() || !element || element.closest('.sr-only, [hidden]')) continue
          if (inScroller(element)) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          const rect = range.getBoundingClientRect()
          if (rect.width > 0 && rect.right > width + 1)
            out.push(`«${node.textContent.trim().slice(0, 30)}» llega a ${Math.round(rect.right)} px`)
        }
        // Las piezas: controles, marcos, placas y etiquetas (su caja entera, no solo el texto).
        const PIECES =
          'a[href], button, [role="menuitem"], [role="tab"], [role="switch"], [data-cursor], [data-frame], [data-tag]'
        for (const element of document.querySelectorAll<HTMLElement>(`main :is(${PIECES})`)) {
          if (element.closest('.sr-only, [hidden]') || inScroller(element)) continue
          const rect = element.getBoundingClientRect()
          if (rect.width > 0 && rect.right > width + 1) {
            const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 30)
            out.push(`<${element.tagName.toLowerCase()}> «${name}» llega a ${Math.round(rect.right)} px`)
          }
        }
        return out
      })
      expect(outside).toEqual([])
    })
  })
}

/**
 * Ampliar no quita información (WCAG 1.4.4 y 1.4.10; guía §3.8.3): los pliegues de «móvil» y «móvil bajo»
 * son para los móviles táctiles. En escritorio con zoom (1280 × 720 al 200 % = 640 × 360, teclado y
 * ratón) la pantalla se desplaza en vez de esconder: los chips de la semana, el plazo, el panel de ayuda
 * del modo, la fecha absoluta del reloj y la crónica siguen ahí, visibles y en el árbol de accesibilidad.
 */
test.describe('menú a 640 × 360 (escritorio al 200 %)', () => {
  test.use({ viewport: { width: 640, height: 360 } })

  test('WCAG 1.4.4 / 1.4.10: ampliar no esconde los chips, el plazo, la ayuda, la fecha ni la crónica', async ({
    page,
  }) => {
    await open(page, '/dev/menu', 'Beat Battle')
    const main = page.getByRole('main')
    const card = main.getByRole('article', { name: 'Lluvia en Gràcia' })
    // Los chips de la semana: BPM, tonalidad, duración y género sugerido.
    for (const chip of [/92\s*BPM/i, /Re menor/, /1:12\s*min/i, /Boom bap/]) {
      await expect(card.getByText(chip).first()).toBeVisible()
    }
    // La fecha absoluta del cierre, también en el reloj de la tarjeta.
    await expect(card.getByText('Domingo 11 a las 20:00 · votos hasta las 23:59')).toBeVisible()
    // El reto y las entradas en la batalla.
    await expect(card.getByText(/Usa solo el primer compás/)).toBeVisible()
    // El panel de ayuda del modo elegido (Jugar: el plazo y los créditos), visible y leído.
    const help = main.locator('[aria-live="polite"]').filter({ hasText: 'domingo 11 a las 20:00' })
    await expect(help).toBeVisible()
    await expect(main.getByRole('menu', { name: 'Elige modo' })).toHaveAccessibleDescription(
      /domingo 11 a las 20:00/,
    )
    // La crónica de la barra de controles.
    await expect(page.getByRole('contentinfo').locator('[data-chronicle]')).toBeVisible()
  })
})

/**
 * Pestañas de Opciones y de los legales en móvil (guía §3.3 «Pestañas», §3.8.14; WCAG 1.4.10 y 2.4.11):
 * en una ventana estrecha parten en varias líneas en vez de desplazarse sin pista, así que cada pestaña
 * cabe entera en la ventana (también al enfocarla con Tab, cursor incluido), y en táctil no se pintan las
 * teclas Q/E.
 */
for (const viewport of [
  { width: 360, height: 740, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 390, height: 844, touch: false },
]) {
  test.describe(`pestañas a ${viewport.width} px${viewport.touch ? ' táctil' : ' con teclado'}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    for (const { path, heading, nav } of [
      { path: '/ajustes/sonido', heading: 'Sonido y efectos', nav: 'Secciones de ajustes' },
      { path: '/legal/bases', heading: 'Bases de la competición', nav: 'Documentos legales' },
    ]) {
      test(`WCAG 1.4.10: en ${path} cada pestaña cabe entera en la ventana, también enfocada`, async ({
        page,
      }) => {
        await open(page, path, heading)
        const links = page.getByRole('navigation', { name: nav }).getByRole('link')
        const count = await links.count()
        expect(count).toBeGreaterThan(3)
        const outside: string[] = []
        for (let index = 0; index < count; index++) {
          const link = links.nth(index)
          await link.focus()
          // El cursor se pinta 7 px por fuera de la pestaña: también tiene que caber.
          const box = await link.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return { left: rect.left - 7, right: rect.right + 7, width: window.innerWidth }
          })
          if (box.left < 0 || box.right > box.width)
            outside.push(`${await link.textContent()}: ${box.left.toFixed(0)}–${box.right.toFixed(0)}`)
        }
        expect(outside).toEqual([])
        const keys = page.getByRole('navigation', { name: nav }).locator('[data-key]')
        if (viewport.touch) for (const key of await keys.all()) await expect(key).toBeHidden()
        else await expect(keys.first()).toBeVisible()
      })
    }
  })
}

/**
 * Lo que se pisa en el marco de juego (§3.4.1):
 *
 * - **HUD**: piezas (jugador, centro y derecha) cuyo contenido visible se pisa con el de otra (la caja de
 *   cada una es la unión de las de sus descendientes visibles).
 * - **Barra de controles**: la firma con las teclas o con el dato de la derecha (la crónica), y las teclas
 *   cortadas por la mitad (cada una se ve entera o no se ve).
 */
function frameClashes(page: Page): Promise<{ hud: string[]; bar: string[] }> {
  return page.evaluate(() => {
    type Box = { left: number; top: number; right: number; bottom: number }
    const boxOf = (element: Element | null): Box | null => {
      let box: Box | null = null
      if (!element) return box
      for (const node of [element, ...element.querySelectorAll('*')]) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || node.closest('.sr-only')) continue
        const rect = node.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) continue
        box = box
          ? {
              left: Math.min(box.left, rect.left),
              top: Math.min(box.top, rect.top),
              right: Math.max(box.right, rect.right),
              bottom: Math.max(box.bottom, rect.bottom),
            }
          : { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      }
      return box
    }
    const overlaps = (a: Box | null, b: Box | null) =>
      !!a &&
      !!b &&
      a.left < b.right - 0.5 &&
      b.left < a.right - 0.5 &&
      a.top < b.bottom - 0.5 &&
      b.top < a.bottom - 0.5

    const hud: string[] = []
    const pieces = [...document.querySelector('header')!.children].map((piece) => ({
      name: piece.getAttribute('data-frame-slot') ?? 'right',
      box: boxOf(piece),
    }))
    for (const [index, a] of pieces.entries())
      for (const b of pieces.slice(index + 1))
        if (overlaps(a.box, b.box)) hud.push(`${a.name} pisa ${b.name}`)

    const bar: string[] = []
    const footer = document.querySelector('footer')!
    const keys = footer.querySelector<HTMLElement>('ul')!
    const signature = boxOf(footer.querySelector('[data-otp-signature]'))
    const keysStyle = getComputedStyle(keys)
    if (keysStyle.visibility !== 'hidden' && keysStyle.display !== 'none') {
      const keysBox = keys.getBoundingClientRect()
      for (const key of keys.children) {
        const box = key.getBoundingClientRect()
        if (box.top >= keysBox.bottom - 0.5) continue
        if (box.right > keysBox.right + 0.5 || box.bottom > keysBox.bottom + 0.5)
          bar.push(`tecla cortada: ${key.textContent}`)
        if (overlaps(box, signature)) bar.push(`la tecla ${key.textContent} pisa la firma`)
      }
    }
    if (overlaps(boxOf(footer.querySelector('[data-frame-slot="controlsRight"]')), signature))
      bar.push('el dato de la derecha pisa la firma')
    return { hud, bar }
  })
}

/**
 * Composición intermedia (de 721 a unos 1200 px: tabletas y escritorio ampliado; revisión de los arreglos
 * de la 0.28, guía §3.3, §3.4.1 y §3.8.3). Antes, de 721 a 900 px las etiquetas de las placas se quedaban
 * sin ancho («JUGAR», «RESULTADOS» y «AJUSTES» a 0 px), la crónica pisaba la firma y en el HUD el reloj
 * pisaba la ficha del jugador y la temporada. Ahora el dato de las placas baja a una segunda línea si la
 * lista es estrecha, el HUD se apila si sus piezas no caben en una fila y la crónica va en su propia fila
 * bajo la firma.
 */
for (const viewport of [
  { width: 721, height: 900, touch: false },
  { width: 744, height: 1133, touch: true },
  { width: 768, height: 1024, touch: true },
  { width: 820, height: 1180, touch: true },
  { width: 823, height: 514, touch: false },
  { width: 1024, height: 768, touch: false },
]) {
  test.describe(`composición intermedia a ${viewport.width} × ${viewport.height}${viewport.touch ? ' táctil' : ''}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    for (const path of ['/dev/menu', '/']) {
      test(`§3.3 / RD-VIS-02: las placas de ${path} no cortan su etiqueta, su dato ni su tecla, ni se salen de la placa`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await page.evaluate(() => document.fonts.ready)
        expect(await plateCuts(page)).toEqual([])
        expect(await plateOverflowY(page)).toEqual([])
      })

      test(`§3.4.1 / RF-OTP-01: en ${path} nada del HUD se pisa, y en la barra ni la crónica ni las teclas pisan la firma`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        expect(await frameClashes(page)).toEqual({ hud: [], bar: [] })
      })
    }
  })
}

/**
 * En «/» a 721 × 900 (el calendario vacío, sin semana) la pantalla cabe sin desplazar, como antes de
 * reservar el alcance del cursor entre las columnas (jurado de la 0.28, tercer pase: con las columnas 22 px
 * más estrechas, la ayuda y la placa elegida partían más y la pantalla se desplazaba 13 px). En la columna
 * muy estrecha, las placas en reposo, la cabecera y la ayuda salen 12 px a la izquierda, no 28.
 */
test.describe('«/» a 721 × 900', () => {
  test.use({ viewport: { width: 721, height: 900 } })

  test('RD-VIS-02 e: el menú de / cabe sin desplazar', async ({ page }) => {
    await open(page, '/', 'Beat Battle')
    await settle(page)
    const { scroll, view } = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollHeight,
      view: window.innerHeight,
    }))
    expect(scroll).toBeLessThanOrEqual(view)
  })
})

/** El HUD de las pantallas interiores: «1P · PULSA PARA UNIRTE» y la placa de título no se pisan. */
for (const width of [721, 768]) {
  test.describe(`HUD de las pantallas interiores a ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const { path, heading } of [
      { path: '/salon-de-la-fama', heading: 'Salón de la fama' },
      { path: '/como-funciona', heading: 'Cómo se juega' },
    ]) {
      test(`§3.4.1: en ${path} el jugador y la placa de título del HUD no se pisan`, async ({ page }) => {
        await open(page, path, heading)
        await settle(page)
        expect(await frameClashes(page)).toEqual({ hud: [], bar: [] })
      })
    }
  })
}

/**
 * Elige cada placa del menú y devuelve dónde el 1P o la flecha de su izquierda pisan algo de la columna
 * del título: el lienzo del logo, la cinta, la pegatina OTP del lockup (la firma, `RF-OTP-01`) o la
 * tarjeta de la semana. Las cajas cuentan enteras (el lienzo del logo, con su aire transparente).
 */
function cursorOverTitle(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const visible = (element: Element) => {
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    const intersects = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    const main = document.querySelector('main')!
    const problems: string[] = []
    for (const plate of main.querySelectorAll<HTMLElement>('[data-menu-plate]')) {
      plate.focus()
      await frame()
      await new Promise((done) => setTimeout(done, 250))
      await frame()
      const logo = [...main.querySelectorAll('[data-game-logo] canvas')].find(
        (canvas) => canvas.getBoundingClientRect().width > 0,
      )
      const title = {
        logo: logo?.getBoundingClientRect(),
        cinta: main.querySelector('[class*=lockup] p')?.getBoundingClientRect(),
        pegatina: main.querySelector('[data-otp-signature] img')?.getBoundingClientRect(),
        tarjeta: main.querySelector('article')?.getBoundingClientRect(),
      }
      const name = plate.querySelector('[data-plate-label]')?.textContent ?? '?'
      for (const [what, piece] of [
        ['1P', plate.querySelector('[data-cursor-player]')],
        ['flecha', plate.querySelector('[class*=arrow]')],
      ] as const) {
        if (!piece || !visible(piece)) continue
        const box = piece.getBoundingClientRect()
        for (const [part, rect] of Object.entries(title))
          if (rect && rect.width > 0 && intersects(box, rect))
            problems.push(
              `${name}: el ${what} (${Math.round(box.left)}–${Math.round(box.right)}) pisa ${part} (${Math.round(rect.left)}–${Math.round(rect.right)})`,
            )
      }
    }
    return problems
  })
}

/**
 * El cursor de las placas no pisa el título (jurado visual de la 0.28, tercer pase; guía §3.3 «Opción de
 * menú», §3.8.3, `RD-VIS-02` e, `RF-OTP-01`): el 1P sale 76 px a la izquierda de la placa elegida, y de
 * 721 a unos 1400 px el hueco entre las columnas era de 40. A 1024 × 768, con el cursor en JUGAR, el 1P
 * tapaba la «E» de BATTLE, y en «/», con el cursor en JURADO, la pegatina OTP del lockup.
 */
for (const viewport of [
  { width: 721, height: 900, touch: false },
  { width: 900, height: 800, touch: false },
  { width: 961, height: 900, touch: false },
  { width: 1024, height: 768, touch: false },
  { width: 1199, height: 900, touch: false },
  { width: 1280, height: 800, touch: false },
  { width: 1440, height: 900, touch: false },
  { width: 844, height: 390, touch: true },
]) {
  test.describe(`cursor de las placas a ${viewport.width} × ${viewport.height}${viewport.touch ? ' táctil' : ''}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    for (const path of ['/dev/menu', '/']) {
      test(`RD-VIS-02 e / RF-OTP-01: con el cursor en cada placa de ${path}, el 1P y la flecha no pisan el logo, el lockup ni la tarjeta`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        expect(await cursorOverTitle(page)).toEqual([])
      })
    }
  })
}

/**
 * Lo que la barra de controles pegada tapa del menú: placas, el panel de ayuda y los textos y controles
 * de la tarjeta de la semana (título, créditos, chips, play, reto, entradas, aviso) que acaban por
 * debajo de su borde de arriba (el filete rojo; la línea discontinua de encima es decoración).
 */
function underControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bar = document.querySelector('footer')!.getBoundingClientRect().top
    const main = document.querySelector('main')!
    const under: string[] = []
    const visible = (element: Element) => {
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && !element.closest('.sr-only')
    }
    for (const plate of main.querySelectorAll('[data-menu-plate]'))
      if (plate.getBoundingClientRect().bottom > bar + 0.5)
        under.push(`placa ${plate.querySelector('[data-plate-label]')?.textContent}`)
    const help = main.querySelector('nav [aria-live]')
    if (help && help.getBoundingClientRect().bottom > bar + 0.5) under.push('panel de ayuda')
    for (const piece of main.querySelectorAll('article :is(h2, h3, p, button, [data-frame])')) {
      if (!visible(piece)) continue
      const box = piece.getBoundingClientRect()
      if (box.height > 0 && box.bottom > bar + 0.5)
        under.push(`tarjeta: «${(piece.textContent ?? '').trim().slice(0, 30) || piece.tagName}»`)
    }
    return under
  })
}

/**
 * Compactación por altura del menú de escritorio (jurado visual de la 0.28, tercer pase; guía §3.8.3):
 * con la ventana baja de un portátil (1366 × 657, la de una pantalla de 1366 × 768; 1280 × 720;
 * 1536 × 730; 1440 × 789, la de la pantalla de 1440 × 900 de las maquetas), el menú medía unos 900 px y
 * se desplazaba como una web: a 1366 × 657 la barra tapaba las opciones 05 y 06 y cortaba el título de
 * la tarjeta. Ahora logo, placas y tarjeta bajan con la altura y la pantalla cabe sin desplazar, sin
 * esconder nada (con teclado y ratón no hay pliegues que escondan). Con la barra más alta que la de la
 * maqueta (con teclado, las teclas en su fila a 1280 × 720; y por debajo de 1200 px, también la crónica),
 * el menú cuenta con su alto real: a 1024 × 900 y 1100 × 900 la barra mide 127 px y /dev/menu se
 * desplazaba 86 y 103 px.
 */
for (const viewport of [
  { width: 1440, height: 789 },
  { width: 1366, height: 657 },
  { width: 1536, height: 730 },
  { width: 1280, height: 720 },
  { width: 1920, height: 955 },
  { width: 1024, height: 900 },
  { width: 1100, height: 900 },
]) {
  test.describe(`menú con la ventana baja a ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })

    for (const path of ['/dev/menu', '/']) {
      test(`§3.8.3 / RD-VIS-02: el menú de ${path} cabe sin desplazar y la barra no tapa ninguna placa ni la tarjeta`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        const { scroll, view } = await page.evaluate(() => ({
          scroll: document.scrollingElement!.scrollHeight,
          view: window.innerHeight,
        }))
        expect(scroll).toBeLessThanOrEqual(view)
        expect(await underControls(page)).toEqual([])
        // Nada se esconde: los cuatro chips, la ayuda y la crónica siguen ahí.
        if (path === '/dev/menu') {
          const card = page.getByRole('main').getByRole('article', { name: 'Lluvia en Gràcia' })
          for (const chip of [/92\s*BPM/i, /Re menor/, /1:12\s*min/i, /Boom bap/])
            await expect(card.getByText(chip).first()).toBeVisible()
          await expect(card.getByText(/Usa solo el primer compás/)).toBeVisible()
        }
        await expect(page.getByRole('main').locator('nav [aria-live="polite"]')).toBeVisible()
      })
    }
  })
}

/** Cuánto pasa el lockup (la cinta o la firma con la pegatina) del borde derecho del lienzo del logo. */
function lockupPastLogo(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('main')!
    const canvas = [...main.querySelectorAll('[data-game-logo] canvas')].find(
      (element) => element.getBoundingClientRect().width > 0,
    )!
    const lockup = main.querySelector('section [class*=lockup]')!
    const right = Math.max(
      ...[lockup.querySelector('p')!, lockup.querySelector('a')!].map(
        (element) => element.getBoundingClientRect().right,
      ),
    )
    return Math.round(right - canvas.getBoundingClientRect().right)
  })
}

/**
 * Con la ventana baja, el logo baja con el alto y el lockup va con él (jurado de la 0.28, tercer pase;
 * guía §3.8.3): a 1366 × 657, con el reloj en el HUD, el logo medía 291 px y el lockup, 577, y BEAT
 * BATTLE quedaba más pequeño que «TORNEO SEMANAL DE PRODUCTORES by OTP». Ahora el lockup acaba donde acaba
 * el lienzo del logo y pasa a sus pasos estrechos cuando el logo baja.
 */
for (const viewport of [
  { width: 1440, height: 789 },
  { width: 1366, height: 657 },
  { width: 1536, height: 730 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1280, height: 600 },
  { width: 900, height: 800 },
]) {
  test.describe(`logo y lockup con la ventana baja a ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })

    for (const path of ['/dev/menu', '/']) {
      test(`RD-VIS-02 e / §3.1: en ${path} el lockup no es más ancho que el logo`, async ({ page }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        expect(await lockupPastLogo(page)).toBeLessThanOrEqual(0)
        expect(await ribbonLines(page)).toMatchObject({ lines: 1 })
      })
    }
  })
}

/**
 * Las separaciones del lockup y de las placas del menú en móvil salen de la escala de espaciado
 * (`--bb-space-*`, múltiplos de 4 px; guía §3.2, `RD-VIS-01`; jurado de la 0.28, tercer pase): antes eran
 * sumas de trazos y espacios (2, 10, 6 y 3 px) que disfrazaban medidas fuera de la escala.
 */
for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test.describe(`separaciones del menú a ${viewport.width} × ${viewport.height} táctil`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true })

    test('RD-VIS-01: el lockup, la tarjeta, las placas y las columnas se separan con la escala de espaciado', async ({
      page,
    }) => {
      await open(page, '/dev/menu', 'Beat Battle')
      const spacings = await page.evaluate(() => {
        const main = document.querySelector('main')!
        const px = (value: string) => Number.parseFloat(value) || 0
        return {
          lockup: px(getComputedStyle(main.querySelector('[class*=lockup]')!).marginTop),
          tarjeta: px(getComputedStyle(main.querySelector('article')!).marginTop),
          placas: px(getComputedStyle(main.querySelector('ul')!).rowGap),
          columnas: px(getComputedStyle(main.querySelector('[data-week]')!).rowGap),
        }
      })
      const offScale = Object.entries(spacings).filter(([, value]) => value % 4 !== 0)
      expect(offScale).toEqual([])
    })
  })
}

/**
 * Qué hay debajo del «by» del lockup: la primera caja del lockup (el propio «by» o un antepasado) que
 * cubre su texto con un fondo, y su opacidad. Sin ninguna, el texto va directamente sobre la arena.
 */
function byBackdrop(page: Page): Promise<{ text: string; alpha: number } | null> {
  return page.evaluate(() => {
    const signature = document.querySelector<HTMLElement>('main [data-otp-signature]')!
    const by = [...signature.querySelectorAll<HTMLElement>('span')].find(
      (span) => span.textContent?.trim() === 'by',
    )!
    const range = document.createRange()
    range.selectNodeContents(by)
    const text = range.getBoundingClientRect()
    const lockup = signature.closest('[class*=lockup]')
    for (
      let node: HTMLElement | null = by;
      node && node !== lockup?.parentElement;
      node = node.parentElement
    ) {
      const color = getComputedStyle(node).backgroundColor
      const alpha = color.startsWith('rgba') ? Number(color.split(',')[3]?.replace(')', '')) : 1
      if (color === 'transparent' || alpha === 0) continue
      const box = node.getBoundingClientRect()
      if (
        box.left <= text.left &&
        box.right >= text.right &&
        box.top <= text.top &&
        box.bottom >= text.bottom
      )
        return { text: by.textContent!.trim(), alpha }
    }
    return null
  })
}

/**
 * El «by» del lockup no va directamente sobre los rayos (`RD-VIS-05`: ningún texto directamente sobre
 * trama, rayos o líneas de barrido; jurado de la 0.28, tercer pase): lleva detrás una caja de
 * `--bb-panel-veil` (opacidad 0,94), casi invisible sobre el negro de la arena, que tapa las bandas.
 */
for (const { path, heading, viewport } of [
  { path: '/', heading: 'Beat Battle', viewport: { width: 1440, height: 900, touch: false } },
  { path: '/dev/menu', heading: 'Beat Battle', viewport: { width: 1440, height: 900, touch: false } },
  { path: '/dev/menu', heading: 'Beat Battle', viewport: { width: 390, height: 844, touch: true } },
  { path: '/', heading: 'Beat Battle', viewport: { width: 390, height: 844, touch: true } },
  { path: '/entrar', heading: 'Entrar', viewport: { width: 1440, height: 900, touch: false } },
]) {
  test.describe(`«by» del lockup de ${path} a ${viewport.width} × ${viewport.height}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    test(`RD-VIS-05: el «by» del lockup de ${path} va sobre un velo, no sobre los rayos`, async ({
      page,
    }) => {
      await open(page, path, heading)
      const backdrop = await byBackdrop(page)
      expect(backdrop).not.toBeNull()
      expect(backdrop!.alpha).toBeGreaterThanOrEqual(0.9)
    })
  })
}

/** A 1440 × 900 (la maqueta) la compactación no entra: placas de 70 px (84 la elegida) y logo de 640. */
test('RD-VIS-02 e / §3.8.3: a 1440 × 900 el menú es el de la maqueta (placas de 70 y 84 px, logo de 640)', async ({
  page,
}) => {
  await open(page, '/dev/menu', 'Beat Battle')
  await settle(page)
  const sizes = await page.evaluate(() => ({
    plates: [...document.querySelectorAll('main [data-menu-plate]')].map((plate) =>
      Math.round(plate.getBoundingClientRect().height),
    ),
    logo: Math.round(
      [...document.querySelectorAll('main [data-game-logo]')]
        .map((logo) => logo.getBoundingClientRect().width)
        .find((width) => width > 0) ?? 0,
    ),
  }))
  expect(sizes).toEqual({ plates: [84, 70, 70, 70, 70, 70], logo: 640 })
})

/**
 * La compactación por altura es del menú principal, no de la placa (revisión de la 0.28, tercer pase): era
 * una media query sobre `.plate` y encogía también las placas de la galería, que es la referencia. Ahora
 * la pone el menú (`--menu-plate-h`) y en la galería a 1440 × 789 miden lo de la maqueta.
 */
test.describe('galería con la ventana baja a 1440 × 789', () => {
  test.use({ viewport: { width: 1440, height: 789 } })

  test('RD-VIS-02 e: las placas de la galería miden 70 px en reposo y 84 la elegida', async ({ page }) => {
    await openGallery(page)
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('#opcion-menu [data-menu-plate]:not([data-force-state="pressed"])')].map(
        (plate) => Math.round(plate.getBoundingClientRect().height),
      ),
    )
    expect(new Set(heights)).toEqual(new Set([70, 84]))
  })
})

/** Proporción de píxeles granate de una captura (criterio del acta, grupo 24), medida en el navegador. */
async function wineShare(page: Page): Promise<number> {
  const png = await page.screenshot()
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = new OffscreenCanvas(image.width, image.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0)
    const { data: px } = ctx.getImageData(0, 0, image.width, image.height)
    let wine = 0
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]!
      if (r >= 25 && r <= 110 && px[i + 1]! < 0.45 * r && px[i + 2]! < 0.6 * r) wine += 1
    }
    return wine / (px.length / 4)
  }, png.toString('base64'))
}

/** Las piezas que miden la composición del menú: logo, columna de modos, placas, tarjeta, ayuda y barra. */
function menuBoxes(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!
    const box = (element: Element | null | undefined) => {
      const rect = element!.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }
    }
    return {
      logo: box(
        [...main.querySelectorAll('[data-game-logo] canvas')].find(
          (canvas) => canvas.getBoundingClientRect().width > 0,
        ),
      ),
      modes: box(main.querySelector('nav')),
      plates: [...main.querySelectorAll('[data-menu-plate]')].map((plate) => box(plate).height),
      card: box(main.querySelector('article')),
      help: box(main.querySelector('nav [aria-live]')!.parentElement),
      bar: box(document.querySelector('footer')),
      scroll: document.scrollingElement!.scrollHeight - window.innerHeight,
    }
  })
}

/** La escala de la ventana grande (§3.8.3): `min(ancho / 1440, alto / 900)`, entre 1 y 1,33. */
const menuScale = (width: number, height: number) =>
  Math.min(1.33, Math.max(1, Math.min(width / 1440, height / 900)))

/**
 * Ventana grande (jurado de la 0.28, cierre; guía §3.8.3): a 1920 × 1080 todo medía lo mismo que a
 * 1440 × 900 (placas de 70 px, columna de 560), entre la ayuda y la barra quedaban 205 px vacíos y la cuña
 * llegaba al 32 % de granate. Ahora la composición escala con `min(100vw / 1440, 100dvh / 900)`, acotado
 * entre 1 y 1,33, y la cuña sigue a la columna de modos.
 */
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]) {
  test.describe(`menú en la ventana grande a ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })
    const scale = menuScale(viewport.width, viewport.height)

    for (const path of ['/dev/menu', '/']) {
      test(`RD-VIS-02 e / §3.8.3: el menú de ${path} escala ×${scale.toFixed(2)} (logo, placas y columna de modos) y cabe sin desplazar`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        const box = await menuBoxes(page)
        expect(box.scroll).toBeLessThanOrEqual(0)
        expect(Math.abs(box.logo.width - 640 * scale)).toBeLessThanOrEqual(2)
        expect(Math.abs(box.modes.width - 560 * scale)).toBeLessThanOrEqual(2)
        const sorted = [...box.plates].sort((a, b) => a - b)
        for (const height of sorted.slice(0, 5)) expect(Math.abs(height - 70 * scale)).toBeLessThanOrEqual(1)
        expect(Math.abs(sorted[5]! - 84 * scale)).toBeLessThanOrEqual(1)
        expect(await underControls(page)).toEqual([])
      })
    }

    test('§3.8.3 / RD-VIS-02 e: la cuña sigue a la columna de modos y el granate no pasa del 24 %', async ({
      page,
    }) => {
      await open(page, '/dev/menu', 'Beat Battle')
      await settle(page)
      const share = await wineShare(page)
      test.info().annotations.push({ type: 'granate', description: `${(share * 100).toFixed(2)} %` })
      expect(share, `granate ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.24)
    })
  })
}

/**
 * La columna de «ELIGE MODO» y la tarjeta de la semana acaban a la misma altura, junto a la barra, en todos
 * los estados (§3.8.3): en «/» (calendario vacío, sin reloj en el HUD) la columna de modos se quedaba
 * arriba y dejaba 130 px vacíos hasta la barra a 1440 × 900. La ayuda deja sobre la barra el aire de la
 * maqueta (`--bb-space-6`, escalado en la ventana grande).
 */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]) {
  test.describe(`pie del menú a ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })
    const air = 24 * menuScale(viewport.width, viewport.height)

    for (const path of ['/dev/menu', '/', '/dev/menu?estado=vacio', '/dev/menu?estado=votacion&visitante']) {
      test(`§3.8.3: en ${path} la ayuda de «ELIGE MODO» y la tarjeta de la semana acaban junto a la barra`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        const box = await menuBoxes(page)
        expect(Math.abs(box.card.bottom - box.bar.top)).toBeLessThanOrEqual(1)
        expect(box.bar.top - box.help.bottom).toBeGreaterThanOrEqual(air - 2)
        expect(box.bar.top - box.help.bottom).toBeLessThanOrEqual(air + 2)
      })
    }
  })
}

/**
 * Tableta vertical (jurado de la 0.28, cierre; guía §3.8.3): a 768 × 1024 la tarjeta de la semana iba en
 * una columna de 290 px (título en tres líneas, créditos en cuatro, chips en tres filas), la barra la
 * cortaba y la pantalla se desplazaba 110 px. Ahora es la composición apilada del móvil a escala de
 * tableta: la tarjeta a todo el ancho, con el título y los chips en una línea, las placas debajo y todo
 * sin desplazar.
 */
for (const viewport of [
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 744, height: 1133 },
]) {
  test.describe(`tableta vertical a ${viewport.width} × ${viewport.height} táctil`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true })

    for (const path of ['/dev/menu', '/']) {
      test(`RD-VIS-02 e / §3.8.3: el menú de ${path} va apilado (la tarjeta a todo el ancho) y cabe sin desplazar`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        const box = await menuBoxes(page)
        expect(box.scroll).toBeLessThanOrEqual(0)
        expect(await underControls(page)).toEqual([])
        // Apilado: la tarjeta ocupa el ancho de la pantalla (menos el medianil) y las placas van debajo.
        expect(box.card.width).toBeGreaterThanOrEqual(viewport.width - 2 * 48 - 1)
        expect(box.modes.top).toBeGreaterThanOrEqual(box.card.bottom)
        // El título del escenario y los chips, cada uno en una línea.
        const lines = await page.evaluate(() => {
          const card = document.querySelector('main article')!
          const rows = (elements: Element[]) =>
            new Set(
              elements
                .filter((element) => element.getBoundingClientRect().width > 0)
                .map((element) => Math.round(element.getBoundingClientRect().top)),
            ).size
          const range = document.createRange()
          range.selectNodeContents(card.querySelector('h2')!)
          return {
            title: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
            // Los chips de dato (`DataChip`): marcos de chaflán pequeño.
            chips: rows([...card.querySelectorAll('[data-frame-cut="sm"]')]),
          }
        })
        // Sin semana, el título es una frase («El próximo drop está en el horno»): puede ir en dos líneas.
        if (path === '/dev/menu') expect(lines.title).toBe(1)
        expect(lines.chips).toBeLessThanOrEqual(1)
      })
    }
  })
}

/** Los altos y el cuerpo del rótulo de las placas en reposo del menú. */
function restPlates(page: Page): Promise<{ heights: number[]; fonts: number[] }> {
  return page.evaluate(() => {
    const plates = [...document.querySelectorAll<HTMLElement>('main [data-menu-plate]')].filter(
      (plate) => plate.getAttribute('data-cursor-active') !== 'true',
    )
    return {
      heights: plates.map((plate) => Math.round(plate.getBoundingClientRect().height * 2) / 2),
      fonts: plates.map((plate) =>
        Number.parseFloat(getComputedStyle(plate.querySelector('[data-plate-label]')!).fontSize),
      ),
    }
  })
}

/**
 * Composición intermedia (jurado de la 0.28, cierre; guía §3.3 y §3.8.3): todas las placas en reposo con
 * el mismo cuerpo de rótulo (el menor que necesite cualquiera, calculado en el menú) y el mismo alto, lleven
 * dato o no: a 1024 × 768 «Salón de la fama» iba a 17 px y «Cómo se juega» a 20 frente a 25 el resto, y las
 * placas medían de 50 a 67 px. Y al mover el cursor con las flechas, el panel de ayuda queda a la vista
 * por encima de la barra (a 1024 × 768 quedaba entero debajo).
 */
for (const viewport of [
  { width: 1024, height: 768 },
  { width: 900, height: 700 },
  { width: 823, height: 514 },
  { width: 768, height: 1024, touch: true },
  { width: 390, height: 844, touch: true },
]) {
  test.describe(`placas del menú a ${viewport.width} × ${viewport.height}${viewport.touch ? ' táctil' : ''}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: Boolean(viewport.touch),
      hasTouch: Boolean(viewport.touch),
    })

    for (const path of ['/dev/menu', '/']) {
      test(`§3.3 / RD-VIS-02 e: en ${path} todas las placas en reposo llevan el mismo cuerpo de rótulo y miden lo mismo`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await settle(page)
        // El ajuste de las etiquetas va un fotograma después de la fuente.
        await page.waitForTimeout(300)
        const rest = await restPlates(page)
        expect(rest.heights).toHaveLength(5)
        expect(Math.max(...rest.fonts) - Math.min(...rest.fonts)).toBeLessThanOrEqual(0.25)
        expect(Math.max(...rest.heights) - Math.min(...rest.heights)).toBeLessThanOrEqual(0.5)
        expect(await plateCuts(page)).toEqual([])
      })
    }

    if (!viewport.touch)
      test('§3.8.3: al mover el cursor con las flechas, el panel de ayuda queda a la vista por encima de la barra', async ({
        page,
      }) => {
        await open(page, '/dev/menu', 'Beat Battle')
        await settle(page)
        for (const key of ['ArrowDown', 'ArrowDown', 'End']) {
          await page.keyboard.press(key)
          // La placa elegida crece con su transición (`--bb-dur-tick`) y empuja la ayuda.
          await page.waitForTimeout(400)
          const { help, bar, plate } = await page.evaluate(() => ({
            help: document.querySelector('main nav [aria-live]')!.parentElement!.getBoundingClientRect()
              .bottom,
            bar: document.querySelector('footer')!.getBoundingClientRect().top,
            plate: document.activeElement!.getBoundingClientRect().top,
          }))
          expect(help, `ayuda tras ${key}`).toBeLessThanOrEqual(bar + 1)
          expect(plate, `placa elegida tras ${key}`).toBeGreaterThanOrEqual(0)
        }
      })
  })
}

/**
 * La etiqueta de una placa nunca se corta (§3.3; jurado de la 0.28, cierre): en la galería, «Opción de menú
 * → Interactivo» pone sus placas en una columna de 313 px, y «03 RESULTADOS · Aún nada sellado» dejaba la
 * etiqueta en 12–21 px de ancho, recortada (el candado y un trozo de la «R»), y con el espaciado de WCAG
 * 1.4.12 también. Ahora, en una placa estrecha (contenedor `menu-plate`) el motivo baja a la segunda línea.
 */
test.describe('galería: opción de menú interactiva a 1440 × 900', () => {
  const MENU = '#opcion-menu [role="menu"] [data-menu-plate]'

  for (const spacing of [false, true]) {
    test(`§3.3 / RD-VIS-05${spacing ? ' / WCAG 1.4.12' : ''}: ninguna placa del menú interactivo corta su etiqueta, su dato ni su tecla${spacing ? ' con el espaciado de texto' : ''}`, async ({
      page,
    }) => {
      if (spacing)
        await page.addInitScript((css) => {
          document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style')
            style.textContent = css
            document.head.append(style)
          })
        }, TEXT_SPACING)
      await openGallery(page)
      await page.evaluate(() => document.fonts.ready)
      await page.locator('#opcion-menu [role="menu"]').scrollIntoViewIfNeeded()
      expect(await plateCuts(page, MENU)).toEqual([])
      expect(await plateOverflowY(page, MENU)).toEqual([])
      // Ningún rótulo por debajo del mínimo legible (RD-VIS-05).
      const sizes = await page.evaluate(
        (scope) =>
          [...document.querySelectorAll(`${scope} [data-plate-label]`)].map((label) =>
            Number.parseFloat(getComputedStyle(label).fontSize),
          ),
        MENU,
      )
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16)
    })
  }
})

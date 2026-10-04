import { expect, type Page, test } from '@playwright/test'
import { open, settle } from './support'

/**
 * La barra de controles con teclado y ratón (guía §3.4.1 y §3.8.3; WCAG 1.4.4 y 1.4.10; tercer pase del
 * jurado de la 0.28): **no se esconde nada que informe**. Los pliegues que esconden son del móvil táctil.
 */

/**
 * Teclas de la barra que no se ven enteras: fuera de la ventana, recortadas por un antepasado que
 * recorta (`overflow`, `clip-path`, `contain: paint`) o encima de la firma. Devuelve también cuántas hay
 * en la lista. Si la barra va despegada (ventana baja), se baja hasta el final de la pantalla: lo que
 * cuenta es que se vean al llegar (la barra despegada sigue `sticky` con su fila de la firma pegada, así
 * que `scrollIntoView` no la trae entera).
 */
function hiddenKeys(page: Page): Promise<{ count: number; hidden: string[] }> {
  return page.evaluate(() => {
    window.scrollTo(0, document.scrollingElement!.scrollHeight)
    const list = document.querySelector('footer ul')
    const keys = [...(list?.children ?? [])] as HTMLElement[]
    const signature = document.querySelector('footer [data-otp-signature]')?.getBoundingClientRect()
    const hidden: string[] = []
    for (const key of keys) {
      const box = key.getBoundingClientRect()
      const name = key.textContent?.trim() ?? '?'
      if (!key.checkVisibility({ visibilityProperty: true }) || box.width < 1 || box.height < 1) {
        hidden.push(`${name}: no se ve`)
        continue
      }
      if (box.left < -0.5 || box.top < -0.5 || box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5)
        hidden.push(`${name}: fuera de la ventana`)
      if (
        signature &&
        Math.min(box.right, signature.right) - Math.max(box.left, signature.left) > 0.5 &&
        Math.min(box.bottom, signature.bottom) - Math.max(box.top, signature.top) > 0.5
      )
        hidden.push(`${name}: pisa la firma`)
      for (let node = key.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node)
        const clips =
          style.overflowX !== 'visible' ||
          style.overflowY !== 'visible' ||
          style.clipPath !== 'none' ||
          /paint|strict|content/.test(style.contain)
        if (!clips) continue
        const rect = node.getBoundingClientRect()
        if (
          box.left < rect.left - 0.5 ||
          box.top < rect.top - 0.5 ||
          box.right > rect.right + 0.5 ||
          box.bottom > rect.bottom + 0.5
        )
          hidden.push(`${name}: recortada por ${node.tagName}`)
      }
    }
    return { count: keys.length, hidden }
  })
}

/**
 * L7: de 721 a unos 1400 px con teclado, las teclas que no cabían en su columna pasaban a una fila
 * oculta (a 823 × 514, 1440 al 175 %, solo se veía «↑↓ ELEGIR»; a 1280, faltaba «M SONIDO»). Ahora, si
 * no caben al lado de la firma, van en su propia fila encima y parten si hace falta.
 */
for (const { width, height } of [
  { width: 721, height: 900 },
  { width: 823, height: 514 },
  { width: 900, height: 700 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
]) {
  test.describe(`barra con teclado a ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } })

    for (const { path, heading, keys } of [
      { path: '/dev/menu', heading: 'Beat Battle', keys: 4 },
      { path: '/como-funciona', heading: 'Cómo se juega', keys: 4 },
      { path: '/ajustes', heading: 'Sonido y efectos', keys: 3 },
    ]) {
      test(`RD-VIS-02 e / WCAG 1.4.10: en ${path} se ven enteras todas las teclas de la barra`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        const { count, hidden } = await hiddenKeys(page)
        expect(count).toBe(keys)
        expect(hidden).toEqual([])
      })
    }
  })
}

/**
 * Hueco entre la última tecla y la firma (§3.4.1 v0.6.6: «entre la última tecla y la firma queda siempre
 * `--bar-gap`»). Mide el texto de la última tecla y el del primer rótulo de la firma («UN JUEGO DE») y lo
 * compara con `--bar-gap` resuelto en la barra. Dice también si van en la misma fila.
 */
function keysToSignature(page: Page): Promise<{ gap: number; barGap: number; sameRow: boolean }> {
  return page.evaluate(() => {
    const bar = document.querySelector('footer')!
    const last = bar.querySelector('ul')!.lastElementChild!
    const text = document.createRange()
    text.selectNodeContents(last)
    const key = text.getBoundingClientRect()
    const signature = bar.querySelector('[data-otp-signature] > span')!.getBoundingClientRect()
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--bar-gap)'
    bar.append(probe)
    const barGap = probe.getBoundingClientRect().width
    probe.remove()
    const middle = (box: DOMRect) => (box.top + box.bottom) / 2
    return {
      gap: signature.left - key.right,
      barGap,
      sameRow: Math.abs(middle(key) - middle(signature)) <= 2,
    }
  })
}

/**
 * Las teclas no se pegan a la firma (cuarto pase del jurado de la 0.28, F1): de ~1362 a ~1407 px «M
 * SONIDO» acababa a 1 px de «UN JUEGO DE» y se leía «SONIDOUN JUEGO DE». El `padding-inline-end` de las
 * teclas, que reserva `--bar-gap`, perdía frente al reset de las listas de `global.css` y la barra no veía
 * el choque. Ahora, si no caben con su hueco, primero se aprietan y, solo si aun así no caben, van a su
 * fila: a 1366 × 657 siguen en una fila (si fueran a la suya, la barra crecería 26 px y el menú dejaría de
 * caber sin desplazar, `fit.spec.ts`).
 */
for (const { width, height } of [
  { width: 1366, height: 657 },
  { width: 1370, height: 768 },
  { width: 1380, height: 700 },
  { width: 1400, height: 800 },
  { width: 1440, height: 900 },
]) {
  test.describe(`hueco de las teclas a ${width} × ${height} con teclado`, () => {
    test.use({ viewport: { width, height } })

    for (const { path, heading } of [
      { path: '/dev/menu', heading: 'Beat Battle' },
      { path: '/', heading: 'Beat Battle' },
      { path: '/como-funciona', heading: 'Cómo se juega' },
    ]) {
      test(`RD-VIS-02 e / RF-OTP-01 (§3.4.1): en ${path} la última tecla queda a --bar-gap de la firma, en su fila`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        const { gap, barGap, sameRow } = await keysToSignature(page)
        expect(barGap, '--bar-gap resuelto').toBeGreaterThan(0)
        expect(sameRow, 'las teclas, en la fila de la firma').toBe(true)
        expect(gap, `hueco de ${gap.toFixed(1)} px entre la última tecla y la firma`).toBeGreaterThanOrEqual(
          barGap - 0.5,
        )
        const { hidden } = await hiddenKeys(page)
        expect(hidden).toEqual([])
      })
    }
  })
}

/**
 * Revisión de L7: con una sola tecla en la barra no hay otra que baje de línea, así que «no cabe» no se
 * notaba en el alto. Con los atajos de una tecla apagados (WCAG 2.1.4, `RNF-A11Y-08`), las pantallas
 * por defecto solo enseñan «ESC VOLVER»; en una columna más estrecha que ella (en /entrar a 390 px,
 * 16 px) quedaba recortada y asomaba una «E» pegada a la firma. Pasa en móvil con teclado y en
 * escritorio con la letra del navegador grande.
 */
for (const { width, height, fontSize } of [
  { width: 390, height: 844, fontSize: 0 },
  { width: 320, height: 568, fontSize: 0 },
  { width: 721, height: 900, fontSize: 24 },
]) {
  test.describe(`una sola tecla con teclado a ${width} × ${height}${fontSize ? ` con letra de ${fontSize} px` : ''}`, () => {
    test.use({ viewport: { width, height } })

    for (const { path, heading } of [
      { path: '/entrar', heading: 'Entrar' },
      { path: '/esto-no-existe', heading: 'Bonus stage' },
    ]) {
      test(`RD-VIS-02 e / RNF-A11Y-08: con los atajos de una tecla apagados, en ${path} «ESC VOLVER» se ve entera y no pisa la firma`, async ({
        page,
      }) => {
        await page.addInitScript(() => localStorage.setItem('bb:shortcuts', 'off'))
        if (fontSize) {
          const cdp = await page.context().newCDPSession(page)
          await cdp.send('Page.enable')
          await cdp.send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: fontSize } })
        }
        await open(page, path, heading)
        await settle(page)
        const { count, hidden } = await hiddenKeys(page)
        expect(count, 'sin M, queda una tecla').toBe(1)
        expect(hidden).toEqual([])
      })
    }
  })
}

/**
 * Lo que la barra tapa al abrir (sin desplazar): el alto de su parte pegada al pie de la ventana (la barra
 * entera o, despegada, la fila de la firma, §3.4.1 v0.6.6), si va pegada, si va entera y de cuántas placas
 * del menú se lee el rótulo («JUGAR») entero por encima de ella (la fila de la firma, pegada, puede tapar
 * el pie de la primera placa, nunca su rótulo).
 */
function barShare(
  page: Page,
): Promise<{ height: number; share: number; pinned: boolean; whole: boolean; plates: number }> {
  return page.evaluate(() => {
    window.scrollTo(0, 0)
    const bar = document.querySelector('footer')!
    const box = bar.getBoundingClientRect()
    const position = getComputedStyle(bar).position
    const pinned = position === 'sticky' || position === 'fixed'
    // Lo que tapa la barra: lo que queda bajo su borde de arriba si va pegada; si no, nada.
    const limit = pinned ? box.top : innerHeight
    const visible = pinned ? Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0)) : 0
    const plates = [...document.querySelectorAll('main [data-menu-plate] [data-plate-label]')].filter(
      (label) => {
        const text = document.createRange()
        text.selectNodeContents(label)
        const rect = text.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= Math.min(limit, innerHeight)
      },
    ).length
    return {
      height: visible,
      share: visible / innerHeight,
      pinned,
      whole: box.bottom <= innerHeight + 0.5,
      plates,
    }
  })
}

/**
 * L8: en una ventana baja con teclado y ratón (360 × 640, 375 × 667), la barra pegada al pie medía 154 px
 * (teclas en dos filas, firma, crónica y pausa), el 24 % de la ventana, y en el menú la primera vista no
 * enseñaba ninguna placa. En su revisión, lo mismo en una ventana estrecha más alta: a 390 × 844 medía
 * 158 px (18,7 %) y empezaba en mitad de «JUGAR». Con puntero fino y una ventana de 720 px de ancho o
 * menos o de 700 px de alto o menos, la barra se despega en cuanto pasa del 15 % de la ventana (en
 * táctil, del 25 %: allí no lleva teclas). También con el escritorio ampliado: a 823 × 514 (1440 × 900 al
 * 175 %) la del menú mide 127 px y, pegada, tapaba «JUGAR» (ninguna placa entera en la primera vista).
 * Despegada, la fila de la firma sigue pegada al pie (§3.4.1 v0.6.6, cuarto pase, F2): lo que queda pegado
 * es esa fila, que no pasa del 15 %, y la firma se ve al abrir.
 */
for (const { width, height } of [
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 823, height: 514 },
]) {
  test.describe(`ventana pequeña con teclado a ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } })

    for (const { path, heading } of [
      { path: '/dev/menu', heading: 'Beat Battle' },
      { path: '/', heading: 'Beat Battle' },
      { path: '/como-funciona', heading: 'Cómo se juega' },
      { path: '/ajustes', heading: 'Sonido y efectos' },
    ]) {
      test(`§3.4.1 / WCAG 1.4.10 / RF-OTP-01: en ${path} lo pegado de la barra no pasa del 15 % de la ventana y la firma se ve`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        const { share, pinned, plates } = await barShare(page)
        if (pinned) expect(share).toBeLessThanOrEqual(0.15)
        // Despegada, la fila de la firma sigue pegada al pie (v0.6.6).
        await expect(page.getByRole('contentinfo').locator('[data-otp-signature]')).toBeInViewport({
          ratio: 1,
        })
        // Por debajo de 700 px de alto (360 × 640, 375 × 667) no se pide: con teclado y ratón la
        // composición de móvil no esconde nada y se desplaza (§3.8.3), y el HUD lleva la temporada y la
        // racha en una segunda fila (§3.4.1 v0.6.6, F3), así que la primera placa queda bajo la primera
        // vista aunque la barra no tape nada más que su fila de la firma.
        if ((path === '/dev/menu' || path === '/') && height > 700)
          expect(plates, 'rótulos de placa en la primera vista').toBeGreaterThan(0)
      })
    }

    test('§3.3 / WCAG 2.4.11: recorriendo el menú con ↓, ninguna placa enfocada queda bajo la barra ni fuera de la ventana', async ({
      page,
    }) => {
      await open(page, '/dev/menu', 'Beat Battle')
      const problems: string[] = []
      for (let step = 0; step < 6; step++) {
        await page.keyboard.press('ArrowDown')
        await page.evaluate(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
        )
        const problem = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement
          const bar = document.querySelector('footer')!
          const box = focused.getBoundingClientRect()
          const sticky = getComputedStyle(bar).position === 'sticky'
          const covered = sticky ? Math.max(0, box.bottom - bar.getBoundingClientRect().top) : 0
          const inside = box.top >= 0 && box.bottom <= innerHeight
          return covered > 0.5 || !inside
            ? `${focused.textContent?.slice(0, 20)}: tapado ${covered}, entero=${inside}`
            : null
        })
        if (problem) problems.push(problem)
      }
      expect(problems).toEqual([])
    })
  })
}

/**
 * Lo que no cambia: en táctil y en una ventana de escritorio de tamaño normal la barra sigue pegada (la
 * firma se ve al abrir). A 1024 × 768 con teclado, la del menú (teclas, firma y crónica en tres filas)
 * mide el 16,5 %: por debajo del cuarto de la ventana, que es el límite fuera de las ventanas pequeñas.
 */
for (const { width, height, touch } of [
  { width: 360, height: 640, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 1024, height: 768, touch: false },
  { width: 1280, height: 720, touch: false },
]) {
  test.describe(`barra pegada a ${width} × ${height}${touch ? ' táctil' : ' con teclado'}`, () => {
    test.use({ viewport: { width, height }, isMobile: touch, hasTouch: touch })

    for (const { path, heading } of [
      { path: '/como-funciona', heading: 'Cómo se juega' },
      { path: '/dev/menu', heading: 'Beat Battle' },
    ]) {
      test(`§3.4.1 / RF-OTP-01: en ${path} la barra va pegada al pie con la firma a la vista`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        const { pinned, whole } = await barShare(page)
        expect(pinned).toBe(true)
        expect(whole, 'la barra entera, no solo la fila de la firma').toBe(true)
        await expect(page.getByRole('contentinfo').locator('[data-otp-signature]')).toBeInViewport({
          ratio: 1,
        })
      })
    }
  })
}

/**
 * La crónica con la letra del navegador grande (cuarto pase del jurado de la 0.28, F6): a 1440 × 900 con
 * la letra por defecto a 24 px iba en la columna de la derecha y acababa en «Inserta tu beat · Crédit…»
 * (WCAG 1.4.4). Ahora, si un mensaje no cabe en una línea, parte en dos; dos líneas caben en el alto del
 * botón de pausa, así que la barra no cambia de alto al rotar. Se recorren los cuatro mensajes con el reloj
 * de la página falso.
 */
for (const { width, height, fontSize } of [
  { width: 1440, height: 900, fontSize: 24 },
  { width: 1440, height: 900, fontSize: 20 },
  { width: 1024, height: 768, fontSize: 24 },
  { width: 390, height: 844, fontSize: 24 },
]) {
  test.describe(`crónica con letra de ${fontSize} px a ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } })

    test('RD-VIS-02 e / §3.8.3 (WCAG 1.4.4): ningún mensaje de la crónica se corta y la barra no cambia de alto al rotar', async ({
      page,
    }) => {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Page.enable')
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: fontSize } })
      await page.clock.install()
      await open(page, '/dev/menu', 'Beat Battle')
      await page.mouse.move(0, 0)
      const chronicle = page.getByRole('contentinfo').locator('[data-chronicle]')
      const seen = new Set<string>()
      const heights = new Set<number>()
      for (let step = 0; step < 4; step++) {
        await expect(chronicle).not.toContainText([...seen].at(-1) ?? '\u0000')
        const state = await chronicle.evaluate((line) => ({
          text: line.lastElementChild?.textContent ?? '',
          cut: line.scrollHeight > line.clientHeight + 1 || line.scrollWidth > line.clientWidth + 1,
          bar: Math.round(line.closest('footer')!.getBoundingClientRect().height),
        }))
        expect(state.cut, `«${state.text}» se corta`).toBe(false)
        seen.add(state.text)
        heights.add(state.bar)
        await page.clock.runFor(5_000)
      }
      expect(seen.size, 'los cuatro mensajes').toBe(4)
      expect([...heights], 'un solo alto de barra').toHaveLength(1)
    })
  })
}

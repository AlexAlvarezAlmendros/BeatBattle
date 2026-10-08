import { expect, type Page, test } from '@playwright/test'

/**
 * Rendimiento de la home sobre la build de producción (`vite preview`, proyecto `perf` de
 * `playwright.config.ts`), en el móvil y la red de §4.17: 4G lento (150 ms de RTT, 1,6 Mbit/s) y CPU ×4,
 * 412 × 823 a DPR 1,75. Es la comprobación de `RNF-PERF-02` hasta que llegue Lighthouse CI (Fase 10):
 *
 * - el LCP es un texto —el título del escenario de la semana, que con el calendario vacío es «El
 *   próximo drop está en el horno»— y no el logo (SVG) ni un lienzo, y se pinta con la primera pintura
 *   (§3.5), y
 * - el LCP queda por debajo de 2,5 s (mediana de tres cargas en frío).
 *
 * La CPU ×4 multiplica la de la máquina que corre el test: en local (la de referencia de las medidas del
 * plan) el presupuesto absoluto se exige; en la CI, con una CPU más lenta y render por software, el
 * número no sería el de un móvil medio, así que allí se exige lo que no depende de la máquina (titular
 * en la primera pintura) y el LCP queda anotado. El presupuesto en CI llega con Lighthouse CI (Fase 10).
 */

const RUNS = 3
/** En la CI no se exige el número absoluto (ver arriba). */
const ENFORCE_BUDGET = !process.env.CI
const LCP_BUDGET_MS = 2_500
/** Margen entre la primera pintura y el LCP: el titular sale en el mismo fotograma. */
const LCP_AFTER_FCP_MAX_MS = 100

interface PaintTimes {
  fcp: number
  lcp: number
  element: string
}

declare global {
  interface Window {
    __bbLcp: { time: number; element: string }[]
  }
}

/**
 * Una carga en frío de la home. Con `title`, la de la primera visita de la sesión, con la pantalla de
 * título (§3.8.1) encima; sin él, la de quien ya ha entrado (la puerta apagada).
 */
async function coldLoad(page: Page, title = false): Promise<PaintTimes> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addInitScript((withTitle) => {
    if (!withTitle) window.localStorage.setItem('bb:title', 'off')
    window.__bbLcp = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { element?: Element | null })[])
        window.__bbLcp.push({
          time: entry.startTime,
          element: entry.element ? `${entry.element.tagName} ${entry.element.className.toString()}` : '',
        })
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  }, title)
  await page.goto('/', { waitUntil: 'load' })
  if (title)
    await expect(page.getByRole('dialog', { name: 'Beat Battle, un juego de Other People' })).toBeVisible()
  else
    await expect(
      page.getByRole('heading', { level: 2, name: 'El próximo drop está en el horno' }),
    ).toBeVisible()
  // El LCP se da por cerrado con la primera interacción; hasta entonces, se espera a que asiente.
  await page.waitForTimeout(1_500)
  const times = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? Number.NaN,
    last: window.__bbLcp.at(-1),
  }))
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  return { fcp: times.fcp, lcp: times.last?.time ?? Number.NaN, element: times.last?.element ?? '' }
}

test.use({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true })

test('RNF-PERF-02: LCP de la home < 2,5 s en 4G lento con CPU ×4; es un texto (el título del escenario) y sale con la primera pintura', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const samples: PaintTimes[] = []
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 823 },
      deviceScaleFactor: 1.75,
      isMobile: true,
      hasTouch: true,
      baseURL: test.info().project.use.baseURL,
    })
    samples.push(await coldLoad(await context.newPage()))
    await context.close()
  }
  const summary = samples
    .map((s) => `FCP ${Math.round(s.fcp)} ms, LCP ${Math.round(s.lcp)} ms (${s.element})`)
    .join(' | ')
  test.info().annotations.push({ type: 'LCP', description: summary })

  for (const sample of samples) {
    // Un texto: el título del escenario de la tarjeta de la semana (ni el logo, que se pinta en un canvas, ni otro lienzo).
    expect(sample.element, summary).toMatch(/^H2 .*title/i)
    expect(sample.lcp - sample.fcp, summary).toBeLessThanOrEqual(LCP_AFTER_FCP_MAX_MS)
  }
  const median = samples.map((s) => s.lcp).sort((a, b) => a - b)[Math.floor(RUNS / 2)] ?? Number.NaN
  if (ENFORCE_BUDGET) expect(median, summary).toBeLessThan(LCP_BUDGET_MS)
})

/**
 * La primera visita de la sesión, con la pantalla de título encima (§3.8.1, tarea 1.13): el LCP es un texto
 * de la puerta, se pinta con la primera pintura (el título está pintado debajo de la capa negra del
 * arranque) y queda por debajo de 2,5 s. Al principio salía al acabar el arranque: 3,2 s.
 */
test('RNF-PERF-02 / §3.8.1: con la pantalla de título, el LCP de la primera visita es un texto, sale con la primera pintura y queda < 2,5 s', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const samples: PaintTimes[] = []
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 823 },
      deviceScaleFactor: 1.75,
      isMobile: true,
      hasTouch: true,
      baseURL: test.info().project.use.baseURL,
    })
    samples.push(await coldLoad(await context.newPage(), true))
    await context.close()
  }
  const summary = samples
    .map((s) => `FCP ${Math.round(s.fcp)} ms, LCP ${Math.round(s.lcp)} ms (${s.element})`)
    .join(' | ')
  test.info().annotations.push({ type: 'LCP', description: summary })
  for (const sample of samples) {
    // Un texto (ni la pegatina, que es una imagen, ni el logo o el disco, que son lienzos).
    expect(sample.element, summary).not.toMatch(/^(IMG|CANVAS|PICTURE|SVG)\b/i)
    expect(sample.element, summary).not.toBe('')
    expect(sample.lcp - sample.fcp, summary).toBeLessThanOrEqual(LCP_AFTER_FCP_MAX_MS)
  }
  const median = samples.map((s) => s.lcp).sort((a, b) => a - b)[Math.floor(RUNS / 2)] ?? Number.NaN
  if (ENFORCE_BUDGET) expect(median, summary).toBeLessThan(LCP_BUDGET_MS)
})

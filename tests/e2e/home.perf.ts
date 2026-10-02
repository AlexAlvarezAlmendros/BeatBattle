import { expect, type Page, test } from '@playwright/test'

/**
 * Rendimiento de la home sobre la build de producción (`vite preview`, proyecto `perf` de
 * `playwright.config.ts`), en el móvil y la red de §4.17: 4G lento (150 ms de RTT, 1,6 Mbit/s) y CPU ×4,
 * 412 × 823 a DPR 1,75. Es la comprobación de `RNF-PERF-02` hasta que llegue Lighthouse CI (Fase 10):
 *
 * - el LCP es el titular «BEAT / BATTLE» y se pinta con la primera pintura (sin la entrada escalonada
 *   con opacidad 0, que lo retrasaba ~650 ms), y
 * - el LCP queda por debajo de 2,5 s (mediana de tres cargas en frío).
 */

const RUNS = 3
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

async function coldLoad(page: Page): Promise<PaintTimes> {
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
  await page.addInitScript(() => {
    window.__bbLcp = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { element?: Element | null })[])
        window.__bbLcp.push({ time: entry.startTime, element: entry.element?.className.toString() ?? '' })
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.getByRole('heading', { level: 1, name: 'Beat Battle' })).toBeVisible()
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

test('RNF-PERF-02: LCP de la home < 2,5 s en 4G lento con CPU ×4, con el titular en la primera pintura', async ({
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
  const summary = samples.map((s) => `FCP ${Math.round(s.fcp)} ms, LCP ${Math.round(s.lcp)} ms`).join(' | ')
  test.info().annotations.push({ type: 'LCP', description: summary })

  for (const sample of samples) {
    expect(sample.element, summary).toContain('hero-title__line')
    expect(sample.lcp - sample.fcp, summary).toBeLessThanOrEqual(LCP_AFTER_FCP_MAX_MS)
  }
  const median = samples.map((s) => s.lcp).sort((a, b) => a - b)[Math.floor(RUNS / 2)] ?? Number.NaN
  expect(median, summary).toBeLessThan(LCP_BUDGET_MS)
})

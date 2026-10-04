#!/usr/bin/env node
// HERRAMIENTA HISTÓRICA (tarea 0.27, guía v0.6): la «prueba del sello» se abandonó el 2026-10-03, cuando
// la dirección de arte pasó a ser la «Arena» (§3). Se conserva para poder regenerar la evidencia de
// `docs/planning/evidence/f0/otp/` (histórico), no como prueba de la interfaz actual: lo que mide
// (isla, hero, pie del sello…) ya no existe en BeatBattle. La prueba vigente es la de marca y de juego
// (`RD-VIS-02`, `tests/e2e/brand.spec.ts`).
//
// Capturas y medidas de referencia de la web del sello (otherpeople.es) para la «prueba del sello»
// (guía §3.1, `RD-VIS-02`, tarea 0.14). Captura la home (arriba, lanzamientos y últimos beats),
// `/beats` en lista y la ficha de un beat a 1440×900 y 390×844, y escribe `otp-metrics.json` con
// medidas reales sacadas con `getComputedStyle`/`getBoundingClientRect` y la fuente que el navegador
// usa de verdad para pintar cada texto (`CSS.getPlatformFontsForNode` del protocolo de DevTools).
//
// Uso: node tools/shot/otp.mjs [opciones]
//   --base=https://www.otherpeople.es   web del sello
//   --out=docs/planning/evidence/f0/otp carpeta de salida (relativa a la raíz del repo)
//   --beat=/beats/<id>                  ficha a capturar (por defecto, el primer beat de /beats)
//   --settle=3000                       espera tras cargar los datos, en ms
//   --only=desktop|mobile               solo un tamaño
//   --no-lite                           deja los PNG tal cual (sin reducir a paleta)
//   --headed                            con ventana visible
//
// Notas:
// - Se fija `localStorage.newsletter_popup_seen = 'true'` antes de cargar: si no, sale el popup de
//   la newsletter encima de todo.
// - Se espera a `domcontentloaded` y a que lleguen los datos (sin esqueletos), nunca a `load`: el
//   vídeo del hero y el fondo WebGL pueden retrasarlo indefinidamente.
// - Se bloquean las peticiones de analítica para no ensuciar las estadísticas del sello.
// - El fondo Silk del sello lleva grano animado, que en PNG no se comprime: cada captura de
//   escritorio pesa ~1,5 MB. Si hay `python3` con Pillow, se reducen a paleta de 256 colores con
//   tramado (menos de la mitad). Los colores exactos están en `otp-metrics.json`, no en los PNG.
//
// `ab.mjs` importa de aquí las piezas que mide (`HOME_TOP`, `BEATS`…) y la forma de abrir el sello
// (`newOtpContext`, `openOtp`): el script solo captura cuando se ejecuta directamente.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fontInventoryInPage,
  launchChrome,
  lighten,
  measureInPage,
  newCaptureContext,
  parseArgs,
  platformFonts,
  VIEWPORTS,
} from './measure.mjs'

export const OTP_BASE = 'https://www.otherpeople.es'
const DATA_TIMEOUT = 45_000

/** Analítica del sello: se bloquea para no ensuciar sus estadísticas. */
export const BLOCKED = [
  /analiticas\.alexalvarez\.dev/,
  /\/_vercel\/(speed-)?insights\//,
  /google-analytics|googletagmanager/,
]

// ── Qué se mide ────────────────────────────────────────────────────────────────────────────────
// Cada entrada: selector, grupos de propiedades (box, text, stroke, layout) y, opcionalmente, el
// pseudoelemento. Se mide el primer elemento visible que casa (en móvil y escritorio el sello
// alterna piezas ocultas con `display: none`).
export const HOME_TOP = {
  page: { selector: 'body', groups: ['text', 'box'] },
  navIsland: { selector: 'header.header', groups: ['box', 'layout'] },
  logo: { selector: '.logo-section .logo', groups: ['box', 'layout'] },
  navLink: { selector: '.nav-links a:not(.active)', groups: ['text', 'box'] },
  navLinkActive: { selector: '.nav-links a.active', groups: ['text', 'box'] },
  navLinks: { selector: '.nav-links', groups: ['box', 'layout'] },
  loginButton: { selector: 'header .login-button', groups: ['box', 'text'] },
  mobileNavToggle: { selector: '.mobile-nav-toggle', groups: ['box', 'layout'] },
  heroTitle: { selector: '.hero-title', groups: ['text', 'box'] },
  heroTitleSolid: {
    selector: '.hero-title__line:not(.hero-title__line--accent)',
    groups: ['text', 'stroke', 'box'],
  },
  heroTitleOutline: { selector: '.hero-title__line--accent', groups: ['text', 'stroke', 'box'] },
  heroDivider: { selector: '.hero-divider', groups: ['box'] },
  heroSubtitle: { selector: '.hero-subtitle', groups: ['text', 'box'] },
  heroSide: { selector: '.hero-side__text', groups: ['text', 'box', 'layout'] },
  heroGrid: { selector: '.hero-grid', groups: ['box', 'layout'] },
  heroVignette: { selector: '.hero-vignette', groups: ['box'] },
  heroLogo: { selector: '.hero-logo', groups: ['box'] },
  ctaPrimary: { selector: '.hero-cta--primary', groups: ['box', 'text'] },
  ctaGhost: { selector: '.hero-cta--ghost', groups: ['box', 'text'] },
  marquee: { selector: '.hero-marquee', groups: ['box'] },
  marqueeItem: { selector: '.hero-marquee__item', groups: ['text'] },
  marqueeDot: { selector: '.hero-marquee__dot', groups: ['box'] },
  silk: { selector: '.silk-background', groups: ['box', 'layout'] },
}
export const HOME_SECTIONS = {
  sectionTitle: { selector: '.ultimos-lanzamientos-title', groups: ['text', 'box'] },
  releaseCard: { selector: '.ultimos-lanzamientos-list .card', groups: ['box', 'layout'] },
  releaseCardImage: { selector: '.ultimos-lanzamientos-list .card .card-image-link', groups: ['box'] },
  releaseCardTitle: { selector: '.ultimos-lanzamientos-list .card-content h2', groups: ['text'] },
  releaseCardArtists: { selector: '.ultimos-lanzamientos-list .card-content p', groups: ['text'] },
  releaseCardLink: { selector: '.ultimos-lanzamientos-list .card__buttons a', groups: ['box', 'text'] },
  beatCard: { selector: '.ultimos-beats-list .card', groups: ['box', 'layout'] },
  beatCardTitle: { selector: '.ultimos-beats-list .card-content h2', groups: ['text'] },
  beatCardMeta: { selector: '.ultimos-beats-list .card-content p + p', groups: ['text'] },
  beatCardPlay: { selector: '.ultimos-beats-list .beat-play-button', groups: ['box'] },
  beatCardBuy: { selector: '.ultimos-beats-list .beat-purchase-btn', groups: ['box', 'text'] },
}
export const BEATS = {
  pageTitle: { selector: '.beats-page-header h1', groups: ['text'] },
  genreChip: { selector: '.genre-chip', groups: ['box', 'text'] },
  filterSelect: { selector: '.beats-filter-select', groups: ['box', 'text'] },
  viewToggleActive: { selector: '.beats-view-btn.active', groups: ['box'] },
  row: { selector: '.beat-list-row', groups: ['box', 'layout'] },
  rowThumb: { selector: '.beat-list-row__thumb', groups: ['box'] },
  rowPlay: { selector: '.beat-list-row__play', groups: ['box'] },
  rowTitle: { selector: '.beat-list-row__title', groups: ['text'] },
  rowProducer: { selector: '.beat-list-row__producer', groups: ['text'] },
  rowGenreTag: { selector: '.beat-list-row__tag', groups: ['box', 'text'] },
  rowMeta: { selector: '.beat-list-row__dot', groups: ['text'] },
  rowMetaDot: { selector: '.beat-list-row__dot', pseudo: '::before', groups: ['box', 'text'] },
  rowTime: { selector: '.beat-list-row__time', groups: ['text'] },
  rowProgress: { selector: '.beat-list-row__progress-wrap', groups: ['box'] },
  rowPrice: { selector: '.beat-list-row__price', groups: ['text'] },
  rowDownload: { selector: '.beat-list-row__download-btn', groups: ['box'] },
  rowBuy: { selector: '.beat-list-row__buy', groups: ['box', 'text'] },
}
export const BEAT_DETAIL = {
  backLink: { selector: '.beat-detail__back-link', groups: ['text'] },
  cover: { selector: '.beat-detail__cover-wrapper', groups: ['box'] },
  title: { selector: '.beat-detail__title', groups: ['text'] },
  producer: { selector: '.beat-detail__producer', groups: ['text'] },
  player: { selector: '.beat-detail__player', groups: ['box'] },
  playerPlay: { selector: '.beat-detail__player-play', groups: ['box'] },
  tag: { selector: '.beat-detail__tag', groups: ['box', 'text'] },
  sectionLabel: { selector: '.beat-detail__section-title', groups: ['text'] },
  infoLabel: { selector: '.beat-detail__info-title', groups: ['text'] },
  infoLabelBar: { selector: '.beat-detail__info-title', pseudo: '::before', groups: ['box'] },
  dataTile: { selector: '.beat-detail__info-item', groups: ['box', 'layout'] },
  dataTileIcon: { selector: '.beat-detail__info-icon', groups: ['text', 'box'] },
  dataTileLabel: { selector: '.beat-detail__info-label', groups: ['text'] },
  dataTileValue: { selector: '.beat-detail__info-value', groups: ['text'] },
  licenseCard: { selector: '.beat-detail__license-card:not(.selected)', groups: ['box'] },
  licenseCardSelected: { selector: '.beat-detail__license-card.selected', groups: ['box'] },
  buyNow: { selector: '.beat-detail__buy-now-btn, .beat-detail__mobile-buy-btn', groups: ['box', 'text'] },
  downloadBtn: { selector: '.beat-detail__download-btn', groups: ['box', 'text'] },
}
// Textos cuya fuente real se consulta al navegador.
export const FONT_PROBES = {
  home: {
    navLink: '.nav-links a',
    heroTitle: '.hero-title__line',
    heroSubtitle: '.hero-subtitle',
    ctaPrimary: '.hero-cta--primary',
    sectionTitle: '.ultimos-lanzamientos-title',
  },
  beats: {
    rowTitle: '.beat-list-row__title',
    rowMeta: '.beat-list-row__dot',
    rowTime: '.beat-list-row__time',
  },
  beatDetail: { title: '.beat-detail__title', dataTileValue: '.beat-detail__info-value' },
}

// ── Navegación ─────────────────────────────────────────────────────────────────────────────────
/**
 * Contexto de navegador para el sello: condiciones de las capturas, sin el popup de la newsletter y
 * con la analítica bloqueada.
 */
export async function newOtpContext(browser, vp) {
  const context = await newCaptureContext(browser, vp)
  await context.addInitScript(() => {
    try {
      localStorage.setItem('newsletter_popup_seen', 'true')
    } catch {}
  })
  await context.route(
    (url) => BLOCKED.some((re) => re.test(url.href)),
    (route) => route.abort(),
  )
  return context
}

/**
 * Abre `path` del sello y espera a sus datos: `domcontentloaded`, `readySelector`, sin esqueletos de
 * carga y `settle` ms más. Nunca `load`: el vídeo del hero y el fondo WebGL pueden retrasarlo sin fin.
 */
export async function openOtp(page, { base = OTP_BASE, path, readySelector, settle = 3000 }) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(readySelector, { timeout: DATA_TIMEOUT })
  await page
    .waitForFunction(() => document.querySelectorAll('[class*="skeleton-card"]').length === 0, null, {
      timeout: DATA_TIMEOUT,
    })
    .catch(() => console.warn(`  aviso: ${path} sigue con esqueletos de carga`))
  await page.waitForTimeout(settle)
}

/** Lleva `selector` justo por debajo de la isla de navegación (`island`, la del sello por defecto). */
export async function scrollBelowIsland(page, selector, island = 'header.header') {
  await page.evaluate(
    ([sel, islandSel]) => {
      const el = document.querySelector(sel)
      const box = document.querySelector(islandSel)?.getBoundingClientRect()
      const offset = (box ? box.bottom : 0) + 24
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
    },
    [selector, island],
  )
  await page.waitForTimeout(1200)
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const opt = parseArgs(process.argv.slice(2))
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
  const base = String(opt.base ?? OTP_BASE).replace(/\/$/, '')
  const outDir = resolve(repoRoot, String(opt.out ?? 'docs/planning/evidence/f0/otp'))
  const settle = Number(opt.settle ?? 3000)
  const viewports = VIEWPORTS.filter((v) => !opt.only || v.name === opt.only)
  const open = (page, path, readySelector) => openOtp(page, { base, path, readySelector, settle })

  const shots = []
  const shoot = async (page, file) => {
    const path = join(outDir, file)
    await page.screenshot({ path })
    shots.push(path)
    console.log(`  ${file}`)
  }

  await mkdir(outDir, { recursive: true })
  const browser = await launchChrome({ headed: Boolean(opt.headed) })
  // Con --only se conserva el otro tamaño del otp-metrics.json existente en lugar de pisarlo.
  const previous = opt.only
    ? await readFile(join(outDir, 'otp-metrics.json'), 'utf8').then(JSON.parse, () => null)
    : null
  const metrics = {
    capturedAt: new Date().toISOString(),
    base,
    browser: `Chrome ${browser.version()}`,
    platform: process.platform,
    beatPath: null,
    viewports: { ...(previous?.viewports ?? {}) },
  }

  try {
    for (const vp of viewports) {
      console.log(`${vp.name} ${vp.viewport.width}×${vp.viewport.height}`)
      const context = await newOtpContext(browser, vp)
      const page = await context.newPage()
      const m = { viewport: vp.viewport }

      // Home: arriba (isla, logo, hero), lanzamientos y últimos beats.
      await open(page, '/', '.ultimos-beats-list')
      m.home = { ...(await page.evaluate(measureInPage, HOME_TOP)) }
      m.home.fonts = await platformFonts(page, FONT_PROBES.home)
      m.home.fontInventory = await page.evaluate(fontInventoryInPage)
      m.home.htmlBackground = await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      )
      await shoot(page, `home-top-${vp.name}.png`)
      await scrollBelowIsland(page, '.ultimos-lanzamientos-title')
      Object.assign(m.home, await page.evaluate(measureInPage, HOME_SECTIONS))
      await shoot(page, `home-releases-${vp.name}.png`)
      await scrollBelowIsland(page, '.ultimos-beats-title')
      await shoot(page, `home-beats-${vp.name}.png`)

      // /beats en lista (la vista por defecto).
      await open(page, '/beats', '.beat-list-row')
      if (!(await page.$('.beats-view-btn.active[aria-label*="lista"]'))) {
        await page.click('.beats-view-btn[aria-label*="lista"]').catch(() => {})
        await page.waitForTimeout(800)
      }
      m.beats = await page.evaluate(measureInPage, BEATS)
      m.beats.fonts = await platformFonts(page, FONT_PROBES.beats)
      m.beats.rowCount = await page.$$eval('.beat-list-row', (rows) => rows.length)
      await shoot(page, `beats-list-${vp.name}.png`)
      const beatPath = String(
        opt.beat ?? (await page.$eval('.beat-list-row__title-link', (a) => a.getAttribute('href'))),
      )
      metrics.beatPath ??= beatPath
      // Chip de género activo (después de la captura: filtrar cambia la lista).
      try {
        await page.click('.genre-chip', { timeout: 5000 })
        await page.waitForTimeout(600)
        m.beats.genreChipActive = (
          await page.evaluate(measureInPage, {
            chip: { selector: '.genre-chip.active', groups: ['box', 'text'] },
          })
        ).chip
      } catch (e) {
        console.warn(`  aviso: no se pudo medir el chip activo (${e.message.split('\n')[0]})`)
      }

      // Ficha de un beat (siempre la misma en los dos tamaños).
      await open(page, metrics.beatPath, '.beat-detail__title')
      m.beatDetail = await page.evaluate(measureInPage, BEAT_DETAIL)
      m.beatDetail.fonts = await platformFonts(page, FONT_PROBES.beatDetail)
      await shoot(page, `beat-detail-${vp.name}.png`)

      metrics.viewports[vp.name] = m
      await context.close()
    }

    await writeFile(join(outDir, 'otp-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)
    console.log(`otp-metrics.json → ${outDir}`)
  } finally {
    // Si el sello no responde o cambia un selector, Chrome no se queda vivo.
    await browser.close()
  }
  if (!opt['no-lite']) lighten(shots)
}

// Solo captura al ejecutarse directamente (`node tools/shot/otp.mjs`), no al importarlo desde `ab.mjs`.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

#!/usr/bin/env node
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
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=')
      return [k, v.length ? v.join('=') : true]
    }),
)
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const base = String(opt.base ?? 'https://www.otherpeople.es').replace(/\/$/, '')
const outDir = resolve(repoRoot, String(opt.out ?? 'docs/planning/evidence/f0/otp'))
const settle = Number(opt.settle ?? 3000)
const DATA_TIMEOUT = 45_000

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
].filter((v) => !opt.only || v.name === opt.only)

const BLOCKED = [
  /analiticas\.alexalvarez\.dev/,
  /\/_vercel\/(speed-)?insights\//,
  /google-analytics|googletagmanager/,
]

// ── Qué se mide ────────────────────────────────────────────────────────────────────────────────
// Cada entrada: selector, grupos de propiedades (box, text, stroke, layout) y, opcionalmente, el
// pseudoelemento. Se mide el primer elemento visible que casa (en móvil y escritorio el sello
// alterna piezas ocultas con `display: none`).
const HOME_TOP = {
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
const HOME_SECTIONS = {
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
const BEATS = {
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
const BEAT_DETAIL = {
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
const FONT_PROBES = {
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

// ── Medición dentro de la página ───────────────────────────────────────────────────────────────
function measureInPage(spec) {
  const round = (n) => Math.round(n * 100) / 100
  const px = (v) => (v.endsWith('px') ? round(Number.parseFloat(v)) : v)
  const out = {}
  for (const [name, { selector, groups, pseudo }] of Object.entries(spec)) {
    const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length > 0)
    if (!el) {
      out[name] = null
      continue
    }
    const cs = getComputedStyle(el, pseudo ?? null)
    if (pseudo && (cs.content === 'none' || cs.content === 'normal')) {
      out[name] = null
      continue
    }
    const m = { selector: pseudo ? `${selector}${pseudo}` : selector }
    if (!pseudo) {
      const r = el.getBoundingClientRect()
      m.rect = { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) }
      // Tamaño CSS sin transformar (el rectángulo de un elemento girado es su caja envolvente).
      m.size = { width: px(cs.width), height: px(cs.height) }
      m.text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) || undefined
    } else {
      m.size = { width: px(cs.width), height: px(cs.height) }
    }
    if (groups.includes('box')) {
      Object.assign(m, {
        borderRadius: cs.borderRadius,
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage === 'none' ? undefined : cs.backgroundImage.slice(0, 300),
        backgroundSize: cs.backgroundImage === 'none' ? undefined : cs.backgroundSize,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        boxShadow: cs.boxShadow,
        backdropFilter: cs.backdropFilter,
        padding: cs.padding,
        opacity: cs.opacity,
      })
    }
    if (groups.includes('text')) {
      const size = Number.parseFloat(cs.fontSize)
      const spacing = cs.letterSpacing === 'normal' ? 0 : Number.parseFloat(cs.letterSpacing)
      Object.assign(m, {
        fontFamily: cs.fontFamily,
        fontSize: px(cs.fontSize),
        fontWeight: cs.fontWeight,
        letterSpacing: cs.letterSpacing,
        letterSpacingEm: round(spacing / size),
        lineHeight: cs.lineHeight,
        textTransform: cs.textTransform,
        color: cs.color,
        fontVariantNumeric: cs.fontVariantNumeric,
      })
    }
    if (groups.includes('stroke')) {
      Object.assign(m, {
        webkitTextStroke: `${cs.webkitTextStrokeWidth} ${cs.webkitTextStrokeColor}`,
        webkitTextFillColor: cs.webkitTextFillColor,
        textShadow: cs.textShadow,
      })
    }
    if (groups.includes('layout')) {
      // Giro total: el de `transform` (matriz 2D) más el de la propiedad `rotate` (p. ej. el logo).
      const t = cs.transform
      const mt = /^matrix\(([^)]+)\)$/.exec(t)
      const [a = 1, b = 0] = mt ? mt[1].split(',').map(Number) : []
      const rotateProp = /^(-?[\d.]+)deg$/.exec(cs.rotate)
      const rotateDeg = round((Math.atan2(b, a) * 180) / Math.PI + (rotateProp ? Number(rotateProp[1]) : 0))
      Object.assign(m, {
        position: cs.position,
        top: cs.top,
        left: cs.left,
        zIndex: cs.zIndex,
        display: cs.display,
        gap: cs.gap,
        transform: t,
        rotate: cs.rotate,
        rotateDeg,
        writingMode: cs.writingMode,
        maskImage: cs.maskImage === 'none' ? undefined : cs.maskImage.slice(0, 200),
        style:
          el
            .getAttribute('style')
            ?.replace(/url\([^)]*\)/g, 'url(…)')
            .slice(0, 300) || undefined,
      })
    }
    out[name] = JSON.parse(JSON.stringify(m))
  }
  return out
}

/** Fuente con la que el navegador pinta de verdad el texto de cada selector. */
async function platformFonts(page, probes) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
  const out = {}
  for (const [name, selector] of Object.entries(probes)) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    if (!nodeId) {
      out[name] = null
      continue
    }
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    out[name] = { selector, fonts }
  }
  await cdp.detach()
  return out
}

/** Qué fuentes declara y carga la página (para saber si Montserrat llega a cargarse). */
function fontInventoryInPage() {
  const faces = []
  const externalSheets = []
  for (const sheet of document.styleSheets) {
    if (sheet.href) externalSheets.push(sheet.href)
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        faces.push(rule.style.getPropertyValue('font-family').replace(/['"]/g, ''))
      }
    }
  }
  return {
    fontFaceRules: [...new Set(faces)],
    documentFonts: [...document.fonts].map(
      (f) => `${f.family.replace(/['"]/g, '')} ${f.weight} (${f.status})`,
    ),
    googleFontsLink: Boolean(
      document.querySelector('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"]'),
    ),
    montserratFontFace: [...document.fonts].some((f) => /montserrat/i.test(f.family)),
    externalSheets,
  }
}

// ── Navegación ─────────────────────────────────────────────────────────────────────────────────
async function open(page, path, readySelector) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(readySelector, { timeout: DATA_TIMEOUT })
  await page
    .waitForFunction(() => document.querySelectorAll('[class*="skeleton-card"]').length === 0, null, {
      timeout: DATA_TIMEOUT,
    })
    .catch(() => console.warn(`  aviso: ${path} sigue con esqueletos de carga`))
  await page.waitForTimeout(settle)
}

/** Lleva `selector` justo por debajo de la isla de navegación. */
async function scrollBelowIsland(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const island = document.querySelector('header.header')?.getBoundingClientRect()
    const offset = (island ? island.bottom : 0) + 24
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
  }, selector)
  await page.waitForTimeout(1200)
}

const shots = []
async function shoot(page, file) {
  const path = join(outDir, file)
  await page.screenshot({ path })
  shots.push(path)
  console.log(`  ${file}`)
}

/** Reduce los PNG a 256 colores con tramado Floyd-Steinberg usando Pillow, si está instalado. */
function lighten(files) {
  const code = [
    'import sys',
    'from PIL import Image',
    'for f in sys.argv[1:]:',
    "    im = Image.open(f).convert('RGB')",
    // `quantize` solo aplica el tramado cuando recibe una paleta: primero se calcula y luego se usa.
    '    palette = im.quantize(256, method=Image.Quantize.MEDIANCUT)',
    '    im.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG).save(f, optimize=True)',
  ].join('\n')
  const r = spawnSync('python3', ['-c', code, ...files], { stdio: 'inherit' })
  if (r.status !== 0) console.warn('aviso: sin python3 + Pillow; los PNG quedan sin reducir')
  else console.log(`PNG reducidos a paleta de 256 colores (${files.length})`)
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────
await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !opt.headed,
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
})
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
  for (const vp of VIEWPORTS) {
    console.log(`${vp.name} ${vp.viewport.width}×${vp.viewport.height}`)
    const context = await browser.newContext({
      viewport: vp.viewport,
      deviceScaleFactor: 1,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
    })
    await context.addInitScript(() => {
      try {
        localStorage.setItem('newsletter_popup_seen', 'true')
      } catch {}
    })
    await context.route(
      (url) => BLOCKED.some((re) => re.test(url.href)),
      (route) => route.abort(),
    )
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

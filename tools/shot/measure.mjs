// Piezas comunes de las capturas con medidas (`otp.mjs` y `ab.mjs`): opciones de la línea de órdenes,
// Chrome del sistema, medición dentro de la página (`getComputedStyle`/`getBoundingClientRect`),
// fuente real de cada texto y reducción de los PNG a paleta.
import { spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

/** `--clave=valor` → `{ clave: 'valor' }`; `--bandera` → `{ bandera: true }`. */
export function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [k, ...v] = a.slice(2).split('=')
        return [k, v.length ? v.join('=') : true]
      }),
  )
}

/** Los dos tamaños de la guía (§4.16): escritorio 1440×900 y móvil 390×844 táctil. */
export const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
]

/** Chrome del sistema con la GPU real (Vulkan), como `shot.mjs`. */
export function launchChrome({ headed = false } = {}) {
  return chromium.launch({
    channel: 'chrome',
    headless: !headed,
    args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
  })
}

/** Contexto con las condiciones de las capturas de referencia: dpr 1, `es-ES` y `Europe/Madrid`. */
export function newCaptureContext(browser, vp, extra = {}) {
  return browser.newContext({
    viewport: vp.viewport,
    deviceScaleFactor: 1,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    ...extra,
  })
}

/**
 * Mide cada pieza de `spec` dentro de la página (se pasa a `page.evaluate`, así que no puede usar nada
 * de fuera). Cada entrada: selector, grupos de propiedades (`box`, `text`, `stroke`, `layout`) y,
 * opcionalmente, el pseudoelemento. Se mide el primer elemento visible que casa (en móvil y escritorio
 * las webs alternan piezas ocultas con `display: none`); si no hay ninguno, la pieza vale `null`.
 */
export function measureInPage(spec) {
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
        textAlign: cs.textAlign,
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
        alignItems: cs.alignItems,
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

/** Fuente con la que el navegador pinta de verdad el texto de cada selector (protocolo de DevTools). */
export async function platformFonts(page, probes) {
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
export function fontInventoryInPage() {
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

/**
 * Reduce los PNG a 256 colores con tramado Floyd-Steinberg usando Pillow, si está instalado. El fondo
 * Silk del sello lleva grano animado y en PNG no se comprime: así pesan menos de la mitad. Los colores
 * exactos van en los JSON de medidas, no en los PNG.
 */
export function lighten(files) {
  if (files.length === 0) return
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

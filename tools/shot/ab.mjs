#!/usr/bin/env node
// Evidencia A/B de la «prueba del sello» (guía §3.1, `RD-VIS-02`, criterio 3 del plan 00): captura
// BeatBattle a 1440×900 y 390×844 (la home arriba, una página interior, el pie y, de la galería, las
// piezas equivalentes a las del sello), lo mide con las mismas propiedades que `otp.mjs` recoge del
// sello (`otp-metrics.json`) y monta hojas lado a lado (sello a la izquierda, BeatBattle a la derecha,
// mismo recorte y escala) con `ab_sheet.py` (Python + Pillow).
//
// Uso: node tools/shot/ab.mjs [opciones]
//   --base=http://127.0.0.1:5520         web de BeatBattle; sin `--base`, si no responde, el script
//                                        arranca Vite ahí (`apps/web`) y lo para al terminar
//   --out=docs/planning/evidence/f0/ab   carpeta de salida (relativa a la raíz del repo)
//   --otp=docs/planning/evidence/f0/otp  referencia del sello (capturas y `otp-metrics.json`)
//   --otp-live                           vuelve a capturar del sello lo que falta en la referencia
//                                        (chip activo, pie y teselas en móvil): necesita red
//   --settle=2500                        espera tras cargar cada página, en ms
//   --only=desktop|mobile                solo un tamaño (las hojas del otro no se tocan)
//   --no-lite                            deja las capturas de BeatBattle sin reducir a paleta
//   --headed                             con ventana visible
//
// Salida en `--out`:
//   bb/*.png             capturas de BeatBattle (ventana entera, como las del sello)
//   otp-extra/*          capturas y medidas complementarias del sello (`--otp-live`)
//   sheets/*.png         hojas A/B, una por pieza y tamaño (los botones, una por variante)
//   metrics.json         sello frente a BeatBattle por pieza, parte y propiedad (con Δ)
//   README.md            entre las marcas `ab:tabla`, las tablas de comparación regeneradas
//
// Notas:
// - Las piezas del sello salen de la referencia (`../otp/`). Lo que la referencia no tiene (el chip
//   activo se midió después de la captura; el pie no se midió; en móvil las teselas están plegadas) se
//   captura aparte con `--otp-live` y queda en `otp-extra/` con su fecha. Sin esa carpeta, esas hojas
//   no se generan y el script avisa.
// - En la galería, cada pieza se lleva por debajo de la isla antes de capturar; el cristal y el
//   movimiento se quedan como vienen (cristal encendido, sin «reducir movimiento»).
// - Las clases de los CSS Modules llevan un sufijo con hash; los selectores de la galería usan la
//   estructura (`#chip figure`) y, donde no basta, el nombre local (`[class*="_cta_"]`).
// - Las tablas del README marcan cada diferencia con su motivo (`EXPECTED`); una sin motivo sale como
//   «revisar» y se lista al terminar.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  launchChrome,
  lighten,
  measureInPage,
  newCaptureContext,
  parseArgs,
  platformFonts,
  VIEWPORTS,
} from './measure.mjs'
import {
  BEAT_DETAIL,
  BEATS,
  HOME_SECTIONS,
  HOME_TOP,
  newOtpContext,
  OTP_BASE,
  openOtp,
  scrollBelowIsland,
} from './otp.mjs'

const opt = parseArgs(process.argv.slice(2))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const outDir = resolve(repoRoot, String(opt.out ?? 'docs/planning/evidence/f0/ab'))
const otpDir = resolve(repoRoot, String(opt.otp ?? 'docs/planning/evidence/f0/otp'))
const extraDir = join(outDir, 'otp-extra')
const bbDir = join(outDir, 'bb')
const sheetDir = join(outDir, 'sheets')
const base = String(opt.base ?? 'http://127.0.0.1:5520').replace(/\/$/, '')
const settle = Number(opt.settle ?? 2500)
const viewports = VIEWPORTS.filter((v) => !opt.only || v.name === opt.only)
const rel = (path) => relative(repoRoot, path)

// ── Lo que se compara ──────────────────────────────────────────────────────────────────────────

/** Pie del sello (`Footer.jsx`/`Footer.css` de ReactOtpWeb): la referencia no lo mide. */
const OTP_FOOTER = {
  footer: { selector: 'footer.footer', groups: ['box', 'layout'] },
  footerLogo: { selector: '.footer-brand__logo', groups: ['box'] },
  footerName: { selector: '.footer-brand__name', groups: ['text'] },
  footerAccent: { selector: '.footer-brand__accent', groups: ['box'] },
  footerDesc: { selector: '.footer-brand__desc', groups: ['text'] },
  footerGrid: { selector: '.footer-grid', groups: ['layout'] },
  footerCard: { selector: '.footer-card', groups: ['box', 'layout'] },
  footerCardLast: { selector: '.footer-grid > :last-child', groups: ['box'] },
  footerCardTitle: { selector: '.footer-card__title', groups: ['text'] },
  footerCardLink: { selector: '.footer-card__nav a', groups: ['text'] },
  footerSocialLink: { selector: '.footer-social__link', groups: ['box'] },
  footerBottom: { selector: '.footer-bottom', groups: ['box', 'text'] },
  footerLegalLink: { selector: '.footer-legal a', groups: ['text'] },
}

/** «▌INFORMACIÓN» de la ficha del sello, con la rejilla de teselas entera (para el recorte). */
const OTP_INFO = {
  infoLabel: BEAT_DETAIL.infoLabel,
  infoLabelBar: BEAT_DETAIL.infoLabelBar,
  dataTile: BEAT_DETAIL.dataTile,
  dataTileIcon: BEAT_DETAIL.dataTileIcon,
  dataTileLabel: BEAT_DETAIL.dataTileLabel,
  dataTileValue: BEAT_DETAIL.dataTileValue,
  infoGrid: { selector: '.beat-detail__info-grid', groups: ['box', 'layout'] },
}

/** Grupos de propiedades de cada parte: los mismos que se midieron en el sello. */
const OTP_SPEC = {
  ...HOME_TOP,
  ...HOME_SECTIONS,
  ...BEATS,
  genreChipActive: { selector: '.genre-chip.active', groups: ['box', 'text'] },
  ...BEAT_DETAIL,
  ...OTP_INFO,
  ...OTP_FOOTER,
}

/** Capturas de BeatBattle: ruta, qué esperar y adónde desplazarse (por debajo de la isla). */
const SHOTS = {
  'home-top': { path: '/', ready: '.hero-title' },
  footer: { path: '/', ready: '.site-footer', scroll: 'bottom' },
  interior: { path: '/como-funciona', ready: '.placeholder-page h1' },
  'gallery-buttons': { path: '/dev/galeria', ready: '#fila article', scroll: '#boton > div:last-of-type' },
  'gallery-chip': { path: '/dev/galeria', ready: '#fila article', scroll: '#chip figure' },
  'gallery-entry-row': { path: '/dev/galeria', ready: '#fila article', scroll: '#fila figure' },
  'gallery-data-tiles': { path: '/dev/galeria', ready: '#fila article', scroll: '#tesela figure' },
  'gallery-glass-card': { path: '/dev/galeria', ready: '#fila article', scroll: '#tarjeta figure' },
}

const HERO_ROW = '#boton > div:last-of-type figure:first-of-type'
const ROW = '#fila article'
const TILES = '#tesela figure:first-of-type'
const CARD = '#tarjeta figure:first-of-type article'

/**
 * Piezas: de dónde sale cada lado y qué partes se comparan (clave del sello → selector de BeatBattle;
 * `null` si BeatBattle no tiene esa parte). `otp.png` es una captura de la referencia (`../otp/`) y
 * `otp.extra`, una de `otp-extra/`; `otp.page` es la página de las medidas (`home`, `beats`…).
 */
const PIECES = [
  {
    id: 'home-top',
    title: 'Home arriba',
    otp: { png: 'home-top', page: 'home' },
    bb: { shot: 'home-top', where: '/' },
    sheets: [{ viewport: true }],
    parts: {
      page: 'body',
      heroTitle: '.hero-title',
      heroTitleSolid: '.hero-title__line:not(.hero-title__line--outline)',
      heroTitleOutline: '.hero-title__line--outline',
      heroDivider: '.hero-divider',
      heroSubtitle: '.hero-subtitle',
      heroSide: '.side-label__text',
      heroGrid: '.hero-grid',
      heroVignette: '.hero-vignette',
      heroLogo: null,
      ctaPrimary: '.hero-actions > :nth-child(1)',
      ctaGhost: '.hero-actions > :nth-child(2)',
      marquee: '.marquee__viewport',
      marqueeItem: '.marquee__item',
      marqueeDot: '.marquee__dot',
      silk: '.ambient-orbs',
    },
    fonts: {
      heroTitle: '.hero-title__line',
      heroSubtitle: '.hero-subtitle',
      ctaPrimary: '.hero-actions > :nth-child(1) [class*="_content_"] > span',
    },
  },
  {
    id: 'island',
    title: 'Isla de navegación y logo',
    otp: { png: 'home-top', page: 'home' },
    bb: { shot: 'home-top', where: '/' },
    sheets: [{ box: (vp) => [0, 0, vp.width, 130] }],
    parts: {
      navIsland: '.site-header',
      logo: '.site-header__logo',
      navLinks: '.site-nav__links',
      navLink: '.site-nav__link:not([aria-current])',
      navLinkActive: '.site-nav__link[aria-current="page"]',
      loginButton: '.site-header__signin',
      mobileNavToggle: '.mobile-nav-toggle',
    },
    fonts: { navLink: '.site-nav__link' },
  },
  {
    id: 'interior',
    title: 'Página interior',
    otp: { png: 'beats-list', page: 'beats' },
    bb: { shot: 'interior', where: '/como-funciona' },
    sheets: [{ viewport: true }],
    parts: { pageTitle: '.placeholder-page h1' },
    fonts: { pageTitle: '.placeholder-page h1' },
  },
  {
    id: 'buttons',
    title: 'Botones CTA y de contorno',
    otp: { png: 'home-top', page: 'home' },
    bb: { shot: 'gallery-buttons', where: '/dev/galeria#boton (fila «Hero», reposo)' },
    sheets: [
      { suffix: 'cta', parts: ['ctaPrimary'], margin: 20 },
      { suffix: 'outline', parts: ['ctaGhost'], margin: 20 },
    ],
    parts: {
      ctaPrimary: `${HERO_ROW} button[class*="_cta_"]`,
      ctaGhost: `${HERO_ROW} button[class*="_outline_"]`,
    },
    fonts: { ctaPrimary: `${HERO_ROW} button[class*="_cta_"] [class*="_content_"] > span` },
  },
  {
    id: 'chip',
    title: 'Chip en reposo',
    otp: { png: 'beats-list', page: 'beats' },
    bb: { shot: 'gallery-chip', where: '/dev/galeria#chip (reposo)' },
    sheets: [{ parts: ['genreChip'], margin: 12, scale: 2 }],
    parts: { genreChip: '#chip figure:first-of-type button' },
    fonts: { genreChip: '#chip figure:first-of-type button > span' },
  },
  {
    id: 'chip-active',
    title: 'Chip activo',
    otp: { extra: 'beats-chip-active', page: 'beats' },
    bb: { shot: 'gallery-chip', where: '/dev/galeria#chip (activo)' },
    sheets: [{ parts: ['genreChipActive'], margin: 12, scale: 2 }],
    parts: {
      genreChipActive: '#chip button[aria-pressed="true"]',
      // El rojo del chip activo de BeatBattle es el `::after` que crece desde el clic (Anexo E).
      genreChipActiveFill: {
        selector: '#chip button[aria-pressed="true"]',
        pseudo: '::after',
        groups: ['box'],
      },
    },
  },
  {
    id: 'entry-row',
    title: 'Fila de entrada',
    otp: { png: 'beats-list', page: 'beats' },
    bb: { shot: 'gallery-entry-row', where: '/dev/galeria#fila (reposo)' },
    sheets: [{ parts: ['row'], margin: 16 }],
    parts: {
      row: ROW,
      rowThumb: `${ROW} > [class*="_thumb_"]`,
      rowPlay: `${ROW} > button`,
      rowTitle: `${ROW} h4`,
      rowProducer: `${ROW} [class*="_alias_"]`,
      rowGenreTag: `${ROW} [class*="_tag_"]`,
      rowMeta: `${ROW} [class*="_data_"]`,
      rowTime: null,
      rowProgress: `${ROW} [class*="_wave_"]`,
      rowPrice: null,
      rowDownload: null,
      rowBuy: null,
    },
    fonts: { rowTitle: `${ROW} h4`, rowMeta: `${ROW} [class*="_data_"]` },
  },
  {
    id: 'data-tiles',
    title: 'Teselas de dato con rótulo de sección',
    otp: { desktop: { png: 'beat-detail' }, mobile: { extra: 'beat-detail-info' }, page: 'beatDetail' },
    bb: { shot: 'gallery-data-tiles', where: '/dev/galeria#tesela (reposo)' },
    // La rejilla de teselas y, por encima, el rótulo (`padTop`). El rótulo de BeatBattle es un bloque
    // del ancho de la celda y su `<dl>` también: se recorta por la primera y la última tesela.
    sheets: [{ parts: ['infoGrid'], bbParts: ['dataTile', 'dataTileLast'], margin: 16, padTop: 32 }],
    bbCrop: { dataTileLast: `${TILES} dl > div:last-child` },
    parts: {
      infoLabel: `${TILES} h4`,
      infoLabelBar: `${TILES} h4`,
      dataTile: `${TILES} dl > div`,
      dataTileIcon: `${TILES} dl > div svg`,
      dataTileLabel: `${TILES} dl > div dt span`,
      dataTileValue: `${TILES} dl > div dd`,
    },
    fonts: { infoLabel: `${TILES} h4`, dataTileValue: `${TILES} dl > div dd` },
  },
  {
    id: 'glass-card',
    title: 'Tarjeta de cristal',
    otp: { png: 'home-releases', page: 'home' },
    bb: { shot: 'gallery-glass-card', where: '/dev/galeria#tarjeta (cristal, reposo)' },
    sheets: [{ parts: ['releaseCard'], margin: 24 }],
    parts: {
      releaseCard: CARD,
      releaseCardImage: `${CARD} [class*="_cardCover_"]`,
      releaseCardTitle: `${CARD} h4`,
      releaseCardArtists: `${CARD} [class*="_cardMeta_"]`,
      beatCardBuy: `${CARD} button`,
    },
    fonts: { releaseCardTitle: `${CARD} h4` },
  },
  {
    id: 'footer',
    title: 'Pie',
    otp: { extra: 'home-footer', page: 'footer' },
    bb: { shot: 'footer', where: '/ (al final)' },
    sheets: [{ viewport: true }],
    parts: {
      footer: '.site-footer',
      footerLogo: '.site-footer__logo',
      footerName: '.site-footer__name',
      footerAccent: '.site-footer__bar',
      footerDesc: '.site-footer__tagline',
      footerGrid: '.site-footer__content',
      footerCard: '.site-footer__card',
      footerCardLast: 'section.site-footer__card:last-of-type',
      footerCardTitle: '.site-footer__card-title',
      footerCardLink: '.site-footer__link',
      footerSocialLink: '.site-footer__social-link',
      footerBottom: '.site-footer__bottom',
      footerLegalLink: '.site-footer__legal-link',
    },
    fonts: { footerName: '.site-footer__name' },
  },
]

/**
 * Motivos de las diferencias esperadas, por orden de aparición en el README. Las cuatro primeras son
 * las que la prueba da por hechas; `review` marca lo que la guía no justifica.
 */
const EXPECTED = {
  font: 'Tipografía: Montserrat cargada de verdad frente a la Arial / Liberation Sans con la que se pinta el sello (§3.1, `RF-OTP-03`)',
  aa: 'Accesibilidad AA de la guía v0.4 (§3.1, §3.2): `--bb-red-cta` en botones y chips activos, grises de texto en `--bb-text-3`, rojo de texto `--bb-red-text` y objetivos táctiles de 44 px (`RNF-A11Y-09`)',
  hero: 'Contenido del hero del sello (vídeo de fondo, pieza 3D del logo, enlace a Spotify) que BeatBattle no tiene',
  silk: 'Fondo Silk WebGL pendiente de la tarea 1.1 (mientras, los orbes rojos en CSS, la alternativa del propio sello)',
  tokens:
    'Valor suelto del sello llevado a la escala de tokens (§3.2, `RD-VIS-01`): rem exactos (`xs` 12, `sm` 14, `md` 16 px), radios `sm` y `pill`, espaciado de 4 en 4 px, grises opacos y líneas de la escala',
  own: 'Decisión propia escrita en la guía: datos en JetBrains Mono (§3.2), mini onda en lugar de barra de progreso y sin compra (§3.3, §1.5), botón icono de 36–44 px y CTA en píldora (§3.3)',
  content:
    'Contenido distinto (textos, número de enlaces, estructura de la página provisional): cambian anchos y posiciones',
  gallery:
    'Maquetación y contenido de muestra de la galería: la pieza va en una celda y su contenido es de ejemplo',
  review: 'Sin justificación en la guía: desviación a revisar',
}

/**
 * Filas de las tablas del README: [parte, propiedad, motivo si difiere (o uno por tamaño), parte de
 * BeatBattle si se llama distinto]. `font` es la fuente pintada de verdad y `selector`, la pieza que
 * hace de fondo. Una diferencia sin motivo sale como «revisar» en la tabla y en la consola; todo lo
 * demás está en `metrics.json`.
 */
const README_ROWS = {
  'home-top': [
    ['heroTitle', 'fontSize'],
    ['heroTitle', 'fontWeight'],
    ['heroTitle', 'letterSpacing'],
    ['heroTitle', 'lineHeight'],
    ['heroTitle', 'rect.y', 'hero'],
    ['heroTitle', 'font', 'font'],
    ['heroTitleOutline', 'webkitTextStroke', 'font'],
    ['heroTitleOutline', 'webkitTextFillColor'],
    ['heroTitleOutline', 'textShadow'],
    ['heroDivider', 'size.width'],
    ['heroDivider', 'size.height'],
    ['heroSubtitle', 'fontSize'],
    ['heroSubtitle', 'fontWeight'],
    ['heroSubtitle', 'letterSpacingEm'],
    ['heroSubtitle', 'color', 'tokens'],
    ['heroSide', 'fontSize'],
    ['heroSide', 'letterSpacingEm'],
    ['heroSide', 'color', 'aa'],
    ['heroLogo', 'size.width', 'hero'],
    ['marquee', 'rect.height', 'font'],
    ['marquee', 'backgroundColor'],
    ['marqueeItem', 'fontSize'],
    ['marqueeItem', 'letterSpacingEm'],
    ['marqueeItem', 'color', 'tokens'],
    ['silk', 'selector', 'silk'],
  ],
  island: [
    ['navIsland', 'rect.x'],
    ['navIsland', 'rect.y'],
    ['navIsland', 'rect.width'],
    ['navIsland', 'rect.height'],
    ['navIsland', 'borderRadius'],
    ['navIsland', 'backgroundColor'],
    ['navIsland', 'backdropFilter'],
    ['navIsland', 'boxShadow'],
    ['navIsland', 'padding'],
    ['navIsland', 'position'],
    ['logo', 'rect.x'],
    ['logo', 'rect.y'],
    ['logo', 'rotateDeg'],
    ['navLinks', 'rect.width', 'content'],
    ['navLink', 'fontSize'],
    ['navLink', 'fontWeight'],
    ['navLink', 'padding'],
    ['navLink', 'font', 'font'],
    ['navLinkActive', 'backgroundColor'],
    ['navLinkActive', 'borderRadius'],
    ['loginButton', 'rect.height'],
    ['loginButton', 'borderRadius', 'own'],
    ['loginButton', 'border', 'own'],
    ['loginButton', 'backgroundColor', 'own'],
    ['loginButton', 'fontSize', 'tokens'],
    ['mobileNavToggle', 'rect.width', 'aa'],
    ['mobileNavToggle', 'rect.height', 'aa'],
  ],
  interior: [
    ['pageTitle', 'fontSize'],
    ['pageTitle', 'fontWeight'],
    ['pageTitle', 'textTransform'],
    ['pageTitle', 'letterSpacing'],
    ['pageTitle', 'textAlign'],
    ['pageTitle', 'rect.x'],
    ['pageTitle', 'rect.y'],
    ['pageTitle', 'rect.height', 'content'],
    ['pageTitle', 'font', 'font'],
  ],
  buttons: [
    ['ctaPrimary', 'rect.height', 'review'],
    ['ctaPrimary', 'border', 'review'],
    ['ctaPrimary', 'borderRadius'],
    ['ctaPrimary', 'backgroundColor', 'aa'],
    ['ctaPrimary', 'backdropFilter', 'aa'],
    ['ctaPrimary', 'boxShadow'],
    ['ctaPrimary', 'padding'],
    ['ctaPrimary', 'fontSize'],
    ['ctaPrimary', 'fontWeight'],
    ['ctaPrimary', 'letterSpacingEm'],
    ['ctaPrimary', 'textTransform'],
    ['ctaPrimary', 'font', 'font'],
    ['ctaGhost', 'rect.height', 'font'],
    ['ctaGhost', 'backgroundColor'],
    ['ctaGhost', 'border'],
    ['ctaGhost', 'backdropFilter'],
    ['ctaGhost', 'padding'],
  ],
  chip: [
    ['genreChip', 'rect.height', { desktop: 'tokens', mobile: 'font' }],
    ['genreChip', 'borderRadius', 'tokens'],
    ['genreChip', 'backgroundColor'],
    ['genreChip', 'border'],
    ['genreChip', 'padding', 'tokens'],
    ['genreChip', 'fontSize', 'tokens'],
    ['genreChip', 'fontWeight'],
    ['genreChip', 'letterSpacingEm', 'tokens'],
    ['genreChip', 'color'],
    ['genreChip', 'font', 'font'],
  ],
  'chip-active': [
    ['genreChipActive', 'backgroundColor', 'aa', 'genreChipActiveFill'],
    ['genreChipActive', 'border', 'aa'],
    ['genreChipActive', 'boxShadow', 'tokens'],
    ['genreChipActive', 'color'],
  ],
  'entry-row': [
    ['row', 'rect.height', 'own'],
    ['row', 'borderRadius'],
    ['row', 'padding'],
    ['row', 'gap', 'tokens'],
    ['row', 'backgroundColor'],
    ['rowThumb', 'size.width'],
    ['rowThumb', 'borderRadius', 'tokens'],
    ['rowThumb', 'backgroundColor'],
    ['rowPlay', 'size.width', 'own'],
    ['rowPlay', 'border', 'tokens'],
    ['rowTitle', 'fontSize', 'tokens'],
    ['rowTitle', 'fontWeight'],
    ['rowTitle', 'color'],
    ['rowTitle', 'font', 'font'],
    ['rowProducer', 'fontSize', 'tokens'],
    ['rowProducer', 'color', 'aa'],
    ['rowGenreTag', 'rect.height', 'font'],
    ['rowGenreTag', 'borderRadius'],
    ['rowGenreTag', 'backgroundColor'],
    ['rowGenreTag', 'border'],
    ['rowGenreTag', 'fontSize', 'tokens'],
    ['rowGenreTag', 'color', 'tokens'],
    ['rowMeta', 'fontSize'],
    ['rowMeta', 'color', 'aa'],
    ['rowMeta', 'font', 'own'],
    ['rowTime', 'rect.width', 'own'],
    ['rowProgress', 'rect.height', 'own'],
    ['rowBuy', 'rect.width', 'own'],
  ],
  'data-tiles': [
    ['infoLabel', 'fontSize', 'tokens'],
    ['infoLabel', 'fontWeight'],
    ['infoLabel', 'letterSpacingEm'],
    ['infoLabel', 'textTransform'],
    ['infoLabel', 'color', 'aa'],
    ['infoLabel', 'font', 'font'],
    ['infoLabelBar', 'size.width'],
    ['infoLabelBar', 'size.height'],
    ['infoLabelBar', 'borderRadius'],
    ['infoLabelBar', 'backgroundColor'],
    ['dataTile', 'rect.width', 'gallery'],
    ['dataTile', 'rect.height', 'font'],
    ['dataTile', 'borderRadius'],
    ['dataTile', 'backgroundColor'],
    ['dataTile', 'border'],
    ['dataTile', 'padding'],
    ['dataTileIcon', 'color'],
    ['dataTileLabel', 'fontSize'],
    ['dataTileLabel', 'letterSpacingEm'],
    ['dataTileLabel', 'lineHeight', 'tokens'],
    ['dataTileLabel', 'textTransform'],
    ['dataTileLabel', 'color', 'aa'],
    ['dataTileValue', 'fontSize', 'tokens'],
    ['dataTileValue', 'fontWeight', 'tokens'],
    ['dataTileValue', 'font', 'font'],
  ],
  'glass-card': [
    ['releaseCard', 'rect.width', 'gallery'],
    ['releaseCard', 'rect.height', 'gallery'],
    ['releaseCard', 'borderRadius'],
    ['releaseCard', 'backgroundColor'],
    ['releaseCard', 'border'],
    ['releaseCard', 'boxShadow'],
    ['releaseCard', 'backdropFilter', 'review'],
    ['releaseCard', 'padding'],
    ['releaseCardImage', 'borderRadius'],
    ['releaseCardTitle', 'fontSize', 'gallery'],
    ['releaseCardTitle', 'fontWeight', 'font'],
    ['releaseCardTitle', 'font', 'font'],
    ['releaseCardArtists', 'fontSize', 'gallery'],
    ['releaseCardArtists', 'color'],
    ['beatCardBuy', 'rect.height', { desktop: 'own', mobile: 'aa' }],
    ['beatCardBuy', 'borderRadius', 'own'],
    ['beatCardBuy', 'backgroundColor', 'aa'],
    ['beatCardBuy', 'fontSize', 'own'],
    ['beatCardBuy', 'boxShadow', 'own'],
  ],
  footer: [
    ['footer', 'padding', 'content'],
    ['footerLogo', 'size.width'],
    ['footerName', 'fontSize'],
    ['footerName', 'fontWeight'],
    ['footerName', 'textTransform'],
    ['footerName', 'letterSpacingEm'],
    ['footerName', 'font', 'font'],
    ['footerAccent', 'size.width'],
    ['footerAccent', 'size.height'],
    ['footerAccent', 'backgroundColor'],
    ['footerDesc', 'fontSize'],
    ['footerDesc', 'color', 'tokens'],
    ['footerDesc', 'textAlign'],
    ['footerGrid', 'alignItems'],
    ['footerCard', 'rect.height', 'content'],
    ['footerCardLast', 'rect.height', 'content'],
    ['footerCard', 'borderRadius'],
    ['footerCard', 'backgroundColor'],
    ['footerCard', 'border'],
    ['footerCard', 'backdropFilter'],
    ['footerCard', 'padding'],
    ['footerCardTitle', 'fontSize'],
    ['footerCardTitle', 'fontWeight'],
    ['footerCardTitle', 'letterSpacingEm'],
    ['footerCardTitle', 'textTransform'],
    ['footerCardTitle', 'textAlign'],
    ['footerCardTitle', 'color', 'aa'],
    ['footerCardLink', 'fontSize'],
    ['footerCardLink', 'lineHeight', 'tokens'],
    ['footerCardLink', 'rect.height', { desktop: 'font', mobile: 'aa' }],
    ['footerCardLink', 'color'],
    ['footerSocialLink', 'size.width', 'aa'],
    ['footerSocialLink', 'borderRadius'],
    ['footerSocialLink', 'backgroundColor'],
    ['footerSocialLink', 'border', 'tokens'],
    ['footerBottom', 'border', 'tokens'],
    ['footerBottom', 'fontSize'],
    ['footerBottom', 'color', 'tokens'],
    ['footerLegalLink', 'fontSize'],
    ['footerLegalLink', 'color'],
  ],
}

// ── Vite ───────────────────────────────────────────────────────────────────────────────────────

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

/** Arranca Vite en el puerto de `--base` si no responde nadie (y no se pasó `--base`). */
async function ensureVite() {
  if (await reachable(base)) return null
  if (opt.base) throw new Error(`${base} no responde`)
  const { hostname, port } = new URL(base)
  const web = join(repoRoot, 'apps/web')
  const child = spawn(
    process.execPath,
    [join(web, 'node_modules/vite/bin/vite.js'), '--port', port, '--strictPort', '--host', hostname],
    { cwd: web, stdio: 'ignore', detached: true },
  )
  for (let i = 0; i < 60; i++) {
    if (await reachable(base)) {
      console.log(`Vite arrancado en ${base} (pid ${child.pid})`)
      return child
    }
    await new Promise((done) => setTimeout(done, 500))
  }
  stopVite(child)
  throw new Error(`Vite no arrancó en ${base}`)
}

function stopVite(child) {
  if (!child) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  console.log('Vite parado')
}

// ── Capturas de BeatBattle ─────────────────────────────────────────────────────────────────────

const bbPng = (shot, vp) => join(bbDir, `${shot}-${vp}.png`)

/** Lleva `selector` por debajo de la isla de BeatBattle, o al final de la página con `'bottom'`. */
async function scrollShot(page, target) {
  if (!target) return
  await page.evaluate((sel) => {
    if (sel === 'bottom') {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
      return
    }
    const el = document.querySelector(sel)
    if (!el) throw new Error(`sin ${sel}`)
    const island = document.querySelector('.site-header')?.getBoundingClientRect()
    const offset = (island ? island.bottom : 0) + 40
    window.scrollTo({
      top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset),
      behavior: 'instant',
    })
  }, target)
  await page.waitForTimeout(900)
}

/**
 * Qué medir en BeatBattle: el selector de cada parte con los grupos (y el pseudoelemento) con los que
 * se midió en el sello. Una parte propia de BeatBattle trae su especificación entera.
 */
function bbSpec(piece) {
  return Object.fromEntries(
    Object.entries(piece.parts)
      .filter(([, value]) => value)
      .map(([key, value]) => {
        if (typeof value !== 'string') return [key, value]
        const { groups, pseudo } = OTP_SPEC[key]
        return [key, { selector: value, groups, pseudo }]
      }),
  )
}

async function captureBeatBattle(browser) {
  const result = {}
  for (const vp of viewports) {
    console.log(`BeatBattle ${vp.name} ${vp.viewport.width}×${vp.viewport.height}`)
    const context = await newCaptureContext(browser, vp)
    const logs = []
    const m = { viewport: vp.viewport, pieces: {}, shots: {} }
    let page = null
    let current = null
    for (const [shot, { path, ready, scroll }] of Object.entries(SHOTS)) {
      if (current !== path) {
        // Una pestaña nueva por ruta: `ScrollRestoration` guarda el desplazamiento de la carga inicial
        // con la clave `default` en `sessionStorage` y lo aplicaría a la siguiente carga en la misma.
        await page?.close()
        page = await context.newPage()
        page.on('pageerror', (e) => logs.push(`[pageerror] ${path}: ${e.message}`))
        await page.goto(`${base}${path}`, { waitUntil: 'load' })
        await page.waitForSelector(ready)
        await page.waitForTimeout(settle)
        current = path
      }
      await scrollShot(page, scroll)
      const file = bbPng(shot, vp.name)
      await page.screenshot({ path: file })
      m.shots[shot] = rel(file)
      console.log(`  bb/${shot}-${vp.name}.png`)
      for (const piece of PIECES.filter((p) => p.bb.shot === shot)) {
        const parts = await page.evaluate(measureInPage, bbSpec(piece))
        for (const key of Object.keys(piece.parts)) parts[key] ??= null
        const fonts = piece.fonts ? await platformFonts(page, piece.fonts) : undefined
        // Partes que solo sirven para el recorte (no se comparan).
        const crop = piece.bbCrop
          ? await page.evaluate(
              measureInPage,
              Object.fromEntries(
                Object.entries(piece.bbCrop).map(([key, selector]) => [key, { selector, groups: [] }]),
              ),
            )
          : {}
        m.pieces[piece.id] = { parts, fonts, crop }
      }
      if (shot === 'home-top') {
        m.fontsLoaded = await page.evaluate(() =>
          [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
        )
        m.htmlBackground = await page.evaluate(
          () => getComputedStyle(document.documentElement).backgroundColor,
        )
        m.scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      }
    }
    m.pageErrors = logs
    result[vp.name] = m
    await context.close()
  }
  return result
}

// ── Lo que falta del sello en la referencia ────────────────────────────────────────────────────

const extraPng = (name, vp) => join(extraDir, `${name}-${vp}.png`)

async function captureOtpExtra(browser) {
  const previous = await readFile(join(extraDir, 'otp-extra-metrics.json'), 'utf8').then(
    JSON.parse,
    () => null,
  )
  const metrics = {
    capturedAt: new Date().toISOString(),
    base: OTP_BASE,
    browser: `Chrome ${browser.version()}`,
    why: 'Piezas del sello que la referencia (../otp) no tiene: chip activo, pie y teselas en móvil',
    viewports: { ...(previous?.viewports ?? {}) },
  }
  const reference = JSON.parse(await readFile(join(otpDir, 'otp-metrics.json'), 'utf8'))
  for (const vp of viewports) {
    console.log(`Sello ${vp.name} (complemento en vivo)`)
    const context = await newOtpContext(browser, vp)
    const page = await context.newPage()
    const m = { viewport: vp.viewport }

    // Chip de género activo, con la lista ya filtrada.
    await openOtp(page, { path: '/beats', readySelector: '.beat-list-row' })
    await page.click('.genre-chip')
    await page.waitForTimeout(1200)
    m.beats = await page.evaluate(measureInPage, {
      genreChipActive: OTP_SPEC.genreChipActive,
      genreChip: { selector: '.genre-chip:not(.active)', groups: ['box', 'text'] },
      // La referencia no midió la alineación del texto: el título se vuelve a medir aquí (antes de
      // filtrar no se mueve; el clic en el chip solo cambia la lista).
      pageTitle: BEATS.pageTitle,
    })
    m.beats.fonts = await platformFonts(page, { genreChip: '.genre-chip' })
    await page.screenshot({ path: extraPng('beats-chip-active', vp.name) })

    // Pie, al final de la home.
    await openOtp(page, { path: '/', readySelector: '.ultimos-beats-list' })
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    )
    await page.waitForTimeout(1500)
    m.footer = await page.evaluate(measureInPage, OTP_FOOTER)
    m.footer.fonts = await platformFonts(page, { footerName: '.footer-brand__name' })
    await page.screenshot({ path: extraPng('home-footer', vp.name) })

    // «▌INFORMACIÓN» de la ficha de referencia: en móvil hay que desplegarla.
    await openOtp(page, { path: reference.beatPath, readySelector: '.beat-detail__title' })
    if (vp.isMobile) {
      await page.click('.beat-detail__info-toggle')
      await page.waitForTimeout(800)
      await scrollBelowIsland(page, '.beat-detail__info-section')
      m.beatDetail = await page.evaluate(measureInPage, OTP_INFO)
      m.beatDetail.fonts = await platformFonts(page, { dataTileValue: '.beat-detail__info-value' })
      await page.screenshot({ path: extraPng('beat-detail-info', vp.name) })
    } else {
      // En escritorio la captura es la de la referencia: solo hace falta la rejilla entera.
      m.beatDetail = await page.evaluate(measureInPage, {
        infoLabel: OTP_INFO.infoLabel,
        infoGrid: OTP_INFO.infoGrid,
      })
    }
    metrics.viewports[vp.name] = m
    await context.close()
  }
  await writeFile(join(extraDir, 'otp-extra-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)
  lighten(
    viewports.flatMap((vp) =>
      ['beats-chip-active', 'home-footer', 'beat-detail-info']
        .map((name) => extraPng(name, vp.name))
        .filter((file) => existsSync(file)),
    ),
  )
  return metrics
}

// ── Comparación ────────────────────────────────────────────────────────────────────────────────

/** Mide lo mismo sin el ruido que no es estilo: el id del filtro SVG cambia de página a página. */
const normalize = (value) =>
  typeof value === 'string' ? value.replace(/url\("?#[^")]*"?\)/g, 'url(#filtro)') : value

function flatten(measure) {
  if (!measure) return null
  const out = {}
  for (const [key, value] of Object.entries(measure)) {
    if (key === 'text' || key === 'style') continue
    if (value && typeof value === 'object') {
      for (const [sub, inner] of Object.entries(value)) out[`${key}.${sub}`] = inner
    } else out[key] = value
  }
  return out
}

const round = (n) => Math.round(n * 100) / 100
const pxNumber = (v) =>
  typeof v === 'number' ? v : /^-?[\d.]+px$/.test(v ?? '') ? Number.parseFloat(v) : null

/**
 * Δ = BeatBattle − sello en números (px), `=` si coincide y `≠` si no. Con `prop`, las propiedades en em
 * (`letterSpacingEm`) usan su propio umbral: 0,01 em no es redondeo, aunque sea menos de 0,05.
 */
function delta(otp, bb, prop = '') {
  if (otp === undefined || otp === null || bb === undefined || bb === null) {
    return otp === bb || (otp == null && bb == null) ? '=' : '≠'
  }
  const [a, b] = [pxNumber(otp), pxNumber(bb)]
  // Un radio de píldora (999 px) no se resta: se compara la forma.
  if (Math.max(a ?? 0, b ?? 0) >= 999) return normalize(otp) === normalize(bb) ? '=' : '≠'
  // Menos de 0,05 px es redondeo de subpíxel, no una diferencia; en em, menos de 0,005.
  const epsilon = prop.endsWith('Em') ? 0.005 : 0.05
  if (a !== null && b !== null) return Math.abs(b - a) < epsilon ? '=' : round(b - a)
  return normalize(otp) === normalize(bb) ? '=' : '≠'
}

/** Caja que envuelve varias (las que falten no cuentan). */
function union(rects) {
  const valid = rects.filter(Boolean)
  if (!valid.length) return null
  const x0 = Math.min(...valid.map((r) => r.x))
  const y0 = Math.min(...valid.map((r) => r.y))
  const x1 = Math.max(...valid.map((r) => r.x + r.width))
  const y1 = Math.max(...valid.map((r) => r.y + r.height))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Por parte: selector y texto de cada lado, y cada propiedad medida con su valor en el sello, en
 * BeatBattle y la Δ. `missing` dice qué lado no tiene la parte (oculta o inexistente).
 */
function compareParts(otpParts, bbParts) {
  const parts = {}
  for (const key of new Set([...Object.keys(otpParts), ...Object.keys(bbParts)])) {
    const [otp, bb] = [otpParts[key] ?? null, bbParts[key] ?? null]
    const [a, b] = [flatten(otp) ?? {}, flatten(bb) ?? {}]
    const props = {}
    for (const prop of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (prop === 'selector') continue
      props[prop] = { otp: a[prop] ?? null, bb: b[prop] ?? null, delta: delta(a[prop], b[prop], prop) }
    }
    parts[key] = {
      otp: otp && { selector: otp.selector, text: otp.text },
      bb: bb && { selector: bb.selector, text: bb.text },
      missing: !otp && !bb ? 'both' : !otp ? 'otp' : !bb ? 'bb' : null,
      props,
    }
  }
  return parts
}

/** Fuente pintada de verdad: la familia con más glifos. */
function paintedFont(probe) {
  const fonts = probe?.fonts
  if (!fonts?.length) return null
  const font = [...fonts].sort((x, y) => y.glyphCount - x.glyphCount)[0]
  // La Montserrat variable se llama como su instancia por defecto («Montserrat Thin»): el peso lo da el eje.
  const family = font.isCustomFont ? font.familyName.replace(/ Thin$/, ' (variable)') : font.familyName
  return `${family}, ${font.isCustomFont ? 'web' : 'del sistema'}`
}

/** Valor de una propiedad para la tabla (con `font` y `selector`, que no son de `getComputedStyle`). */
function cell(part, measure, fonts, prop) {
  if (prop === 'font') return paintedFont(fonts?.[part])
  if (prop === 'selector') return measure?.selector ?? null
  if (!measure) return null
  return flatten(measure)[prop] ?? null
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────

const reference = JSON.parse(await readFile(join(otpDir, 'otp-metrics.json'), 'utf8'))
await mkdir(bbDir, { recursive: true })
await mkdir(extraDir, { recursive: true })
await mkdir(sheetDir, { recursive: true })
// Hojas viejas de los tamaños que se regeneran (si una pieza cambia de nombre, no se quedan).
for (const file of await readdir(sheetDir)) {
  if (viewports.some((vp) => file.endsWith(`-${vp.name}.png`))) await rm(join(sheetDir, file))
}

const vite = await ensureVite()
// Con Ctrl+C, Vite (en su propio grupo de procesos) no se queda vivo.
process.once('SIGINT', () => {
  stopVite(vite)
  process.exit(130)
})
const browser = await launchChrome({ headed: Boolean(opt.headed) })
const chromeVersion = `Chrome ${browser.version()}`
let beatBattle
let extra
try {
  if (opt['otp-live']) extra = await captureOtpExtra(browser)
  beatBattle = await captureBeatBattle(browser)
} finally {
  await browser.close()
  stopVite(vite)
}
extra ??= await readFile(join(extraDir, 'otp-extra-metrics.json'), 'utf8').then(JSON.parse, () => null)
if (!extra)
  console.warn('aviso: sin otp-extra/ (pasa --otp-live): chip activo, pie y teselas en móvil sin sello')

const previous = await readFile(join(outDir, 'metrics.json'), 'utf8').then(JSON.parse, () => null)
const commit = (() => {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot }).toString().trim()
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'apps', 'packages'], { cwd: repoRoot })
      .toString()
      .trim()
    return dirty ? `${sha} (con cambios sin confirmar en apps/ o packages/)` : sha
  } catch {
    return null
  }
})()

const metrics = {
  generatedAt: new Date().toISOString(),
  beatbattle: { base, commit, browser: chromeVersion, dpr: 1 },
  otp: {
    reference: { dir: rel(otpDir), capturedAt: reference.capturedAt, beatPath: reference.beatPath },
    extra: extra ? { dir: rel(extraDir), capturedAt: extra.capturedAt } : null,
  },
  expected: EXPECTED,
  viewports: { ...(previous?.viewports ?? {}) },
  table: (previous?.table ?? []).filter((row) => !viewports.some((vp) => vp.name === row.viewport)),
}

const jobs = []
for (const vp of viewports) {
  const bb = beatBattle[vp.name]
  const ref = reference.viewports[vp.name]
  const ext = extra?.viewports?.[vp.name] ?? {}
  const out = {
    viewport: vp.viewport,
    fontsLoaded: bb.fontsLoaded,
    htmlBackground: { otp: ref.home.htmlBackground, bb: bb.htmlBackground },
    scrollWidth: bb.scrollWidth,
    pageErrors: bb.pageErrors,
    pieces: {},
  }
  for (const piece of PIECES) {
    const source = { ...piece.otp, ...(piece.otp[vp.name] ?? {}) }
    const pageKey = source.page
    // Valores: la referencia manda; el complemento rellena lo que no tiene, también las propiedades
    // que la referencia no midió (`textAlign`, `alignItems`) de una parte que sí tiene.
    const otpParts = {}
    for (const key of Object.keys(piece.parts)) {
      const [fromRef, fromExtra] = [ref[pageKey]?.[key], ext[pageKey]?.[key]]
      otpParts[key] = fromRef && fromExtra ? { ...fromExtra, ...fromRef } : (fromRef ?? fromExtra ?? null)
    }
    // Cajas para el recorte: las de la misma captura que se usa.
    const rectOf = (key) =>
      (source.extra
        ? (ext[pageKey]?.[key] ?? ref[pageKey]?.[key])
        : (ref[pageKey]?.[key] ?? ext[pageKey]?.[key])
      )?.rect ?? null
    const otpPngPath = source.extra
      ? extraPng(source.extra, vp.name)
      : join(otpDir, `${source.png}-${vp.name}.png`)
    const bbPiece = bb.pieces[piece.id]
    const otpFonts = { ...(ref[pageKey]?.fonts ?? {}), ...(ext[pageKey]?.fonts ?? {}) }
    const sheetPath = (spec) =>
      join(sheetDir, `${piece.id}${spec.suffix ? `-${spec.suffix}` : ''}-${vp.name}.png`)
    out.pieces[piece.id] = {
      title: piece.title,
      otp: {
        png: rel(otpPngPath),
        metrics: `${source.extra ? 'otp-extra/otp-extra-metrics.json' : 'otp/otp-metrics.json'} → viewports.${vp.name}.${pageKey}`,
      },
      bb: { png: rel(bbPng(piece.bb.shot, vp.name)), where: piece.bb.where },
      sheets: piece.sheets.map((spec) => rel(sheetPath(spec))),
      fonts: { otp: otpFonts, bb: bbPiece.fonts ?? {} },
      parts: compareParts(otpParts, bbPiece.parts),
    }

    // Recorte: el mismo tamaño a los dos lados, cada uno sobre su pieza.
    for (const spec of piece.sheets) {
      const { width: W, height: H } = vp.viewport
      const whole = spec.viewport || spec.box
      let boxA
      let boxB
      if (whole) {
        boxA = boxB = spec.box ? spec.box(vp.viewport) : [0, 0, W, H]
      } else {
        const a = union(spec.parts.map(rectOf))
        const b = union(
          (spec.bbParts ?? spec.parts).map((key) => (bbPiece.parts[key] ?? bbPiece.crop[key])?.rect),
        )
        const m = spec.margin
        const top = m + (spec.padTop ?? 0)
        const w = Math.ceil(Math.max(a?.width ?? 0, b?.width ?? 0)) + 2 * m
        const h = Math.ceil(Math.max(a?.height ?? 0, b?.height ?? 0)) + top + m
        const at = (r) => (r ? [Math.floor(r.x) - m, Math.floor(r.y) - top] : [0, 0])
        const [ax, ay] = at(a)
        const [bx, by] = at(b)
        boxA = [ax, ay, ax + w, ay + h]
        boxB = [bx, by, bx + w, by + h]
      }
      // Escritorio a pantalla entera, a la mitad; y ninguna hoja de más de 2400 px de ancho.
      const wanted = spec.scale ?? (whole && !vp.isMobile ? 0.5 : 1)
      const scale = Math.min(wanted, 2400 / (2 * (boxA[2] - boxA[0]) + 12))
      if (existsSync(otpPngPath)) {
        jobs.push({
          out: sheetPath(spec),
          scale: round(scale),
          a: { png: otpPngPath, box: boxA, label: 'Sello (otherpeople.es)' },
          b: { png: bbPng(piece.bb.shot, vp.name), box: boxB, label: 'BeatBattle' },
        })
      } else console.warn(`aviso: sin ${rel(otpPngPath)}; no hay hoja de ${piece.id} (${vp.name})`)
    }

    for (const [part, prop, why, bbPart = part] of README_ROWS[piece.id] ?? []) {
      const pieceOut = out.pieces[piece.id]
      const otpValue = cell(part, otpParts[part], otpFonts, prop)
      const bbValue = cell(bbPart, bbPiece.parts[bbPart], bbPiece.fonts, prop)
      if (otpValue === null && bbValue === null) continue
      const d =
        prop === 'font' || prop === 'selector'
          ? otpValue === bbValue
            ? '='
            : '≠'
          : delta(otpValue, bbValue, prop)
      metrics.table.push({
        viewport: vp.name,
        piece: pieceOut.title,
        part: bbPart === part ? part : `${part} / ${bbPart}`,
        property: prop,
        otp: otpValue,
        bb: bbValue,
        delta: d,
        why: d === '=' ? null : ((typeof why === 'object' ? why[vp.name] : why) ?? 'REVISAR'),
      })
    }
  }
  metrics.viewports[vp.name] = out
}

// Hojas (sobre las capturas a todo color) y, después, capturas de BeatBattle a paleta.
const jobFile = join(outDir, '.ab-jobs.json')
await writeFile(jobFile, JSON.stringify(jobs))
const py = spawnSync('python3', [join(repoRoot, 'tools/shot/ab_sheet.py'), jobFile], { stdio: 'inherit' })
await rm(jobFile, { force: true })
if (py.status !== 0) throw new Error('ab_sheet.py falló (¿python3 con Pillow?)')
if (!opt['no-lite'])
  lighten(viewports.flatMap((vp) => Object.keys(SHOTS).map((shot) => bbPng(shot, vp.name))))

const order = ['desktop', 'mobile']
metrics.table.sort((x, y) => order.indexOf(x.viewport) - order.indexOf(y.viewport))
await writeFile(join(outDir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)
console.log(`metrics.json → ${rel(outDir)}`)

// ── Tablas del README ──────────────────────────────────────────────────────────────────────────

const WHY_NUMBER = Object.fromEntries(Object.keys(EXPECTED).map((key, index) => [key, index + 1]))
const show = (value) => {
  if (value === null || value === undefined) return '—'
  const text = String(normalize(value)).replace(/\|/g, '\\|')
  return `\`${text.length > 70 ? `${text.slice(0, 67)}…` : text}\``
}
const showDelta = (d, prop = '') =>
  typeof d === 'number'
    ? `${d > 0 ? '+' : '−'}${Math.abs(d)} ${prop.endsWith('Em') ? 'em' : 'px'}`.replace('.', ',')
    : d
const showWhy = (why) => (!why ? '' : why === 'REVISAR' ? '**revisar**' : `(${WHY_NUMBER[why]})`)

function tableFor(viewport) {
  const rows = metrics.table.filter((row) => row.viewport === viewport)
  const lines = ['| Pieza | Propiedad | Sello | BeatBattle | Δ |', '|---|---|---|---|---|']
  let last = null
  for (const row of rows) {
    const piece = row.piece === last ? '' : row.piece
    last = row.piece
    lines.push(
      `| ${piece} | ${row.part} · ${row.property} | ${show(row.otp)} | ${show(row.bb)} | ${showDelta(row.delta, row.property)} ${showWhy(row.why)} |`.replace(
        / {2}\|$/,
        ' |',
      ),
    )
  }
  return lines.join('\n')
}

const readmePath = join(outDir, 'README.md')
const START = '<!-- ab:tabla:inicio -->'
const END = '<!-- ab:tabla:fin -->'
const readme = await readFile(readmePath, 'utf8').catch(() => null)
const presentViewports = order.filter((name) => metrics.viewports[name])
const tables = [
  START,
  '',
  ...presentViewports.flatMap((name) => {
    const { width, height } = metrics.viewports[name].viewport
    const title = name === 'desktop' ? 'Escritorio' : 'Móvil'
    return [`### ${title} (${width}×${height})`, '', tableFor(name), '']
  }),
  END,
].join('\n')
if (readme?.includes(START) && readme.includes(END)) {
  const before = readme.slice(0, readme.indexOf(START))
  const after = readme.slice(readme.indexOf(END) + END.length)
  await writeFile(readmePath, `${before}${tables}${after}`)
  console.log('README.md: tablas regeneradas')
} else {
  await writeFile(join(outDir, 'tablas.md'), `${tables}\n`)
  console.warn(`aviso: README.md sin las marcas ${START} / ${END}; tablas en tablas.md`)
}
const pending = metrics.table.filter((row) => row.why === 'REVISAR')
console.log(`${metrics.table.length} filas; ${pending.length} diferencias sin motivo anotado`)
for (const row of pending) {
  console.log(`  ${row.viewport} ${row.piece} ${row.part}.${row.property}: ${row.otp} → ${row.bb}`)
}

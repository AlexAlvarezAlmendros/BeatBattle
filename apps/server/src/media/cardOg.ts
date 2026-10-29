import { RANK_NAMES } from '@beatbattle/emails'
import type { CardVariant, RankId } from '@beatbattle/rules'
import { angle, color, length, texture } from '@beatbattle/shared/tokens'
import { type Child, dataUri, h, type Node } from './ogKit'

/**
 * La carta de productor en la imagen OG del perfil (guía §2.15, §3.4.4; tarea 7.28): el anverso de la carta de la web
 * (número, sello de nivel con su arco, retrato con trama y monograma, etiqueta de variante, nombre, rango, victorias ·
 * podios · semanas, vitrina y pie con la firma), inclinada −3° y en su variante. Lo dibujado (marco con chaflán, trama,
 * lámina, sello y corona) va en un SVG de fondo, rasterizado por resvg (CPU) como el resto de la imagen; el texto, con
 * satori y las fuentes del juego. Todo sale de lo público del perfil (solo semanas selladas, §2.10). La imagen se ve a
 * ~500 px: la letra pequeña de la carta no baja de 14 px y lo importante va también en grande al lado (`ogImages`).
 */

export interface CardOgData {
  name: string
  number: number
  initials: string
  since: string
  level: number
  levelFraction: number
  rank: RankId
  variant: CardVariant
  stats: { wins: number; podiums: number; weeks: number }
  /** Logros de la vitrina (públicos) y cuántos logros públicos tiene. */
  showcase: number
  achievements: number
}

/** Proporción de la carta coleccionable (63 × 88). */
export const CARD_RATIO = 88 / 63
/** Ancho de la carta de la web en el perfil: las medidas de aquí se escalan desde él. */
const WEB_WIDTH = 352

const n = (value: number) => Number(value.toFixed(2))

/** Polígono con chaflán arriba a la izquierda y abajo a la derecha (el marco de §3.3). */
function chamfer(x: number, y: number, w: number, h: number, cut: number): string {
  return [
    [x + cut, y],
    [x + w, y],
    [x + w, y + h - cut],
    [x + w - cut, y + h],
    [x, y + h],
    [x, y + cut],
  ]
    .map(([px, py]) => `${n(px as number)},${n(py as number)}`)
    .join(' ')
}

/** El retrato: recortado solo arriba a la izquierda, con el chaflán del marco menos su trazo (`.art` de la web). */
function artPolygon(art: { x: number; y: number; w: number; h: number }, cut: number): string {
  return [
    [art.x + cut, art.y],
    [art.x + art.w, art.y],
    [art.x + art.w, art.y + art.h],
    [art.x, art.y + art.h],
    [art.x, art.y + cut],
  ]
    .map(([px, py]) => `${n(px as number)},${n(py as number)}`)
    .join(' ')
}

/**
 * Los puntos de la trama del retrato: la forma `podiumFloor` de la web (`ui/arena/halftone.ts`: crece hacia abajo y no
 * deja puntos arriba), con la celda, el ángulo y el radio de los tokens.
 */
function halftoneCircles(w: number, h: number, scale: number): string {
  const cell = texture.halftoneCell * scale
  const radians = (texture.halftoneAngle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const reach = Math.hypot(w, h) / 2 + cell
  const out: string[] = []
  for (let i = -reach; i <= reach; i += cell)
    for (let j = -reach; j <= reach; j += cell) {
      const x = w / 2 + i * cos - j * sin
      const y = h / 2 + i * sin + j * cos
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue
      const v = Math.min(1, Math.max(0, (y / h - 0.2) / 0.8))
      const r = cell * texture.halftoneMax * v ** 1.3 * 0.9
      if (r < 0.35) continue
      out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`)
    }
  return out.join('')
}

/** El sector del arco del sello (la fracción del nivel, desde arriba y en el sentido de las agujas). */
function arcPath(cx: number, cy: number, r: number, fraction: number): string {
  const f = Math.min(0.9999, Math.max(0, fraction))
  if (f === 0) return ''
  const end = -Math.PI / 2 + f * Math.PI * 2
  const x = cx + r * Math.cos(end)
  const y = cy + r * Math.sin(end)
  return `<path d="M${n(cx)},${n(cy)} L${n(cx)},${n(cy - r)} A${n(r)},${n(r)} 0 ${f > 0.5 ? 1 : 0} 1 ${n(x)},${n(y)} Z" fill="${color.red}"/>`
}

/** Medidas de la carta a un ancho dado. */
function geometry(width: number) {
  const u = width / WEB_WIDTH
  const height = Math.round(width * CARD_RATIO)
  const stroke = length.strokeCursor * u
  const cut = length.cutLg * u
  const art = { x: stroke, y: stroke, w: width - 2 * stroke, h: Math.round(height * 0.5) }
  const seal = Math.max(48, 0.176 * width)
  return { u, width, height, stroke, cut, art, seal }
}

/** El fondo dibujado de la carta (marco, retrato, trama, lámina, sello y corona) como SVG. */
export function cardSvg(card: CardOgData, width: number): string {
  const g = geometry(width)
  const { u, height, stroke, cut, art, seal } = g
  const border =
    card.variant === 'red' || card.variant === 'champion'
      ? color.red
      : card.variant === 'holo'
        ? 'url(#foilEdge)'
        : color.white
  const artCut = cut - stroke * 0.586
  const artFill =
    card.variant === 'red' ? color.redCta : card.variant === 'champion' ? 'url(#artChamp)' : 'url(#artStd)'
  const ink = card.variant === 'red' ? color.redShade : color.red
  const foil =
    card.variant === 'holo' || card.variant === 'champion'
      ? `<rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" fill="url(#${card.variant === 'holo' ? 'foilHolo' : 'foilChamp'})" clip-path="url(#art)"/>`
      : ''
  const sx = width - 12 * u - seal / 2
  const sy = 12 * u + seal / 2
  const crown =
    card.variant === 'champion'
      ? `<g transform="translate(${n(width / 2 - 0.08 * width)},${n(6 * u)}) scale(${n((0.16 * width) / 24)})"><path d="M3 18L2 7l6 5 4-8 4 8 6-5-1 11z" fill="${color.red}" stroke="${color.black}" stroke-width="1.5" stroke-linejoin="round"/></g>`
      : ''
  const band = (id: string, red: number, white: number, wine: number) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.55">` +
    `<stop offset="0.22" stop-color="${color.red}" stop-opacity="0"/>` +
    `<stop offset="0.32" stop-color="${color.red}" stop-opacity="${red}"/>` +
    `<stop offset="0.38" stop-color="${color.white}" stop-opacity="${white}"/>` +
    `<stop offset="0.45" stop-color="${color.wine}" stop-opacity="${wine}"/>` +
    `<stop offset="0.52" stop-color="${color.red}" stop-opacity="${red}"/>` +
    `<stop offset="0.62" stop-color="${color.red}" stop-opacity="0"/></linearGradient>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    '<defs>' +
    `<linearGradient id="artStd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color.wine2}"/><stop offset="0.7" stop-color="${color.wine3}"/><stop offset="1" stop-color="${color.black}"/></linearGradient>` +
    `<linearGradient id="artChamp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color.redShade}"/><stop offset="0.6" stop-color="${color.wine2}"/><stop offset="1" stop-color="${color.black}"/></linearGradient>` +
    `<linearGradient id="foilEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color.red}"/><stop offset="0.25" stop-color="${color.white}"/><stop offset="0.5" stop-color="${color.wine}"/><stop offset="0.75" stop-color="${color.red}"/><stop offset="1" stop-color="${color.white}"/></linearGradient>` +
    band('foilHolo', 0.38, 0.42, 0.6) +
    band('foilChamp', 0.38, 0.18, 0.3) +
    `<clipPath id="art"><polygon points="${artPolygon(art, artCut)}"/></clipPath>` +
    '</defs>' +
    `<polygon points="${chamfer(0, 0, width, height, cut)}" fill="${border}"/>` +
    `<polygon points="${chamfer(stroke, stroke, width - 2 * stroke, height - 2 * stroke, cut - stroke * 0.586)}" fill="${color.black}"/>` +
    `<g clip-path="url(#art)"><rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" fill="${artFill}"/>` +
    `<g transform="translate(${n(art.x)},${n(art.y)})" fill="${ink}">${halftoneCircles(art.w, art.h, u)}</g></g>` +
    foil +
    crown +
    `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(seal / 2)}" fill="${color.ink4}"/>` +
    arcPath(sx, sy, seal / 2, card.levelFraction) +
    `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(seal / 2 - stroke)}" fill="${color.black}"/>` +
    '</svg>'
  )
}

/** Texto de la etiqueta de variante (la estándar no lleva), como `ui.producerCard.variants.*.tag`. */
export function variantTag(variant: CardVariant, wins: number): string | null {
  switch (variant) {
    case 'red':
      return 'Carta roja'
    case 'holo':
      return `Holo · ganador ×${wins}`
    case 'champion':
      return 'Campeón de temporada'
    default:
      return null
  }
}

const abs = (style: Record<string, unknown>, ...children: Child[]) =>
  h('div', { position: 'absolute', ...style }, ...children)

const label = (text: string, size: number, tone: string, extra: Record<string, unknown> = {}) =>
  h(
    'span',
    {
      fontFamily: 'Chakra Petch',
      fontWeight: 700,
      fontSize: size,
      color: tone,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      ...extra,
    },
    text,
  )

/** El monograma con su extrusión roja en capas (el `Monogram` de la web), como capas de texto. */
function monogram(initials: string, size: number, u: number): Node {
  const layers = [6, 5, 4, 3, 2, 1].map((step) =>
    abs(
      { left: step * 1.6 * u, top: step * 1.8 * u },
      h('span', { fontFamily: 'Anybody', fontWeight: 900, fontSize: size, color: color.redCta }, initials),
    ),
  )
  return h(
    'div',
    { position: 'relative', transform: `rotate(${angle.tiltCard}deg)` },
    ...layers,
    h('span', { fontFamily: 'Anybody', fontWeight: 900, fontSize: size, color: color.white }, initials),
  )
}

/** La carta como nodo de satori, de `width` px de ancho (y su alto, 63 × 88), inclinada −3°. */
export function cardNode(card: CardOgData, width: number): Node {
  const g = geometry(width)
  const { u, height, art, seal } = g
  const pad = 16 * u
  const tag = variantTag(card.variant, card.stats.wins)
  const nameSize = Math.min(36 * u, Math.floor((width - 2 * pad) / (0.72 * Math.max(1, card.name.length))))
  const stat = (key: 'wins' | 'podiums' | 'weeks', name: string, first: boolean) =>
    h(
      'div',
      {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        padding: `${6 * u}px 0`,
        borderLeft: first ? 'none' : `${length.strokeHair}px solid ${color.line}`,
      },
      h(
        'span',
        { fontFamily: 'Oxanium', fontWeight: 700, fontSize: 30 * u, color: color.white, lineHeight: 1 },
        String(card.stats[key]),
      ),
      label(name, 16 * u, color.text3, { marginTop: 4 * u, letterSpacing: 0.5 }),
    )
  return h(
    'div',
    {
      position: 'relative',
      width,
      height,
      flexShrink: 0,
      transform: `rotate(${angle.tiltCard}deg)`,
    },
    {
      type: 'img',
      props: {
        src: dataUri(cardSvg(card, width), 'image/svg+xml'),
        width,
        height,
        style: { position: 'absolute', left: 0, top: 0 },
      },
    },
    // El retrato: el monograma en el centro de la trama.
    abs(
      {
        left: art.x,
        top: art.y + art.h * 0.12,
        width: art.w,
        height: art.h * 0.72,
        alignItems: 'center',
        justifyContent: 'center',
      },
      monogram(card.initials, 104 * u, u),
    ),
    // El número, en su placa.
    abs(
      {
        left: pad,
        top: pad,
        padding: `${3 * u}px ${8 * u}px`,
        backgroundColor: color.black,
        border: `${length.stroke}px solid ${color.lineStrong}`,
      },
      h(
        'span',
        { fontFamily: 'Oxanium', fontWeight: 700, fontSize: 18 * u, color: color.white, letterSpacing: 1 },
        `#${String(card.number).padStart(4, '0')}`,
      ),
    ),
    // El nivel, dentro del sello.
    abs(
      {
        left: width - 12 * u - seal,
        top: 12 * u,
        width: seal,
        height: seal,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      },
      h(
        'span',
        { fontFamily: 'Anybody', fontWeight: 900, fontSize: 26 * u, color: color.white, lineHeight: 0.9 },
        String(card.level),
      ),
      label('Nv', 14 * u, color.text2, { lineHeight: 1 }),
    ),
    tag
      ? abs(
          {
            left: pad,
            top: art.y + art.h - 12 * u - 30 * u,
            padding: `${4 * u}px ${10 * u}px`,
            backgroundColor: card.variant === 'champion' ? color.red : color.white,
            transform: `rotate(${angle.tiltCard}deg)`,
          },
          h(
            'span',
            {
              fontFamily: 'Anybody',
              fontWeight: 900,
              fontSize: 16 * u,
              color: color.black,
              letterSpacing: 1,
              textTransform: 'uppercase',
            },
            tag,
          ),
        )
      : null,
    // El cuerpo: nombre, rango, cifras, vitrina y pie.
    abs(
      {
        left: pad,
        top: art.y + art.h + 10 * u,
        width: width - 2 * pad,
        height: height - art.y - art.h - 10 * u - 12 * u,
        flexDirection: 'column',
      },
      h(
        'span',
        {
          fontFamily: 'Anybody',
          fontWeight: 900,
          fontSize: nameSize,
          color: color.white,
          lineHeight: 1.05,
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
        },
        card.name,
      ),
      label(RANK_NAMES[card.rank] ?? card.rank, 18 * u, color.red, { marginTop: 4 * u }),
      h(
        'div',
        {
          marginTop: 8 * u,
          borderTop: `${length.strokeHair}px solid ${color.line}`,
          borderBottom: `${length.strokeHair}px solid ${color.line}`,
        },
        stat('wins', 'Victorias', true),
        stat('podiums', 'Podios', false),
        stat('weeks', 'Semanas', false),
      ),
      label(
        card.achievements > 0 ? `Vitrina · ${card.showcase} de ${card.achievements}` : 'Vitrina',
        16 * u,
        color.text2,
        { marginTop: 8 * u },
      ),
      h(
        'div',
        { marginTop: 'auto', justifyContent: 'space-between', alignItems: 'center' },
        label(`Beat Battle · desde ${card.since}`, 15 * u, color.text3, { letterSpacing: 1 }),
        h('span', { fontFamily: 'Anybody', fontWeight: 900, fontSize: 22 * u, color: color.red }, 'OTP.'),
      ),
    ),
  )
}

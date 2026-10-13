import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { color, medal } from '@beatbattle/shared/tokens'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

/**
 * Tarjeta de resultado personal (§3.8.12, §4.19.5; tarea 6.10): la imagen que lleva el Lunes de batalla de
 * quien participó. 1200 × 630 (la proporción de las imágenes OG), fondo negro propio para que los clientes que
 * invierten colores no la rompan, la medalla de vinilo de su puesto (§3.4.3) y las cifras de la semana sellada.
 * En el email va a 560 px de ancho: ningún texto baja de 30 px aquí (14 px allí, §3.8.12).
 *
 * satori pinta el árbol a SVG con las fuentes del juego (Anybody, Chakra Petch y Oxanium, en `woff` estático:
 * satori no lee `woff2` ni fuentes variables) y resvg lo rasteriza a PNG.
 */

export const RESULT_CARD_WIDTH = 1200
export const RESULT_CARD_HEIGHT = 630

export interface ResultCardData {
  weekNumber: number
  sampleTitle: string
  entryTitle: string
  alias: string
  /** `null` si la cuenta ya no existe. */
  producer: string | null
  /** `null` = sin clasificar. */
  position: number | null
  scoreMilli: number
  votes: number
  histogram: readonly [number, number, number, number, number]
  /** Revisión del snapshot: con un re-sellado, la tarjeta lo dice. */
  corrected: boolean
}

type Child = Node | string | null | false
interface Node {
  type: string
  props: Record<string, unknown> & { children?: Child | Child[] }
}

const h = (type: string, style: Record<string, unknown>, ...children: Child[]): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children },
})

const require = createRequire(import.meta.url)
const fontFile = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`))

type Fonts = Parameters<typeof satori>[1]['fonts']
let fonts: Fonts | null = null
function loadFonts(): Fonts {
  fonts ??= [
    { name: 'Anybody', data: fontFile('@fontsource/anybody', 'anybody-latin-900-normal.woff'), weight: 900 },
    {
      name: 'Chakra Petch',
      data: fontFile('@fontsource/chakra-petch', 'chakra-petch-latin-600-normal.woff'),
      weight: 600,
    },
    {
      name: 'Chakra Petch',
      data: fontFile('@fontsource/chakra-petch', 'chakra-petch-latin-700-normal.woff'),
      weight: 700,
    },
    { name: 'Oxanium', data: fontFile('@fontsource/oxanium', 'oxanium-latin-700-normal.woff'), weight: 700 },
  ]
  return fonts
}

/** Surcos del vinilo (unidades del dibujo de 100 × 100), los de `ui/Medal`. */
const GROOVES = Array.from({ length: 9 }, (_, index) => 20 + index * 3.2)

/** La medalla de vinilo de §3.4.3 como SVG (el `Medal` de la web, con los colores por token). */
export function medalSvg(place: 1 | 2 | 3): string {
  const ink = color[medal[place]]
  const rim = place === 3 ? color.white : ink
  const grooves = GROOVES.map(
    (r) => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color.line}" stroke-width="1"/>`,
  ).join('')
  const crown =
    place === 1 ? `<path d="M37 56 L35 42 L43 49 L50 38 L57 49 L65 42 L63 56 Z" fill="${color.black}"/>` : ''
  const label =
    place === 3
      ? `<circle cx="50" cy="50" r="19" fill="${ink}" stroke="${color.white}" stroke-width="2"/>`
      : `<circle cx="50" cy="50" r="19" fill="${ink}"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="48" fill="${color.panel}" stroke="${rim}" stroke-width="3"/>${grooves}` +
    `<path d="M18 30 A38 38 0 0 1 40 13" fill="none" stroke="${color.lineStrong}" stroke-width="3"/>` +
    `${label}${crown}<circle cx="50" cy="50" r="2.4" fill="${color.black}"/></svg>`
  )
}

/** «4,21» (la puntuación con dos decimales, como en la web). */
export const scoreText = (scoreMilli: number) => (scoreMilli / 1000).toFixed(2).replace('.', ',')

function tree(data: ResultCardData): Node {
  const place = data.position !== null && data.position <= 3 ? (data.position as 1 | 2 | 3) : null
  const max = Math.max(1, ...data.histogram)
  const label = (text: string) =>
    h('span', { fontFamily: 'Chakra Petch', fontWeight: 600, fontSize: 30, color: color.text3 }, text)
  const stat = (name: string, value: string) =>
    h(
      'div',
      { flexDirection: 'column', marginRight: 40 },
      label(name),
      h(
        'span',
        { fontFamily: 'Oxanium', fontWeight: 700, fontSize: 72, color: color.white, lineHeight: 1 },
        value,
      ),
    )
  const medalCol = h(
    'div',
    { width: 380, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    place
      ? {
          type: 'img',
          props: {
            src: `data:image/svg+xml;base64,${Buffer.from(medalSvg(place)).toString('base64')}`,
            width: 260,
            height: 260,
          },
        }
      : h('div', {
          width: 260,
          height: 260,
          borderRadius: 130,
          border: `3px solid ${color.ink4}`,
          backgroundColor: color.panel,
        }),
    h(
      'span',
      {
        marginTop: 24,
        fontFamily: 'Anybody',
        fontWeight: 900,
        fontSize: data.position === null ? 40 : 96,
        color: data.position === 1 ? color.red : color.white,
        lineHeight: 1,
        textAlign: 'center',
      },
      data.position === null ? 'SIN CLASIFICAR' : `${data.position}.º`,
    ),
  )
  const bars = h(
    'div',
    { alignItems: 'flex-end', height: 120 },
    ...data.histogram.map((count, index) =>
      h(
        'div',
        { flexDirection: 'column', alignItems: 'center', marginLeft: 12 },
        h('div', {
          width: 32,
          height: Math.max(4, Math.round((count / max) * 80)),
          backgroundColor: index === 4 ? color.red : color.text2,
        }),
        h(
          'span',
          { fontFamily: 'Oxanium', fontWeight: 700, fontSize: 30, color: color.text3, marginTop: 6 },
          String(index + 1),
        ),
      ),
    ),
  )
  return h(
    'div',
    {
      width: RESULT_CARD_WIDTH,
      height: RESULT_CARD_HEIGHT,
      backgroundColor: color.black,
      padding: 32,
    },
    h(
      'div',
      {
        flex: 1,
        backgroundColor: color.panel,
        border: `2px solid ${color.lineStrong}`,
        padding: '40px 48px',
      },
      medalCol,
      h(
        'div',
        { flex: 1, flexDirection: 'column', justifyContent: 'space-between', paddingLeft: 24 },
        h(
          'div',
          { flexDirection: 'column' },
          h(
            'span',
            { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 30, color: color.red, letterSpacing: 2 },
            `SEMANA #${data.weekNumber} · ${data.corrected ? 'RESULTADO CORREGIDO' : 'RESULTADOS OFICIALES'}`,
          ),
          h(
            'span',
            {
              fontFamily: 'Anybody',
              fontWeight: 900,
              display: 'block',
              fontSize: data.entryTitle.length > 24 ? 52 : 64,
              color: color.white,
              lineHeight: 1.05,
              marginTop: 12,
              lineClamp: 2,
            },
            data.entryTitle,
          ),
          h(
            'div',
            { marginTop: 12, alignItems: 'baseline' },
            h(
              'span',
              {
                fontFamily: 'Chakra Petch',
                fontWeight: 600,
                fontSize: 32,
                color: color.text4,
                textDecoration: 'line-through',
                marginRight: 16,
              },
              data.alias,
            ),
            h(
              'span',
              { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 36, color: color.white },
              data.producer ?? 'Productor eliminado',
            ),
          ),
        ),
        h(
          'div',
          { alignItems: 'flex-end', justifyContent: 'space-between' },
          h('div', {}, stat('PUNTUACIÓN', scoreText(data.scoreMilli)), stat('VOTOS', String(data.votes))),
          bars,
        ),
        h(
          'div',
          { justifyContent: 'space-between', alignItems: 'baseline' },
          h(
            'span',
            { fontFamily: 'Chakra Petch', fontWeight: 600, fontSize: 30, color: color.text3, maxWidth: 520 },
            `Sample: ${data.sampleTitle}`,
          ),
          h(
            'span',
            { fontFamily: 'Anybody', fontWeight: 900, fontSize: 40, color: color.red, letterSpacing: 1 },
            'OTP.',
          ),
        ),
      ),
    ),
  )
}

/** La tarjeta como SVG (para los tests, que no rasterizan). */
export async function resultCardSvg(data: ResultCardData): Promise<string> {
  return satori(tree(data) as unknown as Parameters<typeof satori>[0], {
    width: RESULT_CARD_WIDTH,
    height: RESULT_CARD_HEIGHT,
    fonts: loadFonts(),
  })
}

/** La tarjeta como PNG. */
export async function resultCardPng(data: ResultCardData): Promise<Uint8Array> {
  const svg = await resultCardSvg(data)
  return new Resvg(svg, { fitTo: { mode: 'width', value: RESULT_CARD_WIDTH } }).render().asPng()
}

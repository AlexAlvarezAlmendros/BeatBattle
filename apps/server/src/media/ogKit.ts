import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { color, medal } from '@beatbattle/shared/tokens'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

/**
 * Lo común de las imágenes del servidor (tareas 6.10 y 6.11): el árbol para satori, las fuentes del juego en
 * `woff` estático (satori no lee `woff2` ni fuentes variables), la medalla de vinilo y el paso a PNG con resvg.
 */

export type Child = Node | string | null | false
export interface Node {
  type: string
  props: Record<string, unknown> & { children?: Child | Child[] }
}

export const h = (type: string, style: Record<string, unknown>, ...children: Child[]): Node => ({
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

/** Pinta un árbol a PNG de `width` × `height`. */
export async function renderPng(node: Node, width: number, height: number): Promise<Uint8Array> {
  const svg = await renderSvg(node, width, height)
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
}

/** Pinta un árbol a SVG (los tests no rasterizan). */
export function renderSvg(node: Node, width: number, height: number): Promise<string> {
  return satori(node as unknown as Parameters<typeof satori>[0], { width, height, fonts: loadFonts() })
}

/** Una imagen PNG o SVG como `src` de un `<img>` de satori. */
export const dataUri = (bytes: Uint8Array | string, type: 'image/png' | 'image/svg+xml') =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`

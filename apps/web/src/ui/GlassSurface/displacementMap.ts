/**
 * Mapa de desplazamiento del cristal (ReactBits GlassSurface, adaptado por el sello): una imagen SVG
 * cuyo canal rojo desplaza en X y el azul en Y. Lo lee el `feDisplacementMap` del filtro de
 * `GlassSurface`. Sus «colores» son datos del filtro, no colores de diseño: por eso viven aquí y no en
 * los tokens, cada uno con su excepción razonada del lint.
 */

export interface DisplacementMapOptions {
  /** Tamaño real de la pieza en px. */
  width: number
  height: number
  /** Radio de las esquinas en px (el calculado de la pieza: `border-radius`). */
  radius: number
  /** Grosor del borde que refracta, como fracción del lado menor (0,07 en el sello). */
  borderWidth: number
  /** Luminosidad del centro neutro, 0–100. */
  brightness: number
  /** Opacidad del centro neutro, 0–1. */
  opacity: number
  /** Desenfoque del centro en px (suaviza la transición del borde al centro). */
  blur: number
  /** Mezcla del gradiente azul sobre el rojo. */
  mixBlendMode: string
  /** Ids únicos de los degradados (uno por pieza). */
  redGradientId: string
  blueGradientId: string
}

// lint-tokens-allow: canal vacío del mapa de desplazamiento (dato del filtro SVG, no un color de diseño)
const CHANNEL_NONE = '#0000'
const CHANNEL_X = 'red'
const CHANNEL_Y = 'blue'
const CHANNEL_BASE = 'black'

/** Devuelve el mapa como `data:image/svg+xml,…`, listo para el `href` de un `feImage`. */
export function buildDisplacementMap(options: DisplacementMapOptions): string {
  const { width, height, radius, borderWidth, brightness, opacity, blur, mixBlendMode } = options
  const edge = Math.min(width, height) * (borderWidth * 0.5)
  // lint-tokens-allow: centro neutro del mapa de desplazamiento (dato del filtro SVG, no un color de diseño)
  const neutral = `hsl(0 0% ${brightness}% / ${opacity})`
  const svg = [
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<defs>',
    `<linearGradient id="${options.redGradientId}" x1="100%" y1="0%" x2="0%" y2="0%">`,
    `<stop offset="0%" stop-color="${CHANNEL_NONE}"/><stop offset="100%" stop-color="${CHANNEL_X}"/>`,
    '</linearGradient>',
    `<linearGradient id="${options.blueGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `<stop offset="0%" stop-color="${CHANNEL_NONE}"/><stop offset="100%" stop-color="${CHANNEL_Y}"/>`,
    '</linearGradient>',
    '</defs>',
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${CHANNEL_BASE}"/>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#${options.redGradientId})"/>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#${options.blueGradientId})" style="mix-blend-mode: ${mixBlendMode}"/>`,
    `<rect x="${edge}" y="${edge}" width="${width - edge * 2}" height="${height - edge * 2}" rx="${radius}" fill="${neutral}" style="filter:blur(${blur}px)"/>`,
    '</svg>',
  ].join('')
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

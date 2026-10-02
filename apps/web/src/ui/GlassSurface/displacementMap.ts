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
}

/**
 * Ids de los degradados dentro del mapa. Pueden ser fijos: el mapa es un documento SVG aparte (la imagen
 * del `feImage`), con sus propios ids. Así dos piezas del mismo tamaño generan exactamente el mismo mapa
 * y comparten imagen.
 */
const RED_GRADIENT_ID = 'map-x'
const BLUE_GRADIENT_ID = 'map-y'

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
    `<linearGradient id="${RED_GRADIENT_ID}" x1="100%" y1="0%" x2="0%" y2="0%">`,
    `<stop offset="0%" stop-color="${CHANNEL_NONE}"/><stop offset="100%" stop-color="${CHANNEL_X}"/>`,
    '</linearGradient>',
    `<linearGradient id="${BLUE_GRADIENT_ID}" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `<stop offset="0%" stop-color="${CHANNEL_NONE}"/><stop offset="100%" stop-color="${CHANNEL_Y}"/>`,
    '</linearGradient>',
    '</defs>',
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${CHANNEL_BASE}"/>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#${RED_GRADIENT_ID})"/>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#${BLUE_GRADIENT_ID})" style="mix-blend-mode: ${mixBlendMode}"/>`,
    `<rect x="${edge}" y="${edge}" width="${width - edge * 2}" height="${height - edge * 2}" rx="${radius}" fill="${neutral}" style="filter:blur(${blur}px)"/>`,
    '</svg>',
  ].join('')
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Rejilla a la que se redondea el tamaño del mapa, en px: el `feImage` lo estira a la pieza. */
export const MAP_GRID_PX = 8

/** Mapas distintos que se guardan; los más antiguos salen primero. */
export const MAP_CACHE_SIZE = 32

const mapCache = new Map<string, string>()

/**
 * Mapa de una pieza, de una caché de módulo. Chrome crea un documento de imagen SVG (y su mapa
 * rasterizado) por cada URL `data:` distinta y no lo suelta: con un mapa nuevo por cada aviso del
 * `ResizeObserver`, redimensionar la ventana dejaba decenas de documentos y cientos de MB retenidos.
 * Con el tamaño redondeado a `MAP_GRID_PX` y la misma cadena para la misma clave, tamaños iguales (o
 * casi) y piezas iguales reutilizan la misma imagen.
 */
export function displacementMapFor(options: DisplacementMapOptions): string {
  const width = Math.max(MAP_GRID_PX, Math.round(options.width / MAP_GRID_PX) * MAP_GRID_PX)
  const height = Math.max(MAP_GRID_PX, Math.round(options.height / MAP_GRID_PX) * MAP_GRID_PX)
  const radius = Math.round(Math.min(options.radius, width / 2, height / 2))
  const quantized = { ...options, width, height, radius }
  const key = JSON.stringify(quantized)
  const cached = mapCache.get(key)
  if (cached !== undefined) {
    // Al final de la cola: es el más reciente.
    mapCache.delete(key)
    mapCache.set(key, cached)
    return cached
  }
  const map = buildDisplacementMap(quantized)
  mapCache.set(key, map)
  if (mapCache.size > MAP_CACHE_SIZE) mapCache.delete(mapCache.keys().next().value as string)
  return map
}

/** Vacía la caché (tests). */
export function clearDisplacementMapCache(): void {
  mapCache.clear()
}

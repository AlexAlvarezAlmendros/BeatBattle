import type { HtmlTagDescriptor, Plugin } from 'vite'

/**
 * Precarga de las fuentes de la primera pintura (guía §3.2 «Tipografía», §4.7.1 y §4.17; tareas 0.22 y
 * 0.28). `fonts.css` las pide, así que sin precarga el navegador no las descubre hasta descargar y
 * analizar el CSS; con `<link rel="preload">` empiezan a bajar a la vez que el JS.
 *
 * Se precarga **solo Chakra Petch 700** latina (10 KB): es la cara que más se pinta en la primera vista
 * (rótulos, HUD, barra; ×19 en la home de escritorio) y así sale ya con su fuente. **Anybody no** (62 KB):
 * competía por el ancho de banda con el JS crítico y retrasaba el LCP (el título del escenario, que se
 * pinta con la de reserva y cambia después; el logo ya espera a `document.fonts.load`). Medido con el
 * perfil de `RNF-PERF-02` (4G lento, CPU ×4, 412×823, cinco cargas intercaladas, 2026-10-03):
 *
 * | Precarga                          | LCP (mediana) | CLS    |
 * |-----------------------------------|---------------|--------|
 * | Anybody cursiva + Chakra Petch 600 | 2,00 s        | 0,0002 |
 * | Ninguna                            | 1,60 s        | 0,0036 |
 * | Chakra Petch 700 (**esta**)        | 1,64 s        | 0,0034 |
 *
 * Es un plugin de Vite: en la construcción busca en el bundle cada woff2 con su nombre con hash y añade
 * la etiqueta al `index.html`. Si no lo encuentra, la construcción falla (que no desaparezca la
 * precarga en silencio si alguien cambia `fonts.css`). En desarrollo no hace nada.
 */

/** Ficheros de fuente que se precargan, por su nombre original. */
export const PRELOADED_FONTS = ['chakra-petch-latin-700-normal.woff2'] as const

/** Lo mínimo de un elemento del bundle de salida que hace falta aquí. */
export interface BundleEntry {
  type: 'asset' | 'chunk'
  fileName: string
  names?: readonly string[]
  originalFileNames?: readonly string[]
}

/** Nombre con hash (`assets/anybody-latin-standard-italic-AbC123.woff2`) de un fichero del bundle. */
export function findAssetFileName(
  bundle: Record<string, BundleEntry>,
  sourceName: string,
): string | undefined {
  const stem = sourceName.replace(/\.[^.]+$/, '')
  const extension = sourceName.slice(stem.length)
  const hashed = new RegExp(`(?:^|/)${escapeRegExp(stem)}-[\\w-]+${escapeRegExp(extension)}$`)
  for (const entry of Object.values(bundle)) {
    if (entry.type !== 'asset') continue
    const byName =
      entry.names?.includes(sourceName) ||
      entry.originalFileNames?.some(
        (original) => original === sourceName || original.endsWith(`/${sourceName}`),
      )
    if (byName) return entry.fileName
  }
  // Solo por el nombre con hash, si el bundle no trae los nombres originales. El hash de Vite no lleva
  // guiones tras el nombre del fichero… salvo a veces: se prueba después para no confundir el latino
  // con el latino extendido (`…-latin-ext-…` también encaja con `…-latin-` seguido de algo).
  for (const entry of Object.values(bundle)) {
    if (entry.type === 'asset' && hashed.test(entry.fileName)) return entry.fileName
  }
  return undefined
}

/** Etiquetas `<link rel="preload" as="font">` para las fuentes de `fonts`, con la base pública de Vite. */
export function fontPreloadTags(
  bundle: Record<string, BundleEntry>,
  base: string,
  fonts: readonly string[] = PRELOADED_FONTS,
): HtmlTagDescriptor[] {
  return fonts.map((font) => {
    const fileName = findAssetFileName(bundle, font)
    if (!fileName) throw new Error(`fontPreload: no está «${font}» en el bundle (¿ha cambiado fonts.css?)`)
    return {
      tag: 'link',
      attrs: {
        rel: 'preload',
        href: `${base.endsWith('/') ? base : `${base}/`}${fileName}`,
        as: 'font',
        type: 'font/woff2',
        // Las fuentes se piden siempre en modo CORS: sin `crossorigin` la precarga no se reutiliza.
        crossorigin: true,
      },
      injectTo: 'head',
    }
  })
}

export function fontPreload(fonts: readonly string[] = PRELOADED_FONTS): Plugin {
  let base = '/'
  return {
    name: 'beatbattle:font-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return
        return fontPreloadTags(ctx.bundle as Record<string, BundleEntry>, base, fonts)
      },
    },
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

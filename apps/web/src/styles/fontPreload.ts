import type { HtmlTagDescriptor, Plugin } from 'vite'

/**
 * Precarga de la fuente principal (guía §4.7.1: «HTML con el negro de fondo, tokens y fuentes con
 * `preload`»; tarea 0.5). Montserrat latina la pide `fonts.css`, así que sin precarga el navegador no
 * la descubre hasta descargar y analizar el CSS; con `<link rel="preload">` empieza a bajar a la vez.
 *
 * Es un plugin de Vite: en la construcción busca en el bundle el woff2 con su nombre con hash y añade
 * la etiqueta al `index.html`. Si no lo encuentra, la construcción falla (que no desaparezca la
 * precarga en silencio si alguien cambia `fonts.css`). En desarrollo no hace nada.
 */

/** Ficheros de fuente que se precargan, por su nombre original. */
export const PRELOADED_FONTS = ['montserrat-latin-wght-normal.woff2'] as const

/** Lo mínimo de un elemento del bundle de salida que hace falta aquí. */
export interface BundleEntry {
  type: 'asset' | 'chunk'
  fileName: string
  names?: readonly string[]
  originalFileNames?: readonly string[]
}

/** Nombre con hash (`assets/montserrat-latin-wght-normal-AbC123.woff2`) de un fichero del bundle. */
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
    if (byName || hashed.test(entry.fileName)) return entry.fileName
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

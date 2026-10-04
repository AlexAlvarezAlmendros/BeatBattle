import type { HtmlTagDescriptor, Plugin } from 'vite'

/**
 * Precarga de la página de inicio (RNF-PERF-02, §4.17: LCP de la home < 2,5 s en 4G). Cada página va en
 * su trozo diferido (§4.7.1), así que el navegador no pedía el de la home ni el del `Button` hasta haber
 * ejecutado el marco: una cascada de ~700 ms en 4G lento antes de poder pintar el titular. Con
 * `<link rel="modulepreload">` (y `preload` de su CSS) se piden a la vez que el resto del JS inicial.
 *
 * Es un plugin de Vite como `fontPreload`: en la construcción busca en el bundle el trozo de cada módulo
 * de `PRELOADED_ROUTES` y añade al `index.html` sus trozos y sus hojas de estilo que no estén ya en la
 * carga inicial. Si no lo encuentra, la construcción falla. Las demás rutas también reciben la precarga
 * (un `index.html` para todas): son ~10 kB gz, y el `Button` lo usan casi todas.
 */

/** Módulos de página que se precargan, por su ruta dentro de `apps/web`. */
export const PRELOADED_ROUTES = ['src/features/week/HomePage.tsx'] as const

/** Lo mínimo de un trozo del bundle de salida que hace falta aquí. */
export interface BundleChunk {
  type: 'asset' | 'chunk'
  fileName: string
  isEntry?: boolean
  facadeModuleId?: string | null
  imports?: readonly string[]
  viteMetadata?: { importedCss?: ReadonlySet<string> }
}

/** Trozos JS y hojas de estilo que necesita `module` y que la carga inicial aún no pide. */
export function routePreloadFiles(
  bundle: Record<string, BundleChunk>,
  modules: readonly string[] = PRELOADED_ROUTES,
): { scripts: string[]; styles: string[] } {
  const chunks = Object.values(bundle).filter((entry) => entry.type === 'chunk')
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const initial = new Set<string>()
  for (const entry of chunks.filter((chunk) => chunk.isEntry)) {
    initial.add(entry.fileName)
    for (const name of entry.imports ?? []) initial.add(name)
    for (const style of entry.viteMetadata?.importedCss ?? []) initial.add(style)
  }

  const scripts: string[] = []
  const styles: string[] = []
  const visit = (fileName: string) => {
    if (initial.has(fileName) || scripts.includes(fileName)) return
    const chunk = byFile.get(fileName)
    if (!chunk) return
    scripts.push(fileName)
    for (const style of chunk.viteMetadata?.importedCss ?? [])
      if (!initial.has(style) && !styles.includes(style)) styles.push(style)
    for (const name of chunk.imports ?? []) visit(name)
  }
  for (const module of modules) {
    const chunk = chunks.find((candidate) =>
      candidate.facadeModuleId?.replaceAll('\\', '/').endsWith(`/${module}`),
    )
    if (!chunk) throw new Error(`routePreload: no está el trozo de «${module}» en el bundle (¿se ha movido?)`)
    visit(chunk.fileName)
  }
  return { scripts, styles }
}

/** Etiquetas `<link>` de la precarga, con la base pública de Vite. */
export function routePreloadTags(
  bundle: Record<string, BundleChunk>,
  base: string,
  modules: readonly string[] = PRELOADED_ROUTES,
): HtmlTagDescriptor[] {
  const prefix = base.endsWith('/') ? base : `${base}/`
  const { scripts, styles } = routePreloadFiles(bundle, modules)
  return [
    // `crossorigin` como los `modulepreload` de Vite: si no coincide el modo, no se reutiliza la precarga.
    ...scripts.map((file) => ({
      tag: 'link',
      attrs: { rel: 'modulepreload', crossorigin: true, href: `${prefix}${file}` },
      injectTo: 'head' as const,
    })),
    // `preload` y no `stylesheet`: no bloquea la pintura de las demás rutas. El cargador de Vite la usa
    // al insertar la hoja (también con `crossorigin`).
    ...styles.map((file) => ({
      tag: 'link',
      attrs: { rel: 'preload', as: 'style', crossorigin: true, href: `${prefix}${file}` },
      injectTo: 'head' as const,
    })),
  ]
}

export function routePreload(modules: readonly string[] = PRELOADED_ROUTES): Plugin {
  let base = '/'
  return {
    name: 'beatbattle:route-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return
        return routePreloadTags(ctx.bundle as unknown as Record<string, BundleChunk>, base, modules)
      },
    },
  }
}

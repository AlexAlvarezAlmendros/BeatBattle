import { describe, expect, it } from 'vitest'
import { type BundleChunk, routePreloadFiles, routePreloadTags } from './routePreload'

const css = (...files: string[]) => ({ importedCss: new Set(files) })

/** Bundle mínimo con la forma del de la build: entrada, marco y la home con su botón. */
const bundle: Record<string, BundleChunk> = {
  'assets/index-A.js': {
    type: 'chunk',
    fileName: 'assets/index-A.js',
    isEntry: true,
    facadeModuleId: '/repo/apps/web/index.html',
    imports: ['assets/framework-B.js', 'assets/i18n-C.js'],
    viteMetadata: css('assets/index-A.css'),
  },
  'assets/framework-B.js': { type: 'chunk', fileName: 'assets/framework-B.js', imports: [] },
  'assets/i18n-C.js': { type: 'chunk', fileName: 'assets/i18n-C.js', imports: [] },
  'assets/HomePage-D.js': {
    type: 'chunk',
    fileName: 'assets/HomePage-D.js',
    facadeModuleId: '/repo/apps/web/src/features/week/HomePage.tsx',
    imports: ['assets/framework-B.js', 'assets/Button-E.js', 'assets/i18n-C.js'],
    viteMetadata: css('assets/HomePage-D.css'),
  },
  'assets/Button-E.js': {
    type: 'chunk',
    fileName: 'assets/Button-E.js',
    imports: ['assets/framework-B.js'],
    viteMetadata: css('assets/Button-E.css', 'assets/index-A.css'),
  },
  'assets/JuryPage-F.js': {
    type: 'chunk',
    fileName: 'assets/JuryPage-F.js',
    facadeModuleId: '/repo/apps/web/src/features/jury/JuryPage.tsx',
    imports: [],
  },
  'assets/font.woff2': { type: 'asset', fileName: 'assets/font.woff2' },
}

describe('precarga de la home (RNF-PERF-02, §4.17)', () => {
  it('RNF-PERF-02: precarga el trozo de la home y los que importa, sin repetir los de la carga inicial', () => {
    expect(routePreloadFiles(bundle)).toEqual({
      scripts: ['assets/HomePage-D.js', 'assets/Button-E.js'],
      styles: ['assets/HomePage-D.css', 'assets/Button-E.css'],
    })
  })

  it('RNF-PERF-02: etiquetas modulepreload y preload de estilo, con crossorigin y la base pública', () => {
    const tags = routePreloadTags(bundle, '/')
    expect(tags.map((tag) => tag.attrs)).toEqual([
      { rel: 'modulepreload', crossorigin: true, href: '/assets/HomePage-D.js' },
      { rel: 'modulepreload', crossorigin: true, href: '/assets/Button-E.js' },
      { rel: 'preload', as: 'style', crossorigin: true, href: '/assets/HomePage-D.css' },
      { rel: 'preload', as: 'style', crossorigin: true, href: '/assets/Button-E.css' },
    ])
    expect(tags.every((tag) => tag.injectTo === 'head')).toBe(true)
    expect(routePreloadTags(bundle, '/app')[0]?.attrs?.href).toBe('/app/assets/HomePage-D.js')
  })

  it('la construcción falla si la página precargada ya no está en el bundle', () => {
    expect(() => routePreloadFiles(bundle, ['src/features/week/Missing.tsx'])).toThrow(/Missing\.tsx/)
  })
})

import { describe, expect, it } from 'vitest'
import { type BundleEntry, findAssetFileName, fontPreloadTags, PRELOADED_FONTS } from './fontPreload'

const bundle: Record<string, BundleEntry> = {
  'assets/index-AbC.js': { type: 'chunk', fileName: 'assets/index-AbC.js' },
  'assets/anybody-latin-ext-standard-italic-Zz9.woff2': {
    type: 'asset',
    fileName: 'assets/anybody-latin-ext-standard-italic-Zz9.woff2',
    names: ['anybody-latin-ext-standard-italic.woff2'],
  },
  'assets/anybody-latin-standard-italic-l_AIctKy.woff2': {
    type: 'asset',
    fileName: 'assets/anybody-latin-standard-italic-l_AIctKy.woff2',
    names: ['anybody-latin-standard-italic.woff2'],
  },
  'assets/chakra-petch-latin-600-normal-Qw3.woff2': {
    type: 'asset',
    fileName: 'assets/chakra-petch-latin-600-normal-Qw3.woff2',
    names: ['chakra-petch-latin-600-normal.woff2'],
  },
  'assets/chakra-petch-latin-700-normal-Er5.woff2': {
    type: 'asset',
    fileName: 'assets/chakra-petch-latin-700-normal-Er5.woff2',
    names: ['chakra-petch-latin-700-normal.woff2'],
  },
}

describe('precarga de las fuentes de la arena (0.22, §3.2, §4.7.1)', () => {
  it('RNF-PERF-02: precarga solo Chakra Petch 700 latina; Anybody (62 KB) no, que retrasaba el LCP (§3.2, §4.17)', () => {
    expect(PRELOADED_FONTS).toEqual(['chakra-petch-latin-700-normal.woff2'])
  })

  it('RNF-PERF-02: encuentra el woff2 latino con su hash y no lo confunde con el latino extendido', () => {
    expect(findAssetFileName(bundle, 'anybody-latin-standard-italic.woff2')).toBe(
      'assets/anybody-latin-standard-italic-l_AIctKy.woff2',
    )
  })

  it('RNF-PERF-02: también lo encuentra solo por el nombre del fichero con hash', () => {
    const onlyFileName = {
      a: { type: 'asset', fileName: 'assets/chakra-petch-latin-600-normal-x1-Y2.woff2' },
    } as const
    expect(findAssetFileName(onlyFileName, 'chakra-petch-latin-600-normal.woff2')).toBe(
      'assets/chakra-petch-latin-600-normal-x1-Y2.woff2',
    )
  })

  it('RNF-PERF-02: genera <link rel="preload" as="font" type="font/woff2" crossorigin> con la base pública', () => {
    expect(fontPreloadTags(bundle, '/')).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'preload',
          href: '/assets/chakra-petch-latin-700-normal-Er5.woff2',
          as: 'font',
          type: 'font/woff2',
          crossorigin: true,
        },
        injectTo: 'head',
      },
    ])
    const tags = fontPreloadTags(bundle, '/', [
      'anybody-latin-standard-italic.woff2',
      'chakra-petch-latin-600-normal.woff2',
    ])
    expect(tags).toHaveLength(2)
    expect(tags[0]).toEqual({
      tag: 'link',
      attrs: {
        rel: 'preload',
        href: '/assets/anybody-latin-standard-italic-l_AIctKy.woff2',
        as: 'font',
        type: 'font/woff2',
        crossorigin: true,
      },
      injectTo: 'head',
    })
    expect(tags[1]?.attrs?.href).toBe('/assets/chakra-petch-latin-600-normal-Qw3.woff2')
    expect(fontPreloadTags(bundle, '/beta')[0]?.attrs?.href).toBe(
      '/beta/assets/chakra-petch-latin-700-normal-Er5.woff2',
    )
  })

  it('RNF-PERF-02: falla si la fuente no está en el bundle, para que la precarga no desaparezca en silencio', () => {
    expect(() => fontPreloadTags({}, '/')).toThrow(/chakra-petch-latin-700-normal\.woff2/)
  })
})

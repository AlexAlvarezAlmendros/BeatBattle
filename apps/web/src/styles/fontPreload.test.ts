import { describe, expect, it } from 'vitest'
import { type BundleEntry, findAssetFileName, fontPreloadTags } from './fontPreload'

const bundle: Record<string, BundleEntry> = {
  'assets/index-AbC.js': { type: 'chunk', fileName: 'assets/index-AbC.js' },
  'assets/montserrat-latin-ext-wght-normal-Zz9.woff2': {
    type: 'asset',
    fileName: 'assets/montserrat-latin-ext-wght-normal-Zz9.woff2',
    names: ['montserrat-latin-ext-wght-normal.woff2'],
  },
  'assets/montserrat-latin-wght-normal-l_AIctKy.woff2': {
    type: 'asset',
    fileName: 'assets/montserrat-latin-wght-normal-l_AIctKy.woff2',
    names: ['montserrat-latin-wght-normal.woff2'],
  },
}

describe('precarga de la fuente principal (0.5)', () => {
  it('encuentra el woff2 latino con su hash y no lo confunde con el latino extendido', () => {
    expect(findAssetFileName(bundle, 'montserrat-latin-wght-normal.woff2')).toBe(
      'assets/montserrat-latin-wght-normal-l_AIctKy.woff2',
    )
  })

  it('también lo encuentra solo por el nombre del fichero con hash', () => {
    const onlyFileName = {
      a: { type: 'asset', fileName: 'assets/montserrat-latin-wght-normal-x1-Y2.woff2' },
    } as const
    expect(findAssetFileName(onlyFileName, 'montserrat-latin-wght-normal.woff2')).toBe(
      'assets/montserrat-latin-wght-normal-x1-Y2.woff2',
    )
  })

  it('genera <link rel="preload" as="font" type="font/woff2" crossorigin> con la base pública', () => {
    const [tag] = fontPreloadTags(bundle, '/')
    expect(tag).toEqual({
      tag: 'link',
      attrs: {
        rel: 'preload',
        href: '/assets/montserrat-latin-wght-normal-l_AIctKy.woff2',
        as: 'font',
        type: 'font/woff2',
        crossorigin: true,
      },
      injectTo: 'head',
    })
    expect(fontPreloadTags(bundle, '/beta')[0]?.attrs?.href).toBe(
      '/beta/assets/montserrat-latin-wght-normal-l_AIctKy.woff2',
    )
  })

  it('falla si la fuente no está en el bundle, para que la precarga no desaparezca en silencio', () => {
    expect(() => fontPreloadTags({}, '/')).toThrow(/montserrat-latin-wght-normal\.woff2/)
  })
})

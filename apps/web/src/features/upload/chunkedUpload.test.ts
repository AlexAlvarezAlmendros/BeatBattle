import { describe, expect, it } from 'vitest'
import { CHUNK_BYTES, chunkRanges, contentRange } from './chunkedUpload'

describe('subida por trozos (§4.7.4)', () => {
  it('RF-STO-01: trozos de 6 MB con su Content-Range; el último, lo que quede', () => {
    const size = 2 * CHUNK_BYTES + 100
    const ranges = chunkRanges(size)
    expect(ranges).toEqual([
      [0, CHUNK_BYTES - 1],
      [CHUNK_BYTES, 2 * CHUNK_BYTES - 1],
      [2 * CHUNK_BYTES, size - 1],
    ])
    expect(contentRange(ranges[2]!, size)).toBe(`bytes ${2 * CHUNK_BYTES}-${size - 1}/${size}`)
  })

  it('un fichero pequeño es un solo trozo; uno vacío, ninguno', () => {
    expect(chunkRanges(1000)).toEqual([[0, 999]])
    expect(chunkRanges(CHUNK_BYTES)).toEqual([[0, CHUNK_BYTES - 1]])
    expect(chunkRanges(0)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { discTextSizes } from './TitleDisc'

describe('disco de la pantalla de título', () => {
  it('RD-VIS-05: el texto de la galleta nunca se pinta por debajo de 12 px', () => {
    // 760 px (la maqueta): 34 y 15 px.
    expect(discTextSizes(760)).toEqual({ title: 34, sub: 15 })
    // El disco de la columna en móvil (281 px): el título a 13 px y sin la línea del tempo (5,5 px).
    expect(discTextSizes(281)).toEqual({ title: 13, sub: null })
    for (const size of [120, 200, 281, 400, 600, 760, 1000]) {
      const { title, sub } = discTextSizes(size)
      for (const px of [title, sub]) if (px !== null) expect(px).toBeGreaterThanOrEqual(12)
    }
  })
})

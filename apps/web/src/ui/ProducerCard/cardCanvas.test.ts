import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CardFace,
  cardArtBox,
  cardHeight,
  paintCardBack,
  paintCardFace,
  paintFoilSheet,
} from './cardCanvas'
import { cardBack } from './cardModel'

/**
 * El lienzo de la carta (§3.4.4; tareas 7.28 y 7.23): el mismo pintor da la tarjeta para *stories* y las texturas de la
 * carta 3D colgada de su pase. jsdom no tiene contexto 2D: uno falso apunta lo que se escribe y en qué modo de mezcla,
 * y da medidas de mentira (6 px por carácter).
 */

const FACE: CardFace = {
  name: 'Kairo.wav',
  initials: 'KW',
  cardNumber: 42,
  level: 13,
  levelFraction: 0.4,
  rank: 'Maestro del bounce',
  stats: { wins: 7, podiums: 13, weeks: 14 },
  showcase: ['win', 'streak_3'],
  achievements: 13,
  since: '03/2026',
  variant: 'holo',
}

interface Recorded {
  texts: string[]
  /** Los modos de mezcla con los que se ha rellenado algo (la lámina va en `screen`). */
  fills: string[]
}

/** Un contexto 2D que apunta los textos y los rellenos. */
function recorder(log: Recorded = { texts: [], fills: [] }) {
  const gradient = { addColorStop: () => undefined }
  const target: Record<string, unknown> = {
    globalCompositeOperation: 'source-over',
    fillText: (text: string) => log.texts.push(text),
    fillRect: () => log.fills.push(String(target.globalCompositeOperation)),
    measureText: (text: string) => ({ width: text.length * 6 }),
    createLinearGradient: () => gradient,
    createConicGradient: () => gradient,
  }
  const ctx = new Proxy(target, {
    get: (object, key: string) => (key in object ? object[key] : () => undefined),
    set: (object, key: string, value) => {
      object[key] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log }
}

/** Los lienzos auxiliares (la trama, el logo) apuntan en un registro aparte: no son la carta. */
const scratch: Recorded = { texts: [], fills: [] }

beforeEach(() => {
  vi.stubGlobal(
    'Path2D',
    class {
      addPath() {}
      arc() {}
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => recorder(scratch).ctx as unknown as RenderingContext,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('la carta en un lienzo 2D por CPU (§3.4.4)', () => {
  it('RF-GAME-07: el anverso dice lo mismo que la carta plana: número, nivel, etiqueta, nombre, rango, cifras, vitrina y pie', () => {
    const { ctx, log } = recorder()
    paintCardFace(ctx, FACE, 320)
    expect(log.texts).toEqual(
      expect.arrayContaining([
        '#0042',
        '13',
        'NV',
        'HOLO · GANADOR ×7',
        'KAIRO.WAV',
        'MAESTRO DEL BOUNCE',
        '7',
        'VICTORIAS',
        'PODIOS',
        'SEMANAS',
        'VITRINA',
        '2 DE 13',
        'BEAT BATTLE · DESDE 03/2026',
      ]),
    )
  })

  it('RF-GAME-07: por capas para la 3D: el retrato sin lámina, la lámina sola en «screen» y lo de encima sin el retrato', () => {
    const art = recorder()
    paintCardFace(art.ctx, FACE, 320, 'art')
    // Del retrato solo sale el monograma (un dibujo); ni la lámina ni los textos de la carta.
    expect(art.log.texts.every((text) => text === 'KW')).toBe(true)
    expect(art.log.fills).not.toContain('screen')
    const marks = recorder()
    paintCardFace(marks.ctx, FACE, 320, 'marks')
    expect(marks.log.texts).toEqual(
      expect.arrayContaining(['#0042', 'KAIRO.WAV', 'BEAT BATTLE · DESDE 03/2026']),
    )
    expect(marks.log.texts).not.toContain('KW')
    expect(marks.log.fills).not.toContain('screen')
    const all = recorder()
    paintCardFace(all.ctx, FACE, 320)
    expect(all.log.fills).toContain('screen')
    const sheet = recorder()
    paintFoilSheet(sheet.ctx, 'holo', 320, 40)
    expect(sheet.log.fills).toEqual(['source-over', 'screen'])
  })

  it('RF-GAME-07: la lámina, solo en la holo y la de campeón; la etiqueta, de la variante (la estándar no lleva)', () => {
    const standard = recorder()
    paintCardFace(standard.ctx, { ...FACE, variant: 'standard' }, 320)
    expect(standard.log.texts.some((text) => text.startsWith('HOLO') || text.startsWith('CARTA'))).toBe(false)
    expect(standard.log.fills).not.toContain('screen')
    const red = recorder()
    paintCardFace(red.ctx, { ...FACE, variant: 'red' }, 320)
    expect(red.log.texts).toContain('CARTA ROJA')
    expect(red.log.fills).not.toContain('screen')
    const sheet = recorder()
    paintFoilSheet(sheet.ctx, 'red', 320, 40)
    expect(sheet.log.fills).toEqual(['source-over'])
  })

  it('RF-GAME-07: el reverso sale del mismo modelo: número, dirección del perfil sin protocolo y fecha de alta', () => {
    const back = cardBack(FACE, 'https://battle.otherpeople.es/p/kairo.wav')
    const pending = recorder()
    paintCardBack(pending.ctx, back, 320)
    expect(pending.log.texts).toEqual(
      expect.arrayContaining(['#0042', 'battle.otherpeople.es/p/kairo.wav', 'EN LA BATALLA DESDE 03/2026']),
    )
    // Mientras llega el QR, su papel blanco y nada escrito en él.
    expect(pending.log.texts).not.toContain('QR NO DISPONIBLE')
    const failed = recorder()
    paintCardBack(failed.ctx, { ...back, qrFailed: true }, 320)
    expect(failed.log.texts).toContain('QR NO DISPONIBLE')
  })

  it('la lámina de la 3D cubre el retrato con su margen: la medida sale de la misma caja', () => {
    const box = cardArtBox(320)
    expect(box.h).toBe(Math.round(cardHeight(320) / 2))
    expect(box.x).toBeGreaterThan(0)
    expect(box.w).toBeCloseTo(320 - 2 * box.x)
  })
})

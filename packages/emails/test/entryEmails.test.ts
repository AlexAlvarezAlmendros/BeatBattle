import { describe, expect, it } from 'vitest'
import { renderEmail } from '../src'
import { ENTRY_WITHDRAWN_FIXTURE, entryChanged } from '../src/templates/entryChanged'
import { entryFailed, failureReason } from '../src/templates/entryFailed'
import { ENTRY_RECEIPT_FIXTURE, entryReceipt, loudnessLine, peakLine } from '../src/templates/entryReceipt'

const context = { publicUrl: 'https://battle.otherpeople.es', family: 'service' as const }
const NBSP = ' '
/** El texto plano con los espacios de no separación como espacios, para buscar frases. */
const plain = (text: string) => text.replaceAll(NBSP, ' ')

describe('entry.receipt (§2.12.1)', () => {
  it('RF-NOTIF-06: el recibo lleva número, alias, ficha, informe técnico, hora de Madrid, huella y onda', async () => {
    const email = await renderEmail(entryReceipt, ENTRY_RECEIPT_FIXTURE, context)
    const text = plain(email.text)
    for (const piece of [
      'BB-2026W41-0007',
      'TIGRE PÚRPURA',
      'Bruma en Gràcia',
      '2:31',
      'Archivo WAV · 58,4 MB',
      'Alias TIGRE PÚRPURA',
      '140 BPM',
      'La menor',
      '−9,2 LUFS: en la batalla sonará 4,8 dB más baja para igualarse al resto.',
      'Pico real: +0,4 dBTP. Tu master clipa',
      'Recibido 8 de octubre de 2026 a las 13:20:14 (Madrid)',
      'a1b2c3d4e5f6',
      'hasta el domingo 11 de octubre a las 20:00',
      'tu título no debe delatarte',
    ])
      expect(text, piece).toContain(piece)
    expect(email.html).toContain(`src="${ENTRY_RECEIPT_FIXTURE.waveformUrl?.replace('&', '&amp;')}"`)
    expect(email.html).toContain('alt="Forma de onda de «Bruma en Gràcia», 2:31"')
    expect(email.html).toContain(`href="${ENTRY_RECEIPT_FIXTURE.entryUrl}"`)
    expect(email.html).toContain(`href="${ENTRY_RECEIPT_FIXTURE.editUrl}"`)
    expect(email.subject).toBe('Ya estás en la batalla #41 · BB-2026W41-0007')
    expect(email.subject.length).toBeLessThanOrEqual(50)
  })

  it('RF-NOTIF-06: el aviso de clip salta por encima de −0,1 dBTP', () => {
    expect(peakLine(0.4)).toContain('Tu master clipa')
    expect(peakLine(-0.05)).toContain('Tu master clipa')
    expect(peakLine(-0.1)).toBe(`Pico real: −0,1${NBSP}dBTP. Sin clip.`)
    expect(peakLine(-1.234)).toBe(`Pico real: −1,2${NBSP}dBTP. Sin clip.`)
    expect(peakLine(null)).toBeNull()
  })

  it('RF-PLAY-03 (en el recibo): una pista más floja que −14 LUFS suena tal cual (solo se atenúa)', () => {
    expect(loudnessLine({ loudnessLufs: -16.4, gainDb: 0 })).toBe(
      `−16,4${NBSP}LUFS: en la batalla sonará tal cual (solo se bajan las que suenan más fuerte que −14 LUFS).`,
    )
    expect(loudnessLine({ loudnessLufs: null, gainDb: null })).toContain('silencio')
  })

  it('sin firma de imágenes, el recibo sale sin la onda (y sin imágenes rotas)', async () => {
    const email = await renderEmail(entryReceipt, { ...ENTRY_RECEIPT_FIXTURE, waveformUrl: null }, context)
    expect(email.html).not.toContain('/api/email/waveform/')
  })
})

describe('entry.failed (§2.12.1, §2.19)', () => {
  const failed = (code: string, details: Record<string, unknown> | null, reason = 'audio') =>
    failureReason({ code, details, reason })

  it('RF-NOTIF-06: el motivo con las mismas palabras que la interfaz', () => {
    expect(failed('DURATION_OUT_OF_RANGE', { durationMs: 252_000, limit: 'max' })).toBe(
      'Tu beat dura 4:12. El máximo son 4 minutos.',
    )
    expect(failed('DURATION_OUT_OF_RANGE', { durationMs: 21_400, limit: 'min' })).toBe(
      'Tu beat dura 0:21. El mínimo son 30 segundos.',
    )
    expect(failed('FILE_TOO_LARGE', { sizeBytes: 110 * 1024 * 1024 })).toBe(
      `Tu archivo pesa 110,0${NBSP}MB. El máximo son 100${NBSP}MB.`,
    )
    expect(failed('UNSUPPORTED_FORMAT', null)).toBe('Eso no suena a audio. Prueba con WAV, AIFF, FLAC o MP3.')
    expect(failed('ENTRY_ASSET_INVALID', { reason: 'undecodable' }, 'undecodable')).toContain(
      'No hemos podido leer el audio',
    )
    expect(failed('ENTRY_ASSET_INVALID', { reason: 'missing' }, 'missing')).toContain(
      'No encontramos el archivo',
    )
  })

  it('RF-NOTIF-06: el email dice el motivo y lleva a /subir con la ficha conservada', async () => {
    const email = await renderEmail(entryFailed, entryFailed.fixture, context)
    expect(email.text).toContain('Tu beat dura 4:12. El máximo son 4 minutos.')
    expect(email.text).toContain('La ficha que rellenaste sigue')
    expect(email.html).toContain('href="https://battle.otherpeople.es/subir"')
    expect(email.subject).toBe('Tu beat no ha entrado en la semana #41')
  })
})

describe('entry.changed (§2.12.1)', () => {
  it('sustituido: el recibo actualizado con el mismo número y la medición nueva', async () => {
    const email = await renderEmail(entryChanged, entryChanged.fixture, context)
    expect(email.subject).toBe('Audio sustituido · BB-2026W41-0007')
    expect(plain(email.text)).toContain('BB-2026W41-0007')
    expect(plain(email.text)).toContain('−13,1 LUFS: en la batalla sonará tal cual')
    expect(plain(email.text)).toContain('Pico real: −1,2 dBTP. Sin clip.')
  })

  it('retirada: confirma, anula el recibo y deja subir otro, sin decir cuántos votos tenía', async () => {
    const email = await renderEmail(entryChanged, ENTRY_WITHDRAWN_FIXTURE, context)
    expect(email.subject).toBe('Entrada retirada · BB-2026W41-0007')
    expect(email.text).toContain('queda anulado')
    expect(email.text).toContain('Los votos que había recibido se han perdido.')
    expect(email.text).not.toMatch(/\b3 votos?\b/)
    const none = await renderEmail(entryChanged, { ...ENTRY_WITHDRAWN_FIXTURE, votesLost: 0 }, context)
    expect(none.text).not.toContain('votos')
  })
})

describe('juego limpio en los emails de la entrada (§1.3, RF-PLAY-05)', () => {
  it('RNF-SEC-04: ningún email de la entrada lleva medias, recuentos, posiciones ni otras entradas', async () => {
    const emails = await Promise.all([
      renderEmail(entryReceipt, ENTRY_RECEIPT_FIXTURE, context),
      renderEmail(entryChanged, entryChanged.fixture, context),
      renderEmail(entryChanged, ENTRY_WITHDRAWN_FIXTURE, context),
      renderEmail(entryFailed, entryFailed.fixture, context),
    ])
    for (const { text, html } of emails) {
      expect(text).not.toMatch(/media|puntuaci|posici|puesto|estrellas|\d+ votos?|ranking|clasificaci/i)
      expect(html).not.toMatch(/userId|username/)
    }
  })
})

import { isServerErrorCode } from '@beatbattle/shared'
import { describe, expect, it } from 'vitest'
import { checkEntryFile, entryProblemMessage } from './entryFile'

const MB = 1024 * 1024
const nbsp = (text: string) => text.replaceAll(' ', ' ')

describe('checkEntryFile', () => {
  it('RF-ENT-03 (parcial: el navegador; la subida llega en la Fase 4): un MP3 de 5 min se rechaza antes de subir, con su duración y el máximo de 4 min', () => {
    const problem = checkEntryFile({ name: 'flip.mp3', size: 9 * MB }, 5 * 60_000)
    expect(problem?.code).toBe('DURATION_OUT_OF_RANGE')
    expect(nbsp(entryProblemMessage(problem!))).toBe('Tu beat dura 5:00. El máximo son 4 minutos.')
  })

  it('RF-ENT-03 (parcial: el navegador; la subida llega en la Fase 4): 4 min justos valen; un pelo más se rechaza y no se redondea a «4:00»', () => {
    expect(checkEntryFile({ name: 'flip.wav', size: 40 * MB }, 240_000)).toBeNull()
    const problem = checkEntryFile({ name: 'flip.wav', size: 40 * MB }, 240_400)
    expect(nbsp(entryProblemMessage(problem!))).toBe('Tu beat dura 4:01. El máximo son 4 minutos.')
  })

  it('RF-ENT-03 (parcial: el navegador; la subida llega en la Fase 4): demasiado corto, formato y tamaño, cada uno con su motivo', () => {
    const short = checkEntryFile({ name: 'flip.flac', size: MB }, 29_600)
    expect(nbsp(entryProblemMessage(short!))).toBe('Tu beat dura 0:29. El mínimo son 30 segundos.')
    const format = checkEntryFile({ name: 'flip.m4a', size: MB }, 60_000)
    expect(entryProblemMessage(format!)).toBe('Eso no suena a audio. Prueba con WAV, AIFF, FLAC o MP3.')
    const big = checkEntryFile({ name: 'flip.aif', size: 120.5 * MB }, 60_000)
    expect(nbsp(entryProblemMessage(big!))).toBe('Tu archivo pesa 120,5 MB. El máximo son 100 MB.')
  })

  it('cada motivo es un código de error del catálogo de la API (el servidor devuelve el mismo)', () => {
    for (const problem of [
      checkEntryFile({ name: 'a.ogg', size: 1 }, 60_000),
      checkEntryFile({ name: 'a.wav', size: 200 * MB }, 60_000),
      checkEntryFile({ name: 'a.wav', size: 1 }, 10 * 60_000),
    ]) {
      expect(isServerErrorCode(problem?.code)).toBe(true)
    }
  })
})

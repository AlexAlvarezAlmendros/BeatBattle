import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { collectErrors, open } from './support'

/**
 * Motor de análisis en el navegador (guía §4.6, `RF-ENT-06`; tarea 1.9): un WAV sintético de la batería
 * del sello pasa por el camino completo (decodificar, remuestrear a 22 050 Hz con `OfflineAudioContext`,
 * analizar en el worker) y da su BPM y su tonalidad. Sin worker, el mismo motor en el hilo principal da
 * exactamente lo mismo.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SYNTH = `/@fs${ROOT}/packages/audio/test/support/synthTracks.ts`
const CLIENT = '/src/audio/analysis/analyze.ts'

interface Summary {
  bpm: number
  key: string
  mode: string
  bpmConfidence: number
  keyConfidence: number
  stages: string[]
  last: number
}

test('RF-ENT-06: un WAV de House 128 en Fa menor da 128 BPM y Fa menor, en el worker y sin él', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await open(page, '/', 'Beat Battle')
  const results = await page.evaluate(
    async ([synthUrl, clientUrl]) => {
      const synth = await import(/* @vite-ignore */ synthUrl)
      const client = await import(/* @vite-ignore */ clientUrl)
      const pcm: Float32Array = synth.synthTrack({
        bpm: 128,
        keyPc: 5,
        mode: 'minor',
        pattern: 'fourFloor',
        seed: 11,
      })
      const sampleRate: number = synth.SR
      // WAV mono de 16 bits.
      const buffer = new ArrayBuffer(44 + pcm.length * 2)
      const view = new DataView(buffer)
      const text = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
      }
      text(0, 'RIFF')
      view.setUint32(4, 36 + pcm.length * 2, true)
      text(8, 'WAVE')
      text(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      text(36, 'data')
      view.setUint32(40, pcm.length * 2, true)
      for (let i = 0; i < pcm.length; i++)
        view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i] ?? 0)) * 32767, true)
      const file = new Blob([buffer], { type: 'audio/wav' })

      const run = async (withoutWorker: boolean) => {
        const stages: string[] = []
        let last = 0
        const r = await client.analyzeAudioFile(file, {
          withoutWorker,
          onProgress: ({ stage, pct }: { stage: string; pct: number }) => {
            if (stages.at(-1) !== stage) stages.push(stage)
            last = pct
          },
        })
        return {
          bpm: r.bpm,
          key: r.key,
          mode: r.mode,
          bpmConfidence: r.bpmConfidence,
          keyConfidence: r.keyConfidence,
          stages,
          last,
        }
      }
      return { worker: await run(false), main: await run(true) }
    },
    [SYNTH, CLIENT] as const,
  )
  const worker = results.worker as Summary
  expect(worker.bpm).toBe(128)
  expect(`${worker.key} ${worker.mode}`).toBe('F minor')
  expect(worker.bpmConfidence).toBeGreaterThanOrEqual(70)
  expect(worker.keyConfidence).toBeGreaterThanOrEqual(60)
  expect(worker.stages).toEqual(['decode', 'bpm', 'key', 'done'])
  expect(worker.last).toBe(100)
  const { stages: _a, last: _b, ...workerResult } = worker
  const { stages: _c, last: _d, ...mainResult } = results.main as Summary
  expect(mainResult).toEqual(workerResult)
  expect(errors).toEqual([])
})

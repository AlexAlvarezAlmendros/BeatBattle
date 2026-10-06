import { describe, expect, it } from 'vitest'
import { analyzeAudioData } from '../src/analysis/engine'
import { MODE_MAJOR, MODE_MINOR, type Mode, NOTE_NAMES, relativeKey } from '../src/analysis/musicTheory'
import { SR, type SynthOptions, synthNoise, synthTrack } from './support/synthTracks'

/**
 * Batería de validación del motor de análisis (guía §4.6, `RF-ENT-06`; tarea 1.9): la de
 * `ReactOtpWeb/frontend/scripts/validate-audio-engine.mjs`, con los mismos casos y las mismas tolerancias.
 * Pistas sintéticas multigénero (batería, bajo, acordes y arpegio, con humanización determinista) cuyo BPM
 * y tonalidad se conocen; el motor tiene que acertarlos.
 */

interface Case extends SynthOptions {
  name: string
  allowHalfTempo?: boolean
  allowRelative?: boolean
  allowBpmSet?: number[]
  skipConfCheck?: boolean
  expectCents?: number
}

const CASES: Case[] = [
  { name: 'House 128 · F menor', bpm: 128, keyPc: 5, mode: MODE_MINOR, pattern: 'fourFloor', seed: 11 },
  { name: 'Techno 140 · A menor', bpm: 140, keyPc: 9, mode: MODE_MINOR, pattern: 'fourFloor', seed: 22 },
  { name: 'Hip-hop 95 · G menor', bpm: 95, keyPc: 7, mode: MODE_MINOR, pattern: 'hiphop', seed: 33 },
  { name: 'Halftime 87.5 · C# menor', bpm: 87.5, keyPc: 1, mode: MODE_MINOR, pattern: 'hiphop', seed: 44 },
  {
    name: 'DnB 174 · F# menor',
    bpm: 174,
    keyPc: 6,
    mode: MODE_MINOR,
    pattern: 'breakbeat',
    seed: 55,
    allowHalfTempo: true,
  },
  { name: 'Dance 110 · Eb mayor', bpm: 110, keyPc: 3, mode: MODE_MAJOR, pattern: 'fourFloor', seed: 66 },
  { name: 'Breaks 150 · B menor', bpm: 150, keyPc: 11, mode: MODE_MINOR, pattern: 'breakbeat', seed: 77 },
  { name: 'Downtempo 70 · Bb mayor', bpm: 70, keyPc: 10, mode: MODE_MAJOR, pattern: 'hiphop', seed: 88 },
  {
    name: 'Axis loop 124 · A menor (relativa ok)',
    bpm: 124,
    keyPc: 9,
    mode: MODE_MINOR,
    pattern: 'fourFloor',
    progression: 'axisMinor',
    seed: 99,
    allowRelative: true,
  },
  {
    name: 'Detune +30c 122 · D menor',
    bpm: 122,
    keyPc: 2,
    mode: MODE_MINOR,
    pattern: 'fourFloor',
    detuneCents: 30,
    seed: 111,
    expectCents: 30,
  },
  {
    name: 'Detune −25c 133 · E mayor',
    bpm: 133,
    keyPc: 4,
    mode: MODE_MAJOR,
    pattern: 'fourFloor',
    detuneCents: -25,
    seed: 122,
    expectCents: -25,
  },
  {
    name: 'Trance 138 bajo en 8as · F menor',
    bpm: 138,
    keyPc: 5,
    mode: MODE_MINOR,
    pattern: 'fourFloor',
    bassEighths: true,
    seed: 133,
  },
  {
    name: 'Sin batería 90 · A mayor',
    bpm: 90,
    keyPc: 9,
    mode: MODE_MAJOR,
    noDrums: true,
    noBass: true,
    seed: 144,
    allowBpmSet: [90, 180],
    skipConfCheck: true,
  },
  {
    name: 'Intro 20s + House 126 · Ab menor',
    bpm: 126,
    keyPc: 8,
    mode: MODE_MINOR,
    pattern: 'fourFloor',
    introSec: 20,
    dur: 65,
    seed: 155,
  },
]

const noteName = (pitchClass: number) => NOTE_NAMES[pitchClass] as string

/** Las comprobaciones de `checkCase()` del sello, tal cual. */
function checkCase(c: Case, r: ReturnType<typeof analyzeAudioData>): string[] {
  const failures: string[] = []

  // BPM: el nivel métrico exacto (otros niveles, solo si el caso lo permite).
  const targets = c.allowBpmSet ?? [c.bpm]
  const bpmOk = targets.some((t) => Math.abs(r.bpm - t) <= 0.6)
  const halfOk = c.allowHalfTempo === true && Math.abs(r.bpm - c.bpm / 2) <= 0.4
  if (!bpmOk && !halfOk) failures.push(`bpm ${r.bpm} ≠ ${targets.join('/')}`)

  // Tonalidad: exacta, o la relativa cuando la progresión es de verdad ambigua.
  const expNote = noteName(c.keyPc)
  const keyExact = r.key === expNote && r.mode === c.mode
  let keyOk = keyExact
  if (!keyOk && c.allowRelative) {
    const rel = relativeKey(c.keyPc, c.mode as Mode)
    keyOk = r.key === noteName(rel.pitchClass) && r.mode === rel.mode
  }
  if (!keyOk) failures.push(`key ${r.key} ${r.mode} ≠ ${expNote} ${c.mode}`)

  if (c.expectCents !== undefined && Math.abs(r.tuningCents - c.expectCents) > 8) {
    failures.push(`tuning ${r.tuningCents}c ≠ ${c.expectCents}c`)
  }

  if (!c.skipConfCheck && bpmOk && r.bpmConfidence < 70) failures.push(`bpmConf baja: ${r.bpmConfidence}`)
  if (keyExact && r.keyConfidence < 60) failures.push(`keyConf baja: ${r.keyConfidence}`)

  return failures
}

describe('motor de análisis: batería del sello (§4.6, 1.9)', () => {
  for (const c of CASES) {
    it(`RF-ENT-06: ${c.name}`, () => {
      const pcm = synthTrack(c)
      const result = analyzeAudioData(pcm, SR, { duration: pcm.length / SR })
      expect(checkCase(c, result)).toEqual([])
    }, 60_000)
  }

  it('RF-ENT-06: ruido sin música (30 s) da confianzas bajas, sin inventarse un tempo ni una tonalidad', () => {
    const noise = analyzeAudioData(synthNoise(30), SR, {})
    expect(noise.bpmConfidence).toBeLessThan(60)
    expect(noise.keyConfidence).toBeLessThan(55)
  }, 60_000)

  it('RF-ENT-06: el silencio y los clips cortos dan errores tipados', () => {
    expect(() => analyzeAudioData(new Float32Array(SR * 10), SR, {})).toThrow('AUDIO_SILENT')
    expect(() => analyzeAudioData(new Float32Array(SR * 2).fill(0.1), SR, {})).toThrow('AUDIO_TOO_SHORT')
  })

  it('el progreso avanza por las fases y acaba en el 100 %', () => {
    const stages: string[] = []
    let last = 0
    let monotonic = true
    analyzeAudioData(synthTrack(CASES[0] as Case), SR, {
      onProgress: ({ stage, pct }) => {
        if (pct < last) monotonic = false
        last = pct
        if (stages.at(-1) !== stage) stages.push(stage)
      },
    })
    expect(stages).toEqual(['bpm', 'key', 'done'])
    expect(monotonic).toBe(true)
    expect(last).toBe(100)
  }, 60_000)
})

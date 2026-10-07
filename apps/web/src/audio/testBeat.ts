/**
 * Ritmo de prueba (tarea 1.6): bombo en cada negra, caja en 2 y 4 y charles a corcheas, generado por código
 * para medir la reactividad de la arena y los destellos con un beat a 160 BPM (`RNF-A11Y-04`). Solo lo usa
 * el banco del Escenario. Con semilla: el mismo ruido siempre.
 */
export function makeTestBeat(ctx: BaseAudioContext, bpm = 160, bars = 2): AudioBuffer {
  const rate = ctx.sampleRate
  const beat = 60 / bpm
  const beats = bars * 4
  const buffer = ctx.createBuffer(1, Math.round(beats * beat * rate), rate)
  const out = buffer.getChannelData(0)
  let state = 0x2545f491
  const noise = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) / 4294967296) * 2 - 1
  }
  const add = (start: number, seconds: number, sample: (t: number) => number) => {
    const from = Math.round(start * rate)
    const to = Math.min(out.length, from + Math.round(seconds * rate))
    for (let i = from; i < to; i++) out[i] = (out[i] ?? 0) + sample((i - from) / rate)
  }
  for (let n = 0; n < beats; n++) {
    const at = n * beat
    // Bombo: seno que cae de 110 a 45 Hz.
    let phase = 0
    add(at, 0.3, (t) => {
      phase += (2 * Math.PI * (45 + 65 * Math.exp(-t / 0.04))) / rate
      return 0.9 * Math.exp(-t / 0.12) * Math.sin(phase)
    })
    if (n % 2 === 1) add(at, 0.15, (t) => 0.35 * Math.exp(-t / 0.05) * noise())
    add(at + beat / 2, 0.04, (t) => 0.12 * Math.exp(-t / 0.012) * noise())
  }
  return buffer
}

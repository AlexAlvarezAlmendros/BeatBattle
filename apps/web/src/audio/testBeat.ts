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

/**
 * El ritmo de prueba como WAV estéreo de 16 bits (`seconds` segundos, en bucle), para el spike de
 * Cloudinary (tarea 1.7): un fichero real de varios trozos sin depender de tener uno a mano.
 */
export async function renderTestBeatWav(seconds = 60, sampleRate = 44_100, bpm = 160): Promise<Blob> {
  const length = Math.round(seconds * sampleRate)
  const offline = new OfflineAudioContext(2, length, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = makeTestBeat(offline, bpm)
  source.loop = true
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  const channels = [rendered.getChannelData(0), rendered.getChannelData(1)]
  const bytes = 44 + length * 4
  const view = new DataView(new ArrayBuffer(bytes))
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, bytes - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, length * 4, true)
  let at = 44
  for (let i = 0; i < length; i++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[i] ?? 0))
      view.setInt16(at, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      at += 2
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' })
}

/**
 * Bancos de ruido blanco, rosa y marrón para los efectos (guía §3.7, modelo de Orchard). Con semilla: el
 * mismo ruido en cada carga y en el render *offline* de las pruebas. Recibe el contexto por parámetro, así
 * funciona igual en tiempo real y en `OfflineAudioContext`.
 */
export interface NoiseBank {
  white: AudioBuffer
  pink: AudioBuffer
  brown: AudioBuffer
}

export function makeNoiseBank(ctx: BaseAudioContext, seconds = 3): NoiseBank {
  const length = Math.floor(ctx.sampleRate * seconds)
  let state = 0x9e3779b9
  const random = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) / 4294967296) * 2 - 1
  }
  const white = ctx.createBuffer(1, length, ctx.sampleRate)
  const pink = ctx.createBuffer(1, length, ctx.sampleRate)
  const brown = ctx.createBuffer(1, length, ctx.sampleRate)
  const w = white.getChannelData(0)
  const p = pink.getChannelData(0)
  const b = brown.getChannelData(0)
  // Rosa: filtro de Paul Kellet. Marrón: integración con fuga.
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  let last = 0
  for (let i = 0; i < length; i++) {
    const x = random()
    w[i] = x * 0.5
    b0 = 0.99886 * b0 + x * 0.0555179
    b1 = 0.99332 * b1 + x * 0.0750759
    b2 = 0.969 * b2 + x * 0.153852
    b3 = 0.8665 * b3 + x * 0.3104856
    b4 = 0.55 * b4 + x * 0.5329522
    b5 = -0.7616 * b5 - x * 0.016898
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.09
    b6 = x * 0.115926
    last = (last + 0.02 * x) / 1.02
    b[i] = last * 3.2
  }
  return { white, pink, brown }
}

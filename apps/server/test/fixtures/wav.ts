/**
 * WAV PCM de 16 bits con un seno, para medir sin ficheros en el repo. Un seno de 997 Hz de amplitud
 * 0,316 en los dos canales da −10 LUFS y −10 dBFS de pico (la referencia del spike 1.8).
 */
export function sineWav({
  seconds,
  frequency = 997,
  amplitude = 0.316,
  sampleRate = 48_000,
  channels = 2,
}: {
  seconds: number
  frequency?: number
  amplitude?: number
  sampleRate?: number
  channels?: number
}): Uint8Array {
  const frames = Math.round(seconds * sampleRate)
  const dataBytes = frames * channels * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * 2, 28)
  buffer.writeUInt16LE(channels * 2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < frames; i++) {
    const value = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * amplitude * 32767)
    for (let c = 0; c < channels; c++) buffer.writeInt16LE(value, 44 + (i * channels + c) * 2)
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

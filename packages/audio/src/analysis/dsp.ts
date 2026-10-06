/**
 * Primitivas de DSP del motor de análisis (guía §4.6, tarea 1.9). Port a TypeScript de
 * `ReactOtpWeb/frontend/src/utils/dsp.js` sin cambiar la lógica: código numérico puro, igual en el hilo
 * principal, en un worker o en Node.
 */

// ─── FFT (radix-2 iterativa, factores de giro en caché) ─────────────────────
const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array }>()

function getTwiddles(n: number) {
  let t = twiddleCache.get(n)
  if (t) return t
  const cos = new Float64Array(n >> 1)
  const sin = new Float64Array(n >> 1)
  for (let i = 0; i < n >> 1; i++) {
    const a = (-2 * Math.PI * i) / n
    cos[i] = Math.cos(a)
    sin[i] = Math.sin(a)
  }
  t = { cos, sin }
  twiddleCache.set(n, t)
  return t
}

/** FFT compleja en el sitio (`re`, `im` de longitud potencia de 2). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  const { cos, sin } = getTwiddles(n)

  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    while (j & bit) {
      j ^= bit
      bit >>= 1
    }
    j ^= bit
    if (i < j) {
      let tmp = re[i]!
      re[i] = re[j]!
      re[j] = tmp
      tmp = im[i]!
      im[i] = im[j]!
      im[j] = tmp
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const step = n / len
    for (let i = 0; i < n; i += len) {
      let kt = 0
      for (let k = 0; k < half; k++) {
        const c = cos[kt]!
        const s = sin[kt]!
        const tRe = c * re[i + k + half]! - s * im[i + k + half]!
        const tIm = c * im[i + k + half]! + s * re[i + k + half]!
        re[i + k + half] = re[i + k]! - tRe
        im[i + k + half] = im[i + k]! - tIm
        re[i + k] = re[i + k]! + tRe
        im[i + k] = im[i + k]! + tIm
        kt += step
      }
    }
  }
}

export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  return w
}

/**
 * Autocorrelación por FFT con compresión de magnitud (ACF generalizada, Tolonen y Karjalainen):
 * `exponent` 2 es la clásica; ~1 aplana la dinámica y aguanta mucho mejor con envolventes de ataques.
 * La entrada se rellena ×2 con ceros para evitar la vuelta circular.
 */
export function generalizedACF(x: ArrayLike<number>, exponent = 1): Float64Array {
  const n = x.length
  const size = nextPow2(2 * n)
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  re.set(x)
  fft(re, im)
  for (let i = 0; i < size; i++) {
    const mag = Math.sqrt(re[i]! * re[i]! + im[i]! * im[i]!)
    re[i] = mag ** exponent
    im[i] = 0
  }
  // El espectro comprimido es real y par: su DFT inversa es la directa entre N.
  fft(re, im)
  const acf = new Float64Array(n)
  const norm = re[0] || 1
  for (let i = 0; i < n; i++) acf[i] = re[i]! / norm
  return acf
}

/** FIR paso bajo de seno cardinal con ventana de Hamming, de fase cero (núcleo simétrico). */
export function lowpassFIR(x: ArrayLike<number>, cutoffNorm: number, taps = 21): Float32Array {
  const half = (taps - 1) / 2
  const kernel = new Float64Array(taps)
  let sum = 0
  for (let i = 0; i < taps; i++) {
    const m = i - half
    const sinc = m === 0 ? 2 * cutoffNorm : Math.sin(2 * Math.PI * cutoffNorm * m) / (Math.PI * m)
    const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1))
    kernel[i] = sinc * hamming
    sum += kernel[i]!
  }
  for (let i = 0; i < taps; i++) kernel[i] = kernel[i]! / sum

  const n = x.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let acc = 0
    for (let k = 0; k < taps; k++) {
      let idx = i + k - half
      if (idx < 0) idx = 0
      else if (idx >= n) idx = n - 1
      acc += x[idx]! * kernel[k]!
    }
    out[i] = acc
  }
  return out
}

/** Media móvil con sumas prefijas (O(n)). */
export function movingMean(x: ArrayLike<number>, halfWin: number): Float32Array {
  const n = x.length
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + x[i]!
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - halfWin)
    const hi = Math.min(n - 1, i + halfWin)
    out[i] = (prefix[hi + 1]! - prefix[lo]!) / (hi - lo + 1)
  }
  return out
}

/** Interpolación parabólica alrededor de un pico discreto → posición y valor fraccionarios. */
export function parabolicPeak(y: ArrayLike<number>, i: number): { pos: number; val: number } {
  if (i <= 0 || i >= y.length - 1) return { pos: i, val: y[i]! }
  const y1 = y[i - 1]!
  const y2 = y[i]!
  const y3 = y[i + 1]!
  const denom = y1 - 2 * y2 + y3
  if (Math.abs(denom) < 1e-12) return { pos: i, val: y2 }
  const off = (0.5 * (y1 - y3)) / denom
  if (Math.abs(off) > 1) return { pos: i, val: y2 }
  return { pos: i + off, val: y2 - 0.25 * (y1 - y3) * off }
}

/** Lectura con interpolación lineal de una señal muestreada en un índice fraccionario. */
export function sampleAt(x: ArrayLike<number>, pos: number): number {
  if (pos <= 0) return x[0]!
  const n = x.length
  if (pos >= n - 1) return x[n - 1]!
  const i0 = Math.floor(pos)
  const t = pos - i0
  return x[i0]! * (1 - t) + x[i0 + 1]! * t
}

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length
  let sA = 0
  let sB = 0
  for (let i = 0; i < n; i++) {
    sA += a[i]!
    sB += b[i]!
  }
  const mA = sA / n
  const mB = sB / n
  let num = 0
  let dA = 0
  let dB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i]! - mA
    const db = b[i]! - mB
    num += da * db
    dA += da * da
    dB += db * db
  }
  const den = Math.sqrt(dA * dB)
  return den > 0 ? num / den : 0
}

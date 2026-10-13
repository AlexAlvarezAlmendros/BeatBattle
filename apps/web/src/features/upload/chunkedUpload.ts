/**
 * Subida directa a Cloudinary **por trozos** (guía §4.7.4, `RF-STO-01`; spike de la tarea 1.7): trozos del
 * tamaño que da la firma (20 MB en las entradas; 6 MB por defecto) con `X-Unique-Upload-Id` y `Content-Range`, los campos firmados por el servidor en cada uno,
 * `XMLHttpRequest` para tener el progreso real y 3 intentos por trozo con espera exponencial. El audio
 * nunca pasa por la API.
 */

/** Tamaño de cada trozo (§4.7.4): 6 MB (Cloudinary pide ≥ 5 MB salvo el último). */
export const CHUNK_BYTES = 6 * 1024 * 1024

/** Intentos por trozo y espera antes del primer reintento (ms; se dobla en cada uno). */
const ATTEMPTS = 3
const FIRST_RETRY_MS = 1000

/** Los trozos de un fichero de `size` bytes: `[inicio, fin]` incluidos, como `Content-Range`. */
export function chunkRanges(size: number, chunk = CHUNK_BYTES): [number, number][] {
  if (!Number.isFinite(size) || size <= 0) return []
  const ranges: [number, number][] = []
  for (let start = 0; start < size; start += chunk) ranges.push([start, Math.min(size, start + chunk) - 1])
  return ranges
}

/** La cabecera `Content-Range` de un trozo. */
export const contentRange = ([start, end]: [number, number], size: number) => `bytes ${start}-${end}/${size}`

export interface ChunkedUploadOptions {
  file: Blob
  uploadUrl: string
  /** Campos firmados (y la firma) que devuelve el servidor. */
  fields: Record<string, string>
  /** Bytes enviados en total. */
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
  /** Tamaño de trozo que da el servidor con la firma (`chunkBytes`); por defecto, `CHUNK_BYTES`. */
  chunkBytes?: number
}

function sendChunk(
  url: string,
  body: FormData,
  headers: Record<string, string>,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => onProgress(event.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          resolve(null)
        }
      } else reject(new Error(`Cloudinary respondió ${xhr.status}: ${xhr.responseText.slice(0, 200)}`))
    }
    xhr.onerror = () => reject(new Error('Sin conexión con Cloudinary'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.onabort = () => reject(new DOMException('Subida cancelada', 'AbortError'))
    xhr.send(body)
  })
}

/** Sube el fichero por trozos y devuelve la respuesta de Cloudinary al último. */
export async function uploadInChunks({
  file,
  uploadUrl,
  fields,
  onProgress,
  signal,
  chunkBytes = CHUNK_BYTES,
}: ChunkedUploadOptions) {
  const total = file.size
  const uniqueId = crypto.randomUUID()
  let done = 0
  let last: unknown = null
  for (const range of chunkRanges(total, chunkBytes)) {
    const [start, end] = range
    for (let attempt = 1; ; attempt++) {
      const body = new FormData()
      for (const [name, value] of Object.entries(fields)) body.append(name, value)
      // Con el nombre del fichero: el trozo de un `Blob` saldría como «blob», sin extensión.
      body.append('file', file.slice(start, end + 1), file instanceof File ? file.name : 'blob')
      try {
        last = await sendChunk(
          uploadUrl,
          body,
          { 'X-Unique-Upload-Id': uniqueId, 'Content-Range': contentRange(range, total) },
          (loaded) => onProgress?.(done + Math.min(loaded, end - start + 1), total),
          signal,
        )
        break
      } catch (error) {
        if (signal?.aborted || attempt >= ATTEMPTS) throw error
        await new Promise((wait) => setTimeout(wait, FIRST_RETRY_MS * 2 ** (attempt - 1)))
      }
    }
    done = end + 1
    onProgress?.(done, total)
  }
  return last
}

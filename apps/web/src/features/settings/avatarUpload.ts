import {
  AVATAR_MAX_BYTES,
  AVATAR_MIMES,
  type OwnProfile,
  OwnProfileSchema,
  SignedUploadSchema,
} from '@beatbattle/shared'
import { ApiClientError, apiFetch } from '../../net/api'

/** Por qué no se puede subir una imagen, antes de pedir nada al servidor. */
export type AvatarProblem = 'type' | 'size'

export function avatarProblem(file: File): AvatarProblem | null {
  if (!(AVATAR_MIMES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > AVATAR_MAX_BYTES) return 'size'
  return null
}

/**
 * Sube un avatar (guía §4.8.2, tarea 2.19, `RF-PRF-02`): pide la firma, sube la imagen directa a
 * Cloudinary (nunca pasa por la API) y confirma el `public_id` que fijó el servidor. Devuelve el perfil con
 * la URL nueva. Un fallo de Cloudinary llega como `ApiClientError('UPLOAD_FAILED')`.
 */
export async function uploadAvatar(file: File, fetchImpl: typeof fetch = fetch): Promise<OwnProfile> {
  const signed = await apiFetch('/api/uploads/sign', {
    method: 'POST',
    body: { kind: 'avatar', mime: file.type, bytes: file.size },
    schema: SignedUploadSchema,
  })
  const form = new FormData()
  for (const [name, value] of Object.entries(signed.fields)) form.append(name, value)
  form.append('file', file)
  let res: Response
  try {
    res = await fetchImpl(signed.uploadUrl, { method: 'POST', body: form })
  } catch {
    throw new ApiClientError('NETWORK_ERROR', 0, 'No se ha podido subir la imagen.')
  }
  if (!res.ok) throw new ApiClientError('UPLOAD_FAILED', res.status, 'Cloudinary no ha aceptado la imagen.')
  return apiFetch('/api/me/avatar', {
    method: 'PUT',
    body: { publicId: signed.publicId },
    schema: OwnProfileSchema,
  })
}

export async function deleteAvatar(): Promise<OwnProfile> {
  return apiFetch('/api/me/avatar', { method: 'DELETE', schema: OwnProfileSchema })
}

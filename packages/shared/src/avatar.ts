/**
 * Avatar (tarea 2.19, `RF-PRF-02`): formatos y tamaño que se aceptan antes de firmar la subida, y el lado entregado
 * (§4.8.3). Aparte de `profile` para que `entries` (que los reutiliza en la portada propia) no dependa del perfil, que
 * depende de la capa de juego.
 */
export const AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024
/** Lado del avatar entregado (§4.8.3). */
export const AVATAR_SIZE = 256

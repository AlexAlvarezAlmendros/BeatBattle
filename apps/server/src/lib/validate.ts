import type { z } from 'zod'
import { validationFailed, zodIssues } from './errors'

/** Parte de la petición que se valida; da el prefijo de `path` en los detalles (`body.title`). */
export type InputPart = 'body' | 'query' | 'params' | 'headers'

/**
 * Valida una entrada con Zod en la frontera (guía §4.10). Si falla, lanza `VALIDATION_FAILED` (422)
 * con los problemas en `details`. Lanzar el `ZodError` tal cual también acaba en 422, pero sin el
 * prefijo que indica de dónde viene cada campo.
 */
export function validate<S extends z.ZodType>(schema: S, value: unknown, part?: InputPart): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) throw validationFailed(zodIssues(result.error, part))
  return result.data
}

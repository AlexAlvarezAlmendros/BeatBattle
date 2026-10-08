import { USERNAME_MAX, USERNAME_MIN, usernameProblem } from '@beatbattle/shared'
import { admin, haveIBeenPwned, username } from 'better-auth/plugins'

/**
 * La parte de la configuración de Better Auth (guía §4.9) que **define el esquema**: los plugins y el
 * rate limit en la base de datos. La comparten el servidor (`auth.ts`, tarea 2.4) y la CLI que genera
 * las tablas (`pnpm --filter @beatbattle/server auth:schema`), para que el esquema y lo que se ejecuta
 * nunca se separen. Versión fijada: better-auth 1.7.7 (y su CLI, `auth` 1.7.7).
 */

export const AUTH_BASE_PATH = '/api/auth'

export function authPlugins() {
  return [
    // `RF-AUTH-06`: se guarda en minúsculas (único sin distinguir mayúsculas) y `displayUsername`
    // conserva cómo lo escribió. El plugin solo mira el formato: los reservados los rechaza un hook de la
    // BD con su propio código, `USERNAME_RESERVED` (`auth.ts`).
    username({
      minUsernameLength: USERNAME_MIN,
      maxUsernameLength: USERNAME_MAX,
      usernameValidator: (name) => {
        const problem = usernameProblem(name)
        return problem === null || problem === 'USERNAME_RESERVED'
      },
    }),
    admin(),
    haveIBeenPwned(),
  ]
}

/** Lo que cambia las tablas: email y contraseña, los plugins y el rate limit guardado en la BD (§4.13). */
export function schemaOptions() {
  return {
    basePath: AUTH_BASE_PATH,
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: true, storage: 'database' as const },
    plugins: authPlugins(),
  }
}

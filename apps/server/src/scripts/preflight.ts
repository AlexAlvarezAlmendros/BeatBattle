/**
 * `pnpm --filter @beatbattle/server preflight`: comprueba las variables de producción antes de desplegar (plan
 * de la beta, B.4). Lee el entorno (con `.env.production` si existe, p. ej. de `vercel env pull`), no usa la red
 * y no enseña ningún valor. Sale con 1 si algo impide desplegar.
 */
import { preflight } from '../config/preflight'

const { problems, warnings } = preflight(process.env)
for (const issue of problems) console.log(`✗ ${issue.variable}: ${issue.message}`)
for (const issue of warnings) console.log(`! ${issue.variable}: ${issue.message}`)
console.log(
  problems.length === 0
    ? `Listo para desplegar${warnings.length ? ` (${warnings.length} avisos)` : ''}.`
    : `${problems.length} ${problems.length === 1 ? 'cosa impide' : 'cosas impiden'} desplegar.`,
)
process.exitCode = problems.length === 0 ? 0 : 1

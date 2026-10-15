import { EnvError, type EnvIssue, loadEnv } from './env'

/**
 * Comprobación de la configuración de producción antes de desplegar (plan de la beta, B.4; guía §4.15): lo que
 * valida el propio servidor al arrancar (`loadEnv` con `NODE_ENV=production`) y, además, lo que la beta necesita
 * aunque el servidor arranque sin ello (Turso, Cloudinary con el prefijo de producción, Gmail, los secretos del
 * cron, de las bajas y de la IP, y el proxy de Vercel). Sin red: solo mira las variables. Nunca enseña sus
 * valores.
 */
export interface PreflightResult {
  /** Lo que impide desplegar. */
  problems: EnvIssue[]
  /** Lo que conviene revisar (no bloquea). */
  warnings: EnvIssue[]
}

const has = (env: Readonly<Record<string, string | undefined>>, key: string) => Boolean(env[key]?.trim())

export function preflight(source: Readonly<Record<string, string | undefined>>): PreflightResult {
  const env: Readonly<Record<string, string | undefined>> = { ...source, NODE_ENV: 'production' }
  const problems: EnvIssue[] = []
  const warnings: EnvIssue[] = []
  try {
    loadEnv(env)
  } catch (error) {
    if (error instanceof EnvError) problems.push(...error.issues)
    else throw error
  }
  const need = (key: string, message: string) => {
    if (!has(env, key)) problems.push({ variable: key, message })
  }
  need('DATABASE_AUTH_TOKEN', 'el token de Turso (la base de datos de producción)')
  if (has(env, 'DATABASE_URL') && !env.DATABASE_URL?.startsWith('libsql://'))
    problems.push({ variable: 'DATABASE_URL', message: 'en producción, la de Turso (libsql://…)' })
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])
    need(key, 'Cloudinary: la cuenta de BeatBattle (audio e imágenes)')
  if (env.BB_CLOUDINARY_PREFIX !== 'beatbattle')
    problems.push({ variable: 'BB_CLOUDINARY_PREFIX', message: 'en producción, «beatbattle» (RF-STO-06)' })
  need('GMAIL_USER', 'la dirección de Gmail propia de BeatBattle')
  need('GMAIL_APP_PASSWORD', 'su contraseña de aplicación')
  need('MAIL_REPLY_TO', 'el buzón del sello que recibe las respuestas')
  need('CRON_SECRET', 'el secreto de /api/cron/tick (Vercel Cron y GitHub Actions)')
  need('UNSUBSCRIBE_SECRET', 'la clave de los enlaces de baja (RFC 8058)')
  need('IP_HASH_SALT', 'la sal del hash de IP (antiabuso)')
  if (env.TRUST_PROXY !== '1')
    problems.push({ variable: 'TRUST_PROXY', message: '1 en Vercel (la IP real llega en X-Forwarded-For)' })
  if (has(env, 'BB_PUBLIC_URL') && !env.BB_PUBLIC_URL?.startsWith('https://'))
    problems.push({ variable: 'BB_PUBLIC_URL', message: 'en producción, con https://' })
  if (has(env, 'BB_FAKE_STORAGE'))
    problems.push({ variable: 'BB_FAKE_STORAGE', message: 'vacía en producción' })
  if (has(env, 'SMTP_URL'))
    problems.push({ variable: 'SMTP_URL', message: 'vacía en producción (solo Mailpit en local)' })
  for (const [id, secret, name] of [
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'Google'],
    ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'Discord'],
  ] as const)
    if (!has(env, id) || !has(env, secret))
      warnings.push({
        variable: id,
        message: `sin entrada con ${name} (opcional; sin ella, solo email y contraseña)`,
      })
  if (env.EMAIL_FROM_ADDRESS && env.GMAIL_USER && env.EMAIL_FROM_ADDRESS !== env.GMAIL_USER)
    warnings.push({ variable: 'EMAIL_FROM_ADDRESS', message: 'distinta de GMAIL_USER (Gmail la reescribe)' })
  // Una sola entrada por variable, en el orden en que salen.
  const seen = new Set<string>()
  const unique = (list: EnvIssue[]) =>
    list.filter((issue) => {
      const key = `${issue.variable}|${issue.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return { problems: unique(problems), warnings: unique(warnings) }
}

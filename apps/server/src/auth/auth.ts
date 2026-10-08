import { SignupConsentsSchema, usernameProblem } from '@beatbattle/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api'
import { sql } from 'drizzle-orm'
import type { AppConfig } from '../config/env'
import type { Db } from '../db/client'
import * as schema from '../db/schema'
import { producerProfile } from '../db/schema'
import type { ServiceEmails } from '../email/service'
import { maskEmail } from '../email/unsubscribe'
import { ipHash } from '../lib/ipHash'
import { recordSignupConsents } from '../modules/emailPrefs/service'
import { isDisposableEmail } from './disposable'
import { schemaOptions } from './options'
import { describeUserAgent } from './userAgent'

/** Cabecera interna con la IP que ha resuelto Fastify (respeta `trustProxy`); la de fuera se borra. */
export const CLIENT_IP_HEADER = 'x-bb-client-ip'

/** Validez del enlace de verificación (24 h, §2.3) y de la recuperación (1 h, Anexo H). */
const VERIFY_EXPIRES_S = 60 * 60 * 24
const RESET_EXPIRES_S = 60 * 60

export interface AuthDeps {
  config: AppConfig
  db: Db
  emails: ServiceEmails
  now: () => number
  newId: () => string
}

/**
 * De qué dirección a cuál cambia el email, si el token de `/verify-email` es el de verificar la nueva (el
 * paso final del cambio). Solo se lee: la firma ya la ha comprobado Better Auth.
 */
function emailChangeOf(token: unknown): { from: string; to: string } | null {
  if (typeof token !== 'string') return null
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    if (payload.requestType !== 'change-email-verification') return null
    if (typeof payload.email !== 'string' || typeof payload.updateTo !== 'string') return null
    return { from: payload.email, to: payload.updateTo }
  } catch {
    return null
  }
}

const reject = (code: string, message: string) => new APIError('UNPROCESSABLE_ENTITY', { code, message })

/** El nombre visible de una cuenta en los emails: como lo escribió, o el nombre. */
const displayName = (user: { name: string; displayUsername?: string | null }) =>
  user.displayUsername || user.name

/**
 * Better Auth (guía §4.9, tarea 2.4): email y contraseña con verificación obligatoria, `username` con
 * reservados, `admin`, `haveIBeenPwned`, rate limit en la BD (§4.13) y cookies del host con prefijo `bb`.
 * Los emails salen por la cola de salida (§4.19.3) y en la misma petición.
 */
export function createAuth(deps: AuthDeps) {
  const { config, db } = deps
  const options = schemaOptions()
  return betterAuth({
    ...options,
    appName: 'Beat Battle',
    baseURL: config.publicUrl,
    secret: config.auth.secret,
    trustedOrigins: [...config.allowedOrigins],
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_EXPIRES_S,
      sendResetPassword: async ({ user, url }) => {
        await deps.emails.sendNow({
          kind: 'auth.reset',
          target: { userId: user.id },
          payload: { name: displayName(user), url },
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFY_EXPIRES_S,
      // A la dirección que dice Better Auth: al cambiar de email, la nueva (no la de la cuenta todavía).
      sendVerificationEmail: async ({ user, url }) => {
        await deps.emails.sendNow({
          kind: 'auth.verify',
          target: { address: user.email },
          payload: { name: displayName(user), url },
        })
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        // A la dirección actual, para aprobarlo; al aprobarlo, la nueva recibe su verificación (§2.3).
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await deps.emails.sendNow({
            kind: 'auth.change_email',
            target: { userId: user.id },
            payload: { name: displayName(user), newEmailMasked: maskEmail(newEmail), url },
          })
        },
      },
    },
    // Avisos de seguridad (`auth.security`): contraseña cambiada, sesiones cerradas y email cambiado.
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned
        // Better Auth redirige lanzando un `APIError` con 302 (`FOUND`): eso no es un fallo.
        const redirected =
          isAPIError(returned) && (returned.status === 'FOUND' || returned.statusCode === 302)
        if (isAPIError(returned) && !redirected) return
        if (ctx.path === '/sign-up/email') {
          // Las casillas del registro (§2.3): avisos y consentimientos, con su historial (`RF-NOTIF-16`).
          const created = (returned as { user?: { id?: string } } | null)?.user?.id
          const consents = SignupConsentsSchema.safeParse(
            (ctx.body as { consents?: unknown } | undefined)?.consents ?? {},
          )
          if (created && consents.success)
            await recordSignupConsents(db, created, consents.data, {
              now: deps.now(),
              ipHash: ipHash(ctx.headers?.get(CLIENT_IP_HEADER), config.auth.secret, deps.now()),
              newId: deps.newId,
            })
          return
        }
        if (ctx.path === '/verify-email') {
          // La verificación de la dirección nueva puede abrirse sin sesión (otro navegador): el token
          // (ya comprobado por Better Auth, que no ha devuelto error) dice de qué dirección a cuál.
          const change = emailChangeOf(ctx.query?.token)
          if (!change) return
          const [account] = await db
            .select()
            .from(schema.user)
            .where(sql`lower(${schema.user.email}) = ${change.to.toLowerCase()}`)
          if (!account) return
          const payload = {
            name: displayName(account),
            change: 'email',
            at: deps.now(),
            newEmailMasked: maskEmail(change.to),
            device: describeUserAgent(ctx.headers?.get('user-agent')),
          }
          await deps.emails.sendNow({ kind: 'auth.security', target: { address: change.from }, payload })
          await deps.emails.sendNow({ kind: 'auth.security', target: { userId: account.id }, payload })
          return
        }
        const session = ctx.context.session
        if (!session) return
        const change =
          ctx.path === '/change-password'
            ? 'password'
            : ctx.path === '/revoke-other-sessions'
              ? 'sessions_closed'
              : null
        if (!change) return
        await deps.emails.sendNow({
          kind: 'auth.security',
          target: { userId: session.user.id },
          payload: {
            name: displayName(session.user),
            change,
            at: deps.now(),
            device: describeUserAgent(ctx.headers?.get('user-agent')),
          },
        })
      }),
    },
    socialProviders: {
      ...(config.auth.google ? { google: config.auth.google } : {}),
      ...(config.auth.discord ? { discord: config.auth.discord } : {}),
    },
    account: { accountLinking: { enabled: true, trustedProviders: ['google', 'discord'] } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: {
      ...options.rateLimit,
      // §4.13: entrar 5/min, registrarse 3/h y recuperar 3/h, por IP.
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-in/username': { window: 60, max: 5 },
        '/sign-up/email': { window: 60 * 60, max: 3 },
        '/request-password-reset': { window: 60 * 60, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: config.auth.secureCookies,
      cookiePrefix: 'bb',
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // `RF-AUTH-09` y `RF-AUTH-06` (los reservados, con su propio código).
            if (isDisposableEmail(user.email))
              throw reject('EMAIL_DISPOSABLE', 'Ese dominio de email no se admite.')
            const name = (user as { username?: string | null }).username
            if (name && usernameProblem(name) === 'USERNAME_RESERVED')
              throw reject('USERNAME_RESERVED', 'Ese nombre está reservado.')
            return { data: user }
          },
          after: async (user) => {
            // Su carta de productor: el número es el orden de alta (el índice único evita repetirlo).
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                await db.insert(producerProfile).values({
                  userId: user.id,
                  cardNumber: sql`(select coalesce(max(${producerProfile.cardNumber}), 0) + 1 from ${producerProfile})`,
                  createdAt: deps.now(),
                })
                return
              } catch (error) {
                if (attempt === 4 || !/UNIQUE/i.test(String(error))) throw error
              }
            }
          },
        },
        update: {
          before: async (user) => {
            if (user.email && isDisposableEmail(user.email))
              throw reject('EMAIL_DISPOSABLE', 'Ese dominio de email no se admite.')
            const name = (user as { username?: string | null }).username
            if (name && usernameProblem(name) === 'USERNAME_RESERVED')
              throw reject('USERNAME_RESERVED', 'Ese nombre está reservado.')
            return { data: user }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>

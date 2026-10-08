import { usernameProblem } from '@beatbattle/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { sql } from 'drizzle-orm'
import type { AppConfig } from '../config/env'
import type { Db } from '../db/client'
import * as schema from '../db/schema'
import { producerProfile } from '../db/schema'
import type { ServiceEmails } from '../email/service'
import { isDisposableEmail } from './disposable'
import { schemaOptions } from './options'

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
      sendVerificationEmail: async ({ user, url }) => {
        await deps.emails.sendNow({
          kind: 'auth.verify',
          target: { userId: user.id },
          payload: { name: displayName(user), url },
        })
      },
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

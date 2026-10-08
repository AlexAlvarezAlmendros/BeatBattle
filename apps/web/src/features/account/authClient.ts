import { adminClient, usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/**
 * Cliente de Better Auth (guía §4.9) con `usernameClient` y `adminClient`. Solo lo importan las pantallas de
 * cuenta (su trozo diferido): la sesión del HUD sale de `GET /api/me` (`session.ts`).
 */
export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin,
  basePath: '/api/auth',
  plugins: [usernameClient(), adminClient()],
})

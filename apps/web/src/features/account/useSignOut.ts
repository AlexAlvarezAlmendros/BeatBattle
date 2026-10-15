import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { authClient } from './authClient'
import { useSession } from './session'

/**
 * Salir (guía §2.3, `RF-AUTH-11`): cierra la sesión de este navegador en el servidor (Better Auth la revoca y
 * borra la cookie), vacía la caché con los datos de la cuenta y vuelve al menú como visitante. Las demás
 * sesiones siguen abiertas. Si falla, la sesión sigue como estaba y se dice.
 */
export function useSignOut() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const clear = useSession((state) => state.clear)
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  const signOut = async () => {
    setState('busy')
    try {
      const result = await authClient.signOut()
      if (result.error) throw new Error(result.error.message ?? 'sign-out')
    } catch {
      setState('failed')
      return
    }
    clear()
    client.clear()
    navigate(paths.home())
  }

  return { signOut, busy: state === 'busy', failed: state === 'failed' }
}

import { test as setup } from '@playwright/test'
import { open, openGallery } from './support'

/**
 * Proyecto previo a los E2E: calienta el servidor de Vite. En frío, Vite transforma cada módulo la
 * primera vez que se pide, y con todos los workers pidiendo la galería a la vez su cuerpo diferido
 * tardaba ~30 s en llegar. Una carga de la home, del menú de muestra y de la galería deja todo
 * transformado.
 */
setup('calienta el servidor de Vite (home, menú de muestra y galería)', async ({ page }) => {
  setup.setTimeout(120_000)
  await open(page, '/', 'Beat Battle')
  await open(page, '/dev/menu', 'Beat Battle')
  await open(page, '/como-funciona', 'Cómo se juega')
  await openGallery(page, 100_000)
})

/**
 * La cuenta de `/p/aina` (tarea 2.18): el perfil público existe desde el alta, sin verificar. La API de los
 * E2E arranca con la BD vacía, así que se crea aquí una vez (el registro admite 3 por hora y por IP).
 */
setup('crea la cuenta de aina para su perfil público', async ({ page, baseURL }) => {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: baseURL as string },
    data: {
      email: 'aina@example.com',
      password: 'lluvia en gràcia 92',
      name: 'aina',
      username: 'aina',
      callbackURL: '/verificar',
    },
  })
  if (!res.ok() && res.status() !== 422)
    throw new Error(`registro de aina: ${res.status()} ${await res.text()}`)
})

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

import { test as setup } from '@playwright/test'
import { open, openGallery } from './support'

/**
 * Proyecto previo a los E2E: calienta el servidor de Vite. En frío, Vite transforma cada módulo la
 * primera vez que se pide, y con todos los workers pidiendo la galería a la vez su cuerpo diferido
 * tardaba ~30 s en llegar. Una sola carga de la home y de la galería deja todo transformado.
 */
setup('calienta el servidor de Vite (home y galería)', async ({ page }) => {
  setup.setTimeout(120_000)
  await open(page, '/', 'Beat Battle')
  await openGallery(page, 100_000)
})

import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * E2E con Playwright (tarea 0.13, guía §4.16): recorridos, accesibilidad con axe y movimiento
 * reducido contra la web en desarrollo (la galería `/dev/galeria` solo existe ahí) y la API local.
 *
 * - En local, el Chrome del sistema con la GPU real (Vulkan sobre la iGPU, como Orchard y `tools/shot`);
 *   con `PW_SOFTWARE=1`, el mismo Chrome sin esos ajustes de GPU (render por software, como en CI).
 * - En CI (`CI=1`), el Chromium de Playwright (`pnpm exec playwright install --with-deps chromium`).
 * - `PW_PORT` y `PW_API_PORT` cambian los puertos para no chocar con `pnpm dev:all` (5173 y 3000).
 */
const ci = !!process.env.CI
const software = !!process.env.PW_SOFTWARE
const port = Number(process.env.PW_PORT ?? 5174)
const apiPort = Number(process.env.PW_API_PORT ?? 3101)
const webOrigin = `http://localhost:${port}`
const apiOrigin = `http://127.0.0.1:${apiPort}`
/** BD temporal nueva en cada ejecución: ningún E2E depende de datos de una ejecución anterior. */
const db = join(tmpdir(), `beatbattle-e2e-${Date.now()}.db`)
// Se borra al salir. Los workers también evalúan este fichero, pero su ruta no existe: no borran nada.
process.once('exit', () => rmSync(db, { force: true }))

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // en CI la CPU es modesta y el render va por software: las esperas de la interfaz necesitan margen
  expect: { timeout: ci ? 15_000 : 5_000 },
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['list']] : 'list',
  use: {
    baseURL: webOrigin,
    viewport: { width: 1440, height: 900 },
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: ci ? 'on-first-retry' : 'retain-on-failure',
    ...(ci
      ? {}
      : software
        ? { channel: 'chrome' }
        : {
            channel: 'chrome',
            launchOptions: {
              args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
            },
          }),
  },
  projects: [
    { name: 'warmup', testMatch: /\.setup\.ts$/ },
    { name: 'e2e', testIgnore: /\.setup\.ts$/, dependencies: ['warmup'] },
  ],
  webServer: [
    {
      // Vite en desarrollo, con el proxy de `/api` apuntando a la API de abajo (`BB_API`).
      command: `pnpm --filter @beatbattle/web exec vite --port ${port} --strictPort`,
      url: webOrigin,
      // Nunca se reutiliza un servidor que ya escuche en el puerto: podría ser el de otro proyecto (Orchard
      // usa los mismos por defecto) o uno con el proxy hacia otra API. Si está ocupado, falla y lo dice.
      reuseExistingServer: false,
      timeout: 60_000,
      env: { BB_API: apiOrigin },
    },
    {
      // API con BD temporal (se migra al arrancar) y el reloj de prueba disponible para los E2E.
      command: 'pnpm --filter @beatbattle/server start',
      url: `${apiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(apiPort),
        DATABASE_URL: `file:${db}`,
        BB_PUBLIC_URL: webOrigin,
        ALLOWED_ORIGINS: webOrigin,
        BB_TEST_CLOCK: '1',
        LOG_LEVEL: 'warn',
      },
    },
  ],
})

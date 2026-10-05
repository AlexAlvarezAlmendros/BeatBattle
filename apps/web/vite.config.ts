import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { routePreload } from './src/app/routePreload.ts'
import { fontPreload } from './src/styles/fontPreload.ts'

/** API a la que el proxy de desarrollo reenvía `/api` (mismo origen, como en producción). */
const apiTarget = process.env.BB_API ?? 'http://127.0.0.1:3000'

/**
 * Grupo de proveedores para `codeSplitting.groups` de rolldown: los módulos de esos paquetes de
 * `node_modules` que forman parte del JS inicial (`$initial`: importados de forma estática desde la
 * entrada). Lo que solo usan los trozos diferidos se queda en esos trozos y no engorda la primera carga:
 * hoy, Motion entero (la parte animada de los avisos y la ventana de juego).
 */
function vendor(name: string, packages: readonly string[]) {
  return {
    name,
    test: new RegExp(`[\\\\/]node_modules[\\\\/](?:${packages.join('|')})[\\\\/]`),
    tags: ['$initial' as const],
  }
}

/*
 * Troceado del JS inicial (guía §4.7.1 y §4.17). Sin grupos, rolldown dejaba los proveedores en un
 * solo trozo de entrada de más de 500 kB y la build avisaba. Dos grupos con sentido:
 *
 * - `framework`: React, React DOM, Scheduler y React Router: lo que pinta cualquier página. Motion sigue
 *   en la lista por si una pieza de la primera pintura volviera a importarlo, pero desde que el pulsado
 *   del `Button` es CSS (2026-10-03) ningún módulo inicial lo usa y se queda en los trozos diferidos de
 *   los avisos y la ventana (`ToastList`, `toastMotion`). 314,36 kB (99,33 kB gz).
 * - `data`: TanStack Query, Zustand y Zod (estado, datos y contratos de la API). 109,86 kB (31,19 kB gz).
 *
 * El código de la app se queda en la entrada (41,64 kB, con el `Button` dentro) y rolldown trocea solo
 * el resto (i18n, su runtime, las páginas y las partes diferidas). Los dos grupos cambian poco entre
 * versiones de la app, así que la caché del navegador también lo agradece.
 *
 * Medido con `pnpm build` (gzip de Vite). «JS inicial» es la entrada con sus importaciones estáticas;
 * «1.ª pintura», lo que se descarga para pintar la home: además, la página y sus piezas (la precarga de
 * `routePreload`).
 *
 * | Troceado (fecha)                                            | JS inicial (gz) | 1.ª pintura (gz) | Mayor trozo |
 * |-------------------------------------------------------------|-----------------|------------------|-------------|
 * | Sin grupos (Fase 0, sello)                                  | 175,79 kB       | 184,95 kB        | 528,92 kB   |
 * | `framework` + `data` (Fase 0, sello: Motion en el marco)    | 175,42 kB       | 184,62 kB        | 397,69 kB   |
 * | `framework` + `data` (arena, Motion por el `Button`)        | 179,39 kB       | 192,58 kB        | 371,32 kB   |
 * | `framework` + `data` (arena, pulsado por CSS: **este**)     | 158,62 kB       | 171,81 kB        | 314,36 kB   |
 *
 * En la Fase 0 se midieron también partir Motion o los datos en más grupos: cada trozo de más es un
 * gzip aparte y más enlaces entre trozos, y la primera pintura crecía.
 *
 * **El Escenario** (tarea 1.1) es un trozo diferido aparte, `Stage`: three + React Three Fiber (R3F
 * importa three entero) y el *shader* de la arena. 916,16 kB (243,81 kB gz), dentro del presupuesto de
 * §4.17 (< 250 kB gz), y se pide después de la primera pintura (`RNF-PERF-04`). Por él el aviso pasa de
 * 500 a 950 kB: ningún otro trozo pasa de 315 kB, y si alguno se acerca a 500, hay que mirarlo igual.
 */
export default defineConfig({
  plugins: [react(), fontPreload(), routePreload()],
  server: { port: 5173, proxy: { '/api': { target: apiTarget } } },
  build: {
    target: 'es2023',
    chunkSizeWarningLimit: 950,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            vendor('framework', [
              'react',
              'react-dom',
              'scheduler',
              'react-router',
              'motion',
              'framer-motion',
              'motion-dom',
              'motion-utils',
            ]),
            vendor('data', ['@tanstack[\\\\/][^\\\\/]+', 'zustand', 'zod']),
          ],
        },
      },
    },
  },
})

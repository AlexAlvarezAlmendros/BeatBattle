import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fontPreload } from './src/styles/fontPreload.ts'

/** API a la que el proxy de desarrollo reenvía `/api` (mismo origen, como en producción). */
const apiTarget = process.env.BB_API ?? 'http://127.0.0.1:3000'

/**
 * Grupo de proveedores para `codeSplitting.groups` de rolldown: los módulos de esos paquetes de
 * `node_modules` que forman parte del JS inicial (`$initial`: importados de forma estática desde la
 * entrada). Lo que solo usan los trozos diferidos (el `animate` de Motion del `Button`, las funciones
 * con `layout` de los avisos) se queda en esos trozos y no engorda la primera carga.
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
 * solo trozo de entrada de 528,92 kB (166,35 kB gz) y la build avisaba de que pasaba de 500 kB. Dos
 * grupos con sentido:
 *
 * - `framework`: React, React DOM, React Router y la parte de Motion que usa el marco (menú móvil,
 *   entrada del hero): lo que pinta cualquier página. 397,69 kB (128,12 kB gz).
 * - `data`: TanStack Query, Zustand y Zod (estado, datos y contratos de la API). 109,86 kB (31,19 kB gz).
 *
 * El código de la app se queda en la entrada (29,61 kB) y rolldown trocea solo el resto (i18n, su
 * runtime, las páginas y las partes diferidas). Los dos grupos cambian poco entre versiones de la
 * app, así que la caché del navegador también lo agradece.
 *
 * Medido con `pnpm build` (gzip de Vite). «Primera pintura» es el JS que se descarga para pintar la
 * home: la entrada con sus importaciones estáticas, más la página y su botón.
 *
 * | Troceado                                         | JS inicial (gz) | 1.ª pintura (gz) | Mayor trozo |
 * |--------------------------------------------------|-----------------|------------------|-------------|
 * | Sin grupos (antes)                               | 175,79 kB       | 184,95 kB        | 528,92 kB   |
 * | `framework` + `data` (este)                      | 175,42 kB       | 184,62 kB        | 397,69 kB   |
 * | React y Router · Motion · datos                  | 175,80 kB       | 185,01 kB        | 314,34 kB   |
 * | React · Router · Motion · Query y Zustand · Zod  | 176,73 kB       | 185,96 kB        | 218,84 kB   |
 * | `framework` con Query y Zustand · Zod            | 175,32 kB       | 184,52 kB        | 422,92 kB   |
 *
 * Cada trozo de más es un gzip aparte y más enlaces entre trozos: separar Motion o partir los datos
 * hace crecer la primera pintura. El último pesa 0,1 kB menos, pero deja el trozo grande a 77 kB del
 * aviso de 500 kB; este deja 100 kB de margen. El aviso se queda en 500 kB a propósito: si un grupo
 * vuelve a pasar de ahí, hay que mirarlo.
 */
export default defineConfig({
  plugins: [react(), fontPreload()],
  server: { port: 5173, proxy: { '/api': { target: apiTarget } } },
  build: {
    target: 'es2023',
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

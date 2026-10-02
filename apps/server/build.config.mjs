/**
 * Empaquetado de la API para la función de Vercel (`pnpm build` → `dist/vercel.mjs`).
 *
 * El código del servidor y de los paquetes del monorepo es TypeScript con imports relativos sin
 * extensión (`'./app'`) y `@beatbattle/shared` exporta su fuente (`./src/index.ts`): `tsx` y Vitest lo
 * resuelven, pero Node por sí solo no lo carga (`ERR_MODULE_NOT_FOUND`), y no hay que fiarlo a lo que
 * haga el compilador de Vercel con cada fichero. Aquí sale un ESM autocontenido para Node 22: el código
 * de la API y los `@beatbattle/*` van dentro; las dependencias de `node_modules` (Fastify, libSQL,
 * Drizzle, Zod) quedan fuera, como imports normales que Node y el trazador de Vercel resuelven desde
 * `apps/server`. `smoke.mjs` lo carga con `node` puro y comprueba `/api/health`.
 *
 * Es la configuración de Vite (`vite build --config build.config.mjs`), sin importar `vite`: el paquete
 * del servidor no lo tiene como dependencia propia.
 */
export default {
  logLevel: 'warn',
  build: {
    ssr: 'src/vercel.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      output: { format: 'es', entryFileNames: '[name].mjs' },
    },
  },
  ssr: {
    target: 'node',
    // Los paquetes del monorepo exportan su fuente TypeScript: dentro del paquete.
    noExternal: [/^@beatbattle\//],
  },
}

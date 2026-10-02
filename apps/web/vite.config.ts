import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** API a la que el proxy de desarrollo reenvía `/api` (mismo origen, como en producción). */
const apiTarget = process.env.BB_API ?? 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: apiTarget } } },
  build: { target: 'es2023' },
})

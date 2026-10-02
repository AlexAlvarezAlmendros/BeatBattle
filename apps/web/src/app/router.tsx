import { createBrowserRouter } from 'react-router'
import { routes } from './routes'

/** Router de la app (guía §2.18). Las rutas viven en `routes.tsx` para poder probarlas en memoria. */
export const router = createBrowserRouter(routes)

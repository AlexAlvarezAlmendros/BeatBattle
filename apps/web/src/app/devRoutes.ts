import type { RouteObject } from 'react-router'

/**
 * Rutas que solo existen en desarrollo. En la construcción de producción `import.meta.env.DEV` es
 * `false`, la rama se elimina y la galería ni siquiera llega al bundle (se comprueba en `dist`).
 */
export const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/galeria',
        lazy: async () => ({ Component: (await import('../dev/gallery/GalleryPage')).GalleryPage }),
      },
    ]
  : []

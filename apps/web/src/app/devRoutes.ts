import type { RouteObject } from 'react-router'
import { simpleScreen } from './layout/screen'

/**
 * Rutas que solo existen en desarrollo. En la construcción de producción `import.meta.env.DEV` es
 * `false`, la rama se elimina y la galería ni siquiera llega al bundle (se comprueba en `dist`).
 */
export const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/galeria',
        handle: {
          access: 'public',
          screen: simpleScreen({ kicker: 'frame.plates.dev', title: 'dev.gallery.title' }, ['back', 'sound']),
        },
        lazy: async () => ({ Component: (await import('../ui/gallery/GalleryPage')).GalleryPage }),
      },
    ]
  : []

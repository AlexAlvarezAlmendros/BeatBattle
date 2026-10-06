import type { RouteObject } from 'react-router'
import { MENU_SCREEN, simpleScreen } from './layout/screen'

/**
 * Rutas que solo existen en desarrollo: la galería y el menú con datos de muestra. En la construcción
 * de producción `import.meta.env.DEV` es `false`, la rama se elimina y ni siquiera llegan al bundle (se
 * comprueba en `dist`).
 */
export const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/galeria',
        handle: {
          access: 'public',
          // Sin rayos: la galería es texto sobre negro de arriba abajo (`RD-VIS-05`). Con bucles (los
          // barridos del esqueleto, los cargadores de onda, el latido del reloj): la barra lleva el botón
          // «Pausar las animaciones» (§3.6, WCAG 2.2.2).
          screen: {
            ...simpleScreen({ kicker: 'frame.plates.dev', title: 'dev.gallery.title' }, ['back', 'sound']),
            rays: false,
            loops: true,
          },
        },
        lazy: async () => ({ Component: (await import('../ui/gallery/GalleryPage')).GalleryPage }),
      },
      {
        // Banco del Escenario (1.3, 1.11): el vinilo-sol como vista anclada y las ráfagas de partículas.
        // Cuña a la derecha, como el menú; la izquierda queda abierta para el vinilo y las ráfagas.
        path: 'dev/escenario',
        handle: {
          access: 'public',
          screen: {
            wedge: 'right',
            keys: ['back', 'sound'],
            plate: { kicker: 'frame.plates.dev', title: 'dev.stage.title' },
            simple: true,
            loops: true,
          },
        },
        lazy: async () => ({ Component: (await import('../ui/gallery/StageBenchPage')).StageBenchPage }),
      },
      {
        // El menú principal con los datos de muestra de las maquetas (0.24), para compararlo con ellas.
        path: 'dev/menu',
        handle: { access: 'public', screen: MENU_SCREEN },
        lazy: async () => ({
          Component: (await import('../features/week/menu/DevMenuPage')).DevMenuPage,
        }),
      },
    ]
  : []

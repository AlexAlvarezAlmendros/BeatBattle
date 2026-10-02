import { createBrowserRouter } from 'react-router'

/** Rutas de la app (guía §2.18). La tarea 0.10 las completa con todas las páginas. */
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <main>
        <h1>Beat Battle</h1>
      </main>
    ),
  },
])

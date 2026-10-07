import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

beforeEach(() => {
  // Sin la pantalla de título (§3.8.1, 1.13): taparía el menú en sus pruebas. Las suyas la encienden.
  try {
    localStorage.setItem('bb:title', 'off')
  } catch {
    // Sin almacenamiento en el entorno de la prueba: no hay pantalla de título que apagar.
  }
})

afterEach(() => {
  cleanup()
})

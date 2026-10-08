import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Las plantillas se compilan con la configuración de quien las importa (el servidor con `tsx`, Vite,
 * Vitest…). Fuera de este paquete, `tsx` las compilaba con el JSX clásico (`React.createElement`) y
 * fallaban con «React is not defined» al enviar. Cada `.tsx` lleva su pragma para que el runtime
 * automático no dependa de nadie.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    return statSync(file).isDirectory() ? tsxFiles(file) : file.endsWith('.tsx') ? [file] : []
  })
}

describe('JSX de las plantillas', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const files = [...tsxFiles(path.join(root, 'src')), ...tsxFiles(path.join(root, 'preview'))]
  it('cada .tsx declara el runtime automático de React', () => {
    expect(files.length).toBeGreaterThan(5)
    for (const file of files)
      expect(readFileSync(file, 'utf8'), file).toMatch(
        /^\/\*\* @jsxRuntime automatic \*\/\n\/\*\* @jsxImportSource react \*\//,
      )
  })
})

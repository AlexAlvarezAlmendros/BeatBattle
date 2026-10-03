import { describe, expect, it } from 'vitest'
import {
  activatesNatively,
  clampIndex,
  gridNavigation,
  isCharacterKey,
  isEditableTarget,
  listNavigation,
  normalizeForTypeahead,
  typeaheadMatch,
  wrapIndex,
} from './roving'

describe('foco itinerante: lógica pura (§3.3, RD-MOT-05)', () => {
  it('wrapIndex y clampIndex', () => {
    expect(wrapIndex(-1, 6)).toBe(5)
    expect(wrapIndex(6, 6)).toBe(0)
    expect(wrapIndex(13, 6)).toBe(1)
    expect(clampIndex(-3, 6)).toBe(0)
    expect(clampIndex(9, 6)).toBe(5)
    expect(wrapIndex(2, 0)).toBe(0)
  })

  it('RD-MOT-05: lista vertical en bucle, Inicio y Fin; las otras teclas no navegan', () => {
    expect(listNavigation('ArrowDown', 5, 6)).toBe(0)
    expect(listNavigation('ArrowUp', 0, 6)).toBe(5)
    expect(listNavigation('ArrowDown', 2, 6)).toBe(3)
    expect(listNavigation('Home', 4, 6)).toBe(0)
    expect(listNavigation('End', 1, 6)).toBe(5)
    expect(listNavigation('ArrowRight', 1, 6)).toBeNull()
    expect(listNavigation('Enter', 1, 6)).toBeNull()
    expect(listNavigation('ArrowDown', 5, 6, { loop: false })).toBe(5)
    expect(listNavigation('ArrowRight', 1, 3, { orientation: 'horizontal' })).toBe(2)
    expect(listNavigation('ArrowLeft', 0, 3, { orientation: 'horizontal' })).toBe(2)
    expect(listNavigation('ArrowDown', 0, 0)).toBeNull()
  })

  it('RD-MOT-05: rejilla de 6 × 4 con 23 casillas: ←/→ en orden de lectura y en bucle', () => {
    expect(gridNavigation('ArrowRight', 5, 23, 6)).toBe(6)
    expect(gridNavigation('ArrowRight', 22, 23, 6)).toBe(0)
    expect(gridNavigation('ArrowLeft', 0, 23, 6)).toBe(22)
  })

  it('RD-MOT-05: ↑/↓ cambian de fila conservando la columna, en bucle y sin salirse de la última fila incompleta', () => {
    expect(gridNavigation('ArrowDown', 2, 23, 6)).toBe(8)
    // Última fila (18–22): de la columna 2 baja a la primera fila, misma columna.
    expect(gridNavigation('ArrowDown', 20, 23, 6)).toBe(2)
    // Columna 5 en la fila 3 (17): abajo no hay casilla 23 → vuelve arriba a la 5.
    expect(gridNavigation('ArrowDown', 17, 23, 6)).toBe(5)
    // Arriba desde la primera fila: a la última fila que tiene esa columna.
    expect(gridNavigation('ArrowUp', 2, 23, 6)).toBe(20)
    expect(gridNavigation('ArrowUp', 5, 23, 6)).toBe(17)
    expect(gridNavigation('ArrowDown', 20, 23, 6, { loop: false })).toBe(20)
  })

  it('RD-MOT-05: Inicio, Fin, RePág y AvPág (cuatro filas, sin dar la vuelta)', () => {
    expect(gridNavigation('Home', 14, 23, 6)).toBe(0)
    expect(gridNavigation('End', 3, 23, 6)).toBe(22)
    expect(gridNavigation('PageDown', 1, 40, 6)).toBe(25)
    expect(gridNavigation('PageDown', 20, 40, 6)).toBe(38)
    expect(gridNavigation('PageDown', 23, 40, 6)).toBe(35)
    expect(gridNavigation('PageUp', 30, 40, 6)).toBe(6)
    expect(gridNavigation('PageUp', 10, 40, 6)).toBe(4)
    expect(gridNavigation('Tab', 10, 40, 6)).toBeNull()
  })

  it('RD-MOT-05: letra inicial sin mayúsculas ni acentos, desde la opción actual y dando la vuelta', () => {
    const modes = ['Jugar', 'Jurado', 'Resultados', 'Salón de la fama', 'Cómo se juega', 'Ajustes']
    expect(typeaheadMatch(modes, 0, 'j')).toBe(1)
    expect(typeaheadMatch(modes, 1, 'J')).toBe(0)
    expect(typeaheadMatch(modes, 0, 's')).toBe(3)
    expect(typeaheadMatch(modes, 0, 'c')).toBe(4)
    expect(typeaheadMatch(modes, 4, 'á')).toBe(5)
    expect(typeaheadMatch(modes, 0, 'm')).toBeNull()
    expect(normalizeForTypeahead('  Salón ')).toBe('salon')
  })

  it('teclas de carácter, campos de texto y elementos que activan solos', () => {
    expect(isCharacterKey({ key: 'q', ctrlKey: false, metaKey: false, altKey: false })).toBe(true)
    expect(isCharacterKey({ key: 'q', ctrlKey: true, metaKey: false, altKey: false })).toBe(false)
    expect(isCharacterKey({ key: 'ArrowUp', ctrlKey: false, metaKey: false, altKey: false })).toBe(false)
    expect(isCharacterKey({ key: ' ', ctrlKey: false, metaKey: false, altKey: false })).toBe(false)
    const input = document.createElement('input')
    expect(isEditableTarget(input)).toBe(true)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(activatesNatively(document.createElement('button'), 'Enter')).toBe(true)
    const link = document.createElement('a')
    link.href = '#x'
    expect(activatesNatively(link, 'Enter')).toBe(true)
    expect(activatesNatively(link, ' ')).toBe(false)
    expect(activatesNatively(document.createElement('div'), 'Enter')).toBe(false)
  })
})

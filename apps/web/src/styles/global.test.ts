import { afterEach, describe, expect, it } from 'vitest'
import './global.css'

/*
 * Reglas de `global.css` comprobadas sobre el CSSOM de jsdom. jsdom no resuelve `var()` ni calcula la
 * cascada completa, así que no se mira el estilo calculado: se mira qué reglas casan con el elemento y
 * qué declaran (lo que basta para saber si una regla base quita el anillo de foco).
 */

/** Reglas de estilo de primer nivel (fuera de `@media`) que casan con el elemento. */
function matchingRules(element: Element): CSSStyleRule[] {
  const rules: CSSStyleRule[] = []
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule instanceof CSSStyleRule && element.matches(rule.selectorText)) rules.push(rule)
    }
  }
  return rules
}

/** ¿Alguna regla que casa con el elemento le quita el contorno? */
const removesOutline = (element: Element) =>
  matchingRules(element).some((rule) => rule.style.getPropertyValue('outline') === 'none')

/** ¿Alguna regla que casa con el elemento le pone el anillo de foco de los tokens? */
const drawsFocusRing = (element: Element) =>
  matchingRules(element).some(
    (rule) =>
      rule.style.getPropertyValue('outline').includes('var(--bb-focus-color)') &&
      rule.style.getPropertyValue('box-shadow') === 'var(--bb-focus-halo)',
  )

function focused(html: string): HTMLElement {
  document.body.innerHTML = html
  const element = document.body.firstElementChild as HTMLElement
  element.focus()
  expect(element).toHaveFocus()
  expect(element.matches(':focus-visible')).toBe(true)
  return element
}

describe('global.css: foco visible', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('RNF-A11Y-01: un botón enfocado lleva el anillo rojo con halo', () => {
    const button = focused('<button type="button">Votar</button>')
    expect(drawsFocusRing(button)).toBe(true)
    expect(removesOutline(button)).toBe(false)
  })

  it('RNF-A11Y-01: un elemento con tabindex="-1" (opción de menú, pestaña, celda) conserva el anillo', () => {
    for (const html of [
      '<button type="button" tabindex="-1">Opción</button>',
      '<div role="option" tabindex="-1">Opción</div>',
      '<div role="gridcell" tabindex="-1">Celda</div>',
    ]) {
      const element = focused(html)
      expect(drawsFocusRing(element), html).toBe(true)
      expect(removesOutline(element), html).toBe(false)
    }
  })

  it('RNF-A11Y-01: solo el destino de foco del marco (data-focus-target) va sin anillo', () => {
    const main = focused('<main id="contenido" tabindex="-1" data-focus-target>Contenido</main>')
    expect(removesOutline(main)).toBe(true)
    expect(
      matchingRules(main).some(
        (rule) => rule.style.getPropertyValue('outline') === 'none' && rule.style.boxShadow === 'none',
      ),
    ).toBe(true)
  })
})

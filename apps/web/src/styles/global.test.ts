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

describe('global.css: red de «reducir movimiento»', () => {
  const NET = ['animation-iteration-count', 'scroll-behavior'] as const
  const NET_VALUES: Record<(typeof NET)[number], string> = {
    'animation-iteration-count': '1',
    'scroll-behavior': 'auto',
  }

  /** ¿La regla impone la red (bucles en una pasada, sin desplazamiento suave) con !important? */
  const imposesNet = (rule: CSSStyleRule) =>
    NET.every(
      (property) =>
        rule.style.getPropertyValue(property) === NET_VALUES[property] &&
        rule.style.getPropertyPriority(property) === 'important',
    )

  /** Selectores de la regla, sin espacios sobrantes. */
  const selectors = (rule: CSSStyleRule) => rule.selectorText.split(',').map((s) => s.trim())

  afterEach(() => {
    delete document.documentElement.dataset.motion
    document.body.innerHTML = ''
  })

  it('RNF-A11Y-03: con la preferencia del sistema, ningún bucle (también en ::before y ::after)', () => {
    const media = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
      .filter((rule) => rule.conditionText.includes('prefers-reduced-motion: reduce'))
    const net = media
      .flatMap((rule) => [...rule.cssRules])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find(imposesNet)
    expect(net).toBeDefined()
    expect(selectors(net!)).toEqual(['*', '*::before', '*::after'])
  })

  it('RNF-A11Y-03: con el ajuste propio de la app (data-motion="reduced"), lo mismo', () => {
    document.body.innerHTML = '<span class="countdown__separator">:</span>'
    const separator = document.body.firstElementChild!
    expect(matchingRules(separator).some(imposesNet)).toBe(false)

    document.documentElement.dataset.motion = 'reduced'
    const net = matchingRules(separator).find(imposesNet)
    expect(net).toBeDefined()
    expect(selectors(net!)).toEqual([
      ':root[data-motion="reduced"] *',
      ':root[data-motion="reduced"] *::before',
      ':root[data-motion="reduced"] *::after',
    ])
  })
})

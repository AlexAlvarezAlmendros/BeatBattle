import { type CSSProperties, type RefObject, useLayoutEffect, useState } from 'react'

/** Cuerpo mínimo del rótulo común, en px (el de `MenuPlate`; `RD-VIS-05`: nunca por debajo de 12). */
export const MENU_LABEL_MIN_PX = 16

/** Paso al buscar el cuerpo que cabe, en px. */
const STEP_PX = 0.5

export interface MenuPlateFit {
  /** Variables para la lista (`--menu-plate-fs`, `--menu-plate-fs-on`, `--menu-plate-h-fit`). */
  style: CSSProperties
  /** Cambia cuando cambian el cuerpo o el alto: las placas vuelven a ajustar su anchura (`MenuPlate`). */
  key: string
}

const NONE: MenuPlateFit = { style: {}, key: '' }

/** Valor numérico de una variable de `:root` (`1.5625rem` → 1.5625). */
function rootNumber(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
}

/**
 * Un mismo cuerpo de rótulo y un mismo alto para todas las placas en reposo de un menú (guía §3.3 «Opción de
 * menú»: «el menor que necesite cualquiera de ellas»; jurado de la 0.28, cierre: a 1024 × 768 «Salón de la
 * fama» iba a 17 px y «Cómo se juega» a 20 frente a 25 el resto, y las placas medían de 50 a 67 px según
 * llevaran dato o no).
 *
 * Lo calcula el menú, no cada placa: copia cada placa **en reposo** (también la elegida) en una lista de
 * prueba invisible, al lado de la de verdad y con su misma clase (las mismas variables y el mismo contenedor),
 * y mide en ella:
 *
 * - **Cuerpo**: el mayor que cabe en el hueco de cada etiqueta con la anchura mínima del display
 *   (`--bb-stretch-min`), sin pasar del de CSS. El común es el menor de todos (como poco 16 px; la placa
 *   que ni así quepa sigue con su propio ajuste, `useFitText`). La elegida crece en la misma proporción que
 *   en CSS (25 → 31 px). Si todas caben con el de CSS, no se toca.
 * - **Alto**: el de la placa en reposo más alta con ese cuerpo (con dato en una segunda línea, el motivo en
 *   dos o sin dato). Lo usa `MenuPlate` como alto mínimo cuando su alto es automático.
 *
 * Devuelve las variables para la lista y una clave que cambia con ellas: cada placa reajusta su anchura
 * (`useFitText`) desde el cuerpo nuevo. Se vuelve a medir tras cada render del menú (cambia el contenido o
 * la elegida), si cambia el ancho de la lista y cuando llega la fuente web. Sin `ResizeObserver` (jsdom) no
 * hace nada.
 */
export function useMenuPlateFit(listRef: RefObject<HTMLElement | null>): MenuPlateFit {
  const [fit, setFit] = useState<MenuPlateFit>(NONE)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const next = measure(list)
      setFit((current) => (current.key === next.key ? current : next))
    }
    update()
    let width = list.clientWidth
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (list.clientWidth === width) return
      width = list.clientWidth
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    })
    observer.observe(list)
    let active = true
    void document.fonts?.ready.then(() => {
      if (active) update()
    })
    return () => {
      active = false
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  })

  return fit
}

/** Mide las placas de `list` en reposo, en una copia invisible, y devuelve el cuerpo y el alto comunes. */
function measure(list: HTMLElement): MenuPlateFit {
  const plates = [...list.querySelectorAll<HTMLElement>('[data-menu-plate]')]
  if (plates.length === 0 || list.clientWidth === 0) return NONE
  const probe = document.createElement(list.tagName)
  probe.className = list.className
  probe.setAttribute('aria-hidden', 'true')
  probe.inert = true
  Object.assign(probe.style, {
    position: 'absolute',
    width: `${list.clientWidth}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
  })
  // Sin las variables del ajuste anterior: se mide desde lo que dice el CSS.
  for (const name of ['--menu-plate-fs', '--menu-plate-fs-on', '--menu-plate-h-fit'])
    probe.style.setProperty(name, 'initial')
  const copies = plates.map((plate) => {
    const item = document.createElement('li')
    const copy = plate.cloneNode(true) as HTMLElement
    for (const name of ['data-cursor-active', 'data-force-state', 'tabindex', 'id', 'href'])
      copy.removeAttribute(name)
    item.append(copy)
    probe.append(item)
    return copy
  })
  list.after(probe)
  try {
    const labels = copies.map((copy) => copy.querySelector<HTMLElement>('[data-plate-label]'))
    for (const label of labels) {
      if (!label) continue
      label.style.fontSize = ''
      label.style.whiteSpace = ''
      label.style.fontStretch = `${rootNumber('--bb-stretch-min') || 105}%`
    }
    const base = labels[0] ? Number.parseFloat(getComputedStyle(labels[0]).fontSize) : 0
    if (!base) return NONE
    // El cuerpo que necesita cada etiqueta: el mayor que cabe en su hueco con la anchura mínima.
    let body = base
    for (const label of labels) {
      if (!label) continue
      let size = base
      const overflows = () => label.scrollWidth > label.clientWidth + 0.5
      if (overflows()) {
        size = Math.max(MENU_LABEL_MIN_PX, Math.floor((base * label.clientWidth) / label.scrollWidth))
        label.style.fontSize = `${size}px`
        while (overflows() && size > MENU_LABEL_MIN_PX) {
          size = Math.max(MENU_LABEL_MIN_PX, size - STEP_PX)
          label.style.fontSize = `${size}px`
        }
      }
      body = Math.min(body, size)
    }
    const reduced = body < base - 0.25
    // El alto de la más alta en reposo, con el cuerpo común.
    for (const label of labels) if (label) label.style.fontSize = reduced ? `${body}px` : ''
    const height = Math.max(...copies.map((copy) => copy.getBoundingClientRect().height))
    const ratio = rootNumber('--bb-fs-plate-on') / rootNumber('--bb-fs-plate') || 1
    const style: Record<string, string> = { '--menu-plate-h-fit': `${Math.ceil(height)}px` }
    if (reduced) {
      style['--menu-plate-fs'] = `${body}px`
      style['--menu-plate-fs-on'] = `${Math.round(body * ratio * 2) / 2}px`
    }
    return { style: style as CSSProperties, key: Object.values(style).join('|') }
  } finally {
    probe.remove()
  }
}

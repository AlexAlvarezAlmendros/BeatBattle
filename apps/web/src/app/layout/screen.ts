import { useMatches } from 'react-router'
import type { SimpleMessageKey } from '../../i18n'

/**
 * Configuración de pantalla del marco de juego (guía §3.4.1, §3.5, §3.8.14; tarea 0.23): qué arena va
 * detrás, qué teclas enseña la barra de controles y qué placa de título lleva el HUD. Cada ruta la
 * declara en su `handle.screen` (`routes.tsx`) y el marco la lee de la ruta más profunda que la tenga,
 * así que se conoce en el primer render, sin parpadeo.
 */

/**
 * Dónde va la cuña granate de la arena (§3.5 capa 0): a la derecha (menú principal), a la izquierda
 * (pantallas interiores) o ninguna (marco simple: autenticación, admin, legales y la galería).
 */
export type ArenaWedge = 'right' | 'left' | 'none'

/**
 * Teclas de la barra de controles (§3.4.1), en el orden en que se enseñan. Cada una es un grupo de
 * teclas con su verbo: `choose` (↑↓ ELEGIR), `move` (←↑↓→ MOVER), `section` (Q E SECCIÓN), `enter`
 * (INTRO ENTRAR), `back` (ESC VOLVER) y `sound` (M SONIDO).
 */
export type ControlKey = 'choose' | 'move' | 'section' | 'enter' | 'back' | 'sound'

/** Placa de título del HUD en las pantallas interiores (§3.3 «Placa de título»). */
export interface TitlePlateConfig {
  kicker: SimpleMessageKey
  title: SimpleMessageKey
}

export interface ScreenConfig {
  wedge: ArenaWedge
  keys: readonly ControlKey[]
  /** Placa de título del centro del HUD; sin ella, el centro queda para la pantalla (el reloj). */
  plate?: TitlePlateConfig
  /**
   * Marco simple (§3.8.14): HUD sin capa de juego (sin jugador), paneles y la barra de controles con
   * su firma. Autenticación, admin, legales y herramientas de desarrollo.
   */
  simple?: boolean
  /**
   * Estallido de rayos detrás de la pantalla (§3.2 «Texturas»: detrás del logo, del VS y del podio).
   * Por defecto, sí; `false` en las pantallas de texto sin pieza que lo tape (la galería), para que
   * ningún texto quede sobre los rayos (`RD-VIS-05`).
   */
  rays?: boolean
  /**
   * La pantalla tiene bucles decorativos que arrancan solos (§3.6 «Bucles»: barridos de esqueleto,
   * cargadores, el latido del reloj): la barra lleva el botón «Pausar las animaciones» al lado de «Legal»
   * (§3.4.1, WCAG 2.2.2). El menú no lo declara aquí: su crónica ocupa ese hueco y lleva el botón con ella
   * (`Chronicle`, `loops`).
   */
  loops?: boolean
}

/** Menú principal (home): cuña a la derecha y las teclas del menú. */
export const MENU_SCREEN: ScreenConfig = {
  wedge: 'right',
  keys: ['choose', 'enter', 'back', 'sound'],
}

/** Pantalla interior con su placa de título (§3.8.14). */
export function interiorScreen(plate: TitlePlateConfig, keys: readonly ControlKey[] = ['back', 'sound']) {
  return { wedge: 'left', keys, plate } satisfies ScreenConfig
}

/** Marco simple (§3.8.14): sin cuña ni jugador, con sus teclas y la firma. */
export function simpleScreen(plate?: TitlePlateConfig, keys: readonly ControlKey[] = ['back', 'sound']) {
  return { wedge: 'none', keys, plate, simple: true } satisfies ScreenConfig
}

/** Lo que se usa si ninguna ruta dice nada (no debería pasar: el test de rutas lo comprueba). */
export const DEFAULT_SCREEN: ScreenConfig = { wedge: 'left', keys: ['back', 'sound'] }

/** ¿Es un `handle` con configuración de pantalla? */
function screenOf(handle: unknown): ScreenConfig | undefined {
  if (!handle || typeof handle !== 'object' || !('screen' in handle)) return undefined
  return (handle as { screen?: ScreenConfig }).screen
}

/** Configuración de la pantalla actual: la de la ruta más profunda que la declara. */
export function useScreen(): ScreenConfig {
  const matches = useMatches()
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const screen = screenOf(matches[index]?.handle)
    if (screen) return screen
  }
  return DEFAULT_SCREEN
}

import { color } from '@beatbattle/shared/tokens'

/**
 * Tema de los emails (guía §3.8.12), sacado de los tokens: los clientes de correo no entienden variables
 * CSS, así que aquí los valores van resueltos. Nada de colores sueltos fuera de este fichero.
 */

/** Mezcla un color con transparencia sobre un fondo opaco: Outlook no entiende `rgba` en bordes. */
function over(rgba: string, background: string): string {
  const [r, g, b, a] = (rgba.match(/[\d.]+/g) ?? []).map(Number)
  const bg = background.match(/\w\w/g)?.map((hex) => Number.parseInt(hex, 16)) ?? [0, 0, 0]
  const mix = (c: number | undefined, i: number) =>
    Math.round((c ?? 0) * (a ?? 1) + (bg[i] ?? 0) * (1 - (a ?? 1)))
      .toString(16)
      .padStart(2, '0')
  return `#${mix(r, 0)}${mix(g, 1)}${mix(b, 2)}`
}

export const mail = {
  /** Fondo de todo el email (también como `bgcolor`: muchos clientes ignoran el CSS de fondo). */
  background: color.black,
  /** Tarjetas del cuerpo (`--bb-panel`). */
  card: color.panel,
  /** Borde de 2 px de las tarjetas: `--bb-line` resuelto sobre la tarjeta. */
  cardBorder: over(color.line, color.panel),
  /** Botón rectangular (`--bb-red-cta`) con texto blanco. */
  button: color.redCta,
  buttonText: color.white,
  red: color.red,
  text: color.text,
  text2: color.text2,
  text3: color.text3,
  /** Ancho del email. */
  width: 600,
  /** Chakra Petch con las alternativas de §3.8.12 (Gmail no carga fuentes web). */
  font: '"Chakra Petch", Arial, Helvetica, sans-serif',
  /** Cuerpo: 14 px como mínimo (§3.8.12). */
  body: 16,
  small: 14,
} as const

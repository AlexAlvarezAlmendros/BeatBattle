import { angle, length } from '@beatbattle/shared/tokens'
import { CARD_BASE_WIDTH, CARD_RATIO } from '../../ui/ProducerCard/cardCanvas'

/**
 * El pase de torneo de la carta (guía §3.4.4; tarea 7.23), sin three ni Rapier: medidas, pose de reposo, la cinta y
 * la cuenta del arrastre. Lo usan la vista (`PassView`), la física (`passPhysics`) y sus tests.
 *
 * **Unidades.** La carta mide 1 de ancho (y 88/63 de alto): la escena va en «cartas» y la cámara convierte a px
 * (`ppu`, px por unidad, es el ancho de la carta plana). El eje y sube (el de three), al revés que el del DOM.
 *
 * **Qué es** (y en qué no se parece al `Lanyard` del sello, §3.1): una cinta corta y roja con «OTP.» impreso, en Λ, de un
 * remache metálico a los dos extremos de una pinza ancha que muerde el canto de arriba de la carta, todo dentro de la
 * columna de la pieza; nada de una tira que baja desde fuera de la pantalla hasta un mosquetón, ni brillo de
 * entorno. La carta cuelga a −3° porque el ojal de la pinza está descentrado (`pivotLocal`), no por un muelle.
 */

export interface Vec2 {
  x: number
  y: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

export const PASS = {
  /** La carta: 1 × 88/63, con un canto fino. */
  card: { w: 1, h: CARD_RATIO, depth: 0.012 },
  /** Giro de reposo en el sentido de three (antihorario): el −3° de CSS de la carta (`--bb-tilt-card`). */
  rest: rad(-angle.tiltCard),
  /** La pinza: media anchura, lo que sube sobre el canto, lo que muerde y dónde entra la cinta (desde el borde). */
  clip: { half: 0.24, rise: 0.065, bite: 0.04, slot: 0.055, cut: 0.03 },
  /** La cinta: anchura, tramos de la física, largo mínimo y largo de cada «OTP.» impreso. */
  ribbon: { width: 0.072, links: 3, min: 0.08, tile: 0.34 },
  /** El remache del que cuelga: radio y distancia desde arriba de la vista. */
  stud: { r: 0.034, top: 0.075 },
  /** Gravedad de la escena (unidades/s²): da un vaivén de algo más de un segundo, de carta grande. */
  gravity: 28,
  /** Masas (la cinta pesa poco, pero no tanto que las bisagras cedan bajo la carta). */
  mass: { card: 1, link: 0.2 },
  /** Iteraciones de más del solver en cada cuerpo del pase: la cinta no se estira. */
  solverIterations: 8,
  /** Amortiguación lineal y angular: la carta se para en un par de vaivenes. */
  damping: { link: { linear: 2, angular: 4 }, card: { linear: 1.8, angular: 4 } },
  /** Arrastre: el punto agarrado sigue al puntero a esta velocidad (1/s), con tope, sin despegar la cinta. */
  drag: { follow: 14, maxSpeed: 9, gain: 0.35 },
  /** Inclinación de la cara (solo dibujo): hasta el doble del giro de la carta, como la plana (Anexo E). */
  tilt: { max: rad(2 * Math.abs(angle.tiltCard)), perSpeed: 0.1 },
  /** Campo de visión de la cámara (la media vuelta de C se ve en perspectiva). */
  fov: 18,
  /** Sombra dura de la carta (la de la plana, `--bb-shadow-drop`: 10 × 12 px al 60 %). */
  shadow: { x: 10, y: 12, opacity: 0.6 },
} as const

/** Chaflán del marco de la carta en unidades: el del lienzo de `cardCanvas`, que escala con el ancho de la carta. */
export const cardCut = () => length.cutLg / CARD_BASE_WIDTH

/**
 * Dónde engancha la cinta en la carta (coordenadas de la carta, desde su centro): arriba, en la pinza, y un poco a la
 * derecha del eje. Con el centro de masas debajo del ojal, la carta cuelga a `rest` (tan θ = x / y).
 */
export function pivotLocal(rest: number = PASS.rest): Vec2 {
  const y = PASS.card.h / 2 + PASS.clip.rise
  return { x: y * Math.tan(rest), y }
}

/** Donde entran los dos tramos de la cinta en la pinza (coordenadas de la carta), izquierdo y derecho. */
export function strandAnchors(): [Vec2, Vec2] {
  const x = PASS.clip.half - PASS.clip.slot
  const y = PASS.card.h / 2 + PASS.clip.rise * 0.7
  return [
    { x: -x, y },
    { x, y },
  ]
}

export const rotate = (v: Vec2, a: number): Vec2 => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
})
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)

/** Medidas del DOM (px CSS) de las que sale la escena. La carta, relativa a la esquina de la vista. */
export interface PassMeasures {
  viewW: number
  viewH: number
  cardLeft: number
  cardTop: number
  cardW: number
  cardH: number
}

/** La escena en unidades de carta, con el origen en el centro de la vista. */
export interface PassLayout {
  /** px por unidad: el ancho de la carta plana. */
  ppu: number
  /** Tamaño de la vista, en unidades. */
  view: { w: number; h: number }
  /** El remache, del que cuelga todo. */
  peg: Vec2
  /** Largo de la cinta, del remache al ojal de la pinza. */
  ribbon: number
}

/**
 * La escena para unas medidas: la carta 3D descansa donde está la plana (mismo centro, mismo ancho y el mismo −3°), así
 * que el relevo no se nota. El remache va arriba de la vista, en la vertical del centro de la carta; la cinta mide lo
 * que queda entre los dos.
 */
export function passLayout(m: PassMeasures): PassLayout {
  const ppu = m.cardW
  const center = {
    x: (m.cardLeft + m.cardW / 2 - m.viewW / 2) / ppu,
    y: -(m.cardTop + m.cardH / 2 - m.viewH / 2) / ppu,
  }
  const view = { w: m.viewW / ppu, h: m.viewH / ppu }
  const peg = { x: center.x, y: view.h / 2 - PASS.stud.top }
  const reach = Math.hypot(pivotLocal().x, pivotLocal().y)
  return { ppu, view, peg, ribbon: Math.max(PASS.ribbon.min, peg.y - center.y - reach) }
}

/**
 * Pose de reposo (relativa al remache): los puntos intermedios de la cinta en vertical (uno entre cada dos tramos) y la
 * carta colgando a `rest` del extremo de abajo.
 */
export function restPose(ribbon: number): { links: Vec2[]; card: Vec2; angle: number } {
  const n = PASS.ribbon.links
  const seg = ribbon / n
  const links = Array.from({ length: n - 1 }, (_, i) => ({ x: 0, y: -seg * (i + 1) }))
  const pivot = { x: 0, y: -ribbon }
  const card = sub(pivot, rotate(pivotLocal(), PASS.rest))
  return { links, card, angle: PASS.rest }
}

/** Un punto de la carta (coordenadas de la carta) en la escena, con la carta en `center` y girada `angle`. */
export const cardToWorld = (local: Vec2, center: Vec2, a: number): Vec2 => add(center, rotate(local, a))

/** Un punto de la escena en coordenadas de la carta. */
export const worldToCard = (point: Vec2, center: Vec2, a: number): Vec2 => rotate(sub(point, center), -a)

/** ¿Cae el puntero sobre la carta (o su pinza)? Devuelve el punto agarrado en coordenadas de la carta. */
export function hitCard(point: Vec2, center: Vec2, a: number): Vec2 | null {
  const local = worldToCard(point, center, a)
  const { w, h } = PASS.card
  const inCard = Math.abs(local.x) <= w / 2 && Math.abs(local.y) <= h / 2
  const inClip = Math.abs(local.x) <= PASS.clip.half && local.y > h / 2 && local.y <= h / 2 + PASS.clip.rise
  return inCard || inClip ? local : null
}

/**
 * Hasta dónde se puede llevar el puntero: dentro de la vista, con la carta entera dentro (su media diagonal y la
 * sombra), y nunca por encima del remache (la carta no da la vuelta a la cinta).
 */
export function clampTarget(target: Vec2, layout: PassLayout): Vec2 {
  const half = Math.hypot(PASS.card.w, PASS.card.h) / 2
  const margin = half * 0.6
  return {
    x: Math.min(layout.view.w / 2 - margin, Math.max(-layout.view.w / 2 + margin, target.x)),
    y: Math.min(layout.peg.y - PASS.ribbon.min - half * 0.4, Math.max(-layout.view.h / 2 + margin, target.y)),
  }
}

/**
 * Un tramo de la cinta como polilínea de `samples` puntos: sale del remache, sigue la curva de la cadena (los extremos
 * de los eslabones) y acaba en su ranura de la pinza. Si el tramo queda más corto que en reposo (la carta sube o se
 * gira hacia él), se comba lo que le sobra, hacia abajo.
 */
export function strandPoints(
  chain: readonly Vec2[],
  end: Vec2,
  side: -1 | 1,
  restLength: number,
  samples = 14,
): Vec2[] {
  const last = chain[chain.length - 1] as Vec2
  const start = chain[0] as Vec2
  const shift = sub(end, last)
  const chord = dist(start, end)
  const slack = restLength > chord ? Math.sqrt(restLength ** 2 - chord ** 2) / 2 : 0
  const along = chord > 0 ? scale(sub(end, start), 1 / chord) : { x: 0, y: -1 }
  // La comba cae (como cae una cinta floja): de las dos perpendiculares al tramo, la que baja; con el tramo casi
  // vertical, la de fuera (a la izquierda del tramo izquierdo y a la derecha del derecho).
  const left = { x: along.y, y: -along.x }
  const right = { x: -along.y, y: along.x }
  const outward = side < 0 ? left : right
  const out = Math.abs(left.y) < 0.2 ? outward : left.y < 0 ? left : right
  const points: Vec2[] = []
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1)
    const base = catmullRom(chain, u)
    points.push(add(add(base, scale(shift, u)), scale(out, slack * Math.sin(Math.PI * u))))
  }
  return points
}

/** Largo de un tramo en reposo (para saber cuánto le sobra al combarse). */
export function strandRestLength(ribbon: number, side: -1 | 1): number {
  const pose = restPose(ribbon)
  const anchor = strandAnchors()[side < 0 ? 0 : 1]
  return dist({ x: 0, y: 0 }, cardToWorld(anchor, pose.card, pose.angle))
}

/** Curva de Catmull-Rom (centrípeta no hace falta: los puntos van casi equiespaciados) por `points`, en `u ∈ [0, 1]`. */
export function catmullRom(points: readonly Vec2[], u: number): Vec2 {
  const n = points.length - 1
  if (n <= 0) return points[0] ?? { x: 0, y: 0 }
  const f = Math.min(n - 1e-9, Math.max(0, u * n))
  const i = Math.floor(f)
  const t = f - i
  const p = (k: number) => points[Math.min(n, Math.max(0, k))] as Vec2
  const p0 = p(i - 1)
  const p1 = p(i)
  const p2 = p(i + 1)
  const p3 = p(i + 2)
  const t2 = t * t
  const t3 = t2 * t
  const blend = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: blend(p0.x, p1.x, p2.x, p3.x), y: blend(p0.y, p1.y, p2.y, p3.y) }
}

/**
 * Impulso del arrastre (por paso de física): lleva el punto agarrado hacia el puntero con una velocidad que crece con
 * la distancia y tiene tope, aplicado en ese punto (agarrar una esquina gira la carta). La cinta no se estira: si el
 * puntero va más lejos, la carta se queda en lo que da de sí.
 */
export function dragImpulse(
  body: { center: Vec2; angle: number; linvel: Vec2; angvel: number; mass: number },
  grabLocal: Vec2,
  target: Vec2,
): { impulse: Vec2; point: Vec2 } {
  const point = cardToWorld(grabLocal, body.center, body.angle)
  const r = sub(point, body.center)
  const pointVel = { x: body.linvel.x - body.angvel * r.y, y: body.linvel.y + body.angvel * r.x }
  let desired = scale(sub(target, point), PASS.drag.follow)
  const speed = Math.hypot(desired.x, desired.y)
  if (speed > PASS.drag.maxSpeed) desired = scale(desired, PASS.drag.maxSpeed / speed)
  return { impulse: scale(sub(desired, pointVel), PASS.drag.gain * body.mass), point }
}

/** El giro alrededor de z de un cuaternión que solo gira en z (las piezas del pase solo giran en el plano). */
export const zAngle = (q: { z: number; w: number }) => 2 * Math.atan2(q.z, q.w)

import { color } from '@beatbattle/shared/tokens'
import { dataUri, h, medalSvg, type Node, renderPng, renderSvg, scoreText } from './ogKit'

/**
 * Tarjeta de resultado personal (§3.8.12, §4.19.5; tarea 6.10): la imagen que lleva el Lunes de batalla de
 * quien participó. 1200 × 630 (la proporción de las imágenes OG), fondo negro propio para que los clientes que
 * invierten colores no la rompan, la medalla de vinilo de su puesto (§3.4.3) y las cifras de la semana sellada.
 * En el email va a 560 px de ancho: ningún texto baja de 30 px aquí (14 px allí, §3.8.12).
 *
 * Se pinta con `ogKit` (satori y resvg, con las fuentes del juego).
 */

export const RESULT_CARD_WIDTH = 1200
export const RESULT_CARD_HEIGHT = 630

export interface ResultCardData {
  weekNumber: number
  sampleTitle: string
  entryTitle: string
  alias: string
  /** `null` si la cuenta ya no existe. */
  producer: string | null
  /** `null` = sin clasificar. */
  position: number | null
  scoreMilli: number
  votes: number
  histogram: readonly [number, number, number, number, number]
  /** Revisión del snapshot: con un re-sellado, la tarjeta lo dice. */
  corrected: boolean
}

function tree(data: ResultCardData): Node {
  const place = data.position !== null && data.position <= 3 ? (data.position as 1 | 2 | 3) : null
  const max = Math.max(1, ...data.histogram)
  const label = (text: string) =>
    h('span', { fontFamily: 'Chakra Petch', fontWeight: 600, fontSize: 30, color: color.text3 }, text)
  const stat = (name: string, value: string) =>
    h(
      'div',
      { flexDirection: 'column', marginRight: 40 },
      label(name),
      h(
        'span',
        { fontFamily: 'Oxanium', fontWeight: 700, fontSize: 72, color: color.white, lineHeight: 1 },
        value,
      ),
    )
  const medalCol = h(
    'div',
    { width: 380, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    place
      ? {
          type: 'img',
          props: {
            src: dataUri(medalSvg(place), 'image/svg+xml'),
            width: 260,
            height: 260,
          },
        }
      : h('div', {
          width: 260,
          height: 260,
          borderRadius: 130,
          border: `3px solid ${color.ink4}`,
          backgroundColor: color.panel,
        }),
    h(
      'span',
      {
        marginTop: 24,
        fontFamily: 'Anybody',
        fontWeight: 900,
        fontSize: data.position === null ? 40 : 96,
        color: data.position === 1 ? color.red : color.white,
        lineHeight: 1,
        textAlign: 'center',
      },
      data.position === null ? 'SIN CLASIFICAR' : `${data.position}.º`,
    ),
  )
  const bars = h(
    'div',
    { alignItems: 'flex-end', height: 120 },
    ...data.histogram.map((count, index) =>
      h(
        'div',
        { flexDirection: 'column', alignItems: 'center', marginLeft: 12 },
        h('div', {
          width: 32,
          height: Math.max(4, Math.round((count / max) * 80)),
          backgroundColor: index === 4 ? color.red : color.text2,
        }),
        h(
          'span',
          { fontFamily: 'Oxanium', fontWeight: 700, fontSize: 30, color: color.text3, marginTop: 6 },
          String(index + 1),
        ),
      ),
    ),
  )
  return h(
    'div',
    {
      width: RESULT_CARD_WIDTH,
      height: RESULT_CARD_HEIGHT,
      backgroundColor: color.black,
      padding: 32,
    },
    h(
      'div',
      {
        flex: 1,
        backgroundColor: color.panel,
        border: `2px solid ${color.lineStrong}`,
        padding: '40px 48px',
      },
      medalCol,
      h(
        'div',
        { flex: 1, flexDirection: 'column', justifyContent: 'space-between', paddingLeft: 24 },
        h(
          'div',
          { flexDirection: 'column' },
          h(
            'span',
            { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 30, color: color.red, letterSpacing: 2 },
            `SEMANA #${data.weekNumber} · ${data.corrected ? 'RESULTADO CORREGIDO' : 'RESULTADOS OFICIALES'}`,
          ),
          h(
            'span',
            {
              fontFamily: 'Anybody',
              fontWeight: 900,
              display: 'block',
              fontSize: data.entryTitle.length > 24 ? 52 : 64,
              color: color.white,
              lineHeight: 1.05,
              marginTop: 12,
              lineClamp: 2,
            },
            data.entryTitle,
          ),
          h(
            'div',
            { marginTop: 12, alignItems: 'baseline' },
            h(
              'span',
              {
                fontFamily: 'Chakra Petch',
                fontWeight: 600,
                fontSize: 32,
                color: color.text4,
                textDecoration: 'line-through',
                marginRight: 16,
              },
              data.alias,
            ),
            h(
              'span',
              { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 36, color: color.white },
              data.producer ?? 'Productor eliminado',
            ),
          ),
        ),
        h(
          'div',
          { alignItems: 'flex-end', justifyContent: 'space-between' },
          h('div', {}, stat('PUNTUACIÓN', scoreText(data.scoreMilli)), stat('VOTOS', String(data.votes))),
          bars,
        ),
        h(
          'div',
          { justifyContent: 'space-between', alignItems: 'baseline' },
          h(
            'span',
            { fontFamily: 'Chakra Petch', fontWeight: 600, fontSize: 30, color: color.text3, maxWidth: 520 },
            `Sample: ${data.sampleTitle}`,
          ),
          h(
            'span',
            { fontFamily: 'Anybody', fontWeight: 900, fontSize: 40, color: color.red, letterSpacing: 1 },
            'OTP.',
          ),
        ),
      ),
    ),
  )
}

/** La tarjeta como SVG (para los tests, que no rasterizan). */
export const resultCardSvg = (data: ResultCardData) =>
  renderSvg(tree(data), RESULT_CARD_WIDTH, RESULT_CARD_HEIGHT)

/** La tarjeta como PNG. */
export const resultCardPng = (data: ResultCardData) =>
  renderPng(tree(data), RESULT_CARD_WIDTH, RESULT_CARD_HEIGHT)

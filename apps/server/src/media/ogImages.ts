import { paintCover } from '@beatbattle/covers'
import { musicalKeyName, RANK_NAMES } from '@beatbattle/emails'
import { color } from '@beatbattle/shared/tokens'
import type { OgData } from '../modules/share/og'
import { cardNode } from './cardOg'
import { type Child, dataUri, h, medalSvg, type Node, renderPng, renderSvg, scoreText } from './ogKit'
import { SvgCanvas } from './svgCanvas'

/**
 * Las imágenes OG (§2.15; tarea 6.11): 1200 × 630, con la dirección de arte del juego (negro, rojo, granate,
 * la portada generativa como vinilo-sol y la firma *OTP.*). Ningún texto baja de 28 px: en una previsualización
 * de red social la imagen se ve a ~500 px. Antes del sellado no hay nada que dé ventaja a una entrada: la
 * imagen de una entrada sin sellar dice «Escúchala y vota», nunca «Vota a X» (§2.15).
 */

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630
const COVER_SIZE = 440
/** Ancho de la carta en la imagen OG del perfil: con su giro de −3°, cabe en el alto del panel. */
const PROFILE_CARD_WIDTH = 352

const chips = (bpm: number | null, key: string | null) =>
  [bpm ? `${Math.round(bpm)} BPM` : null, key ? musicalKeyName(key) : null].filter(Boolean).join(' · ')

/** La portada generativa pintada por CPU con su calibración (§3.4.5). */
function cover(seed: string, bpm: number | null, musicalKey: string | null): Node {
  const canvas = new SvgCanvas(COVER_SIZE, COVER_SIZE)
  paintCover(canvas, COVER_SIZE, { seed, bpm, musicalKey })
  return {
    type: 'img',
    props: { src: dataUri(canvas.toPng(), 'image/png'), width: COVER_SIZE, height: COVER_SIZE },
  }
}

const kicker = (text: string) =>
  h(
    'span',
    { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 30, color: color.red, letterSpacing: 2 },
    text,
  )

const title = (text: string, size = 72) =>
  h(
    'span',
    {
      display: 'block',
      fontFamily: 'Anybody',
      fontWeight: 900,
      fontSize: text.length > 22 ? Math.round(size * 0.8) : size,
      color: color.white,
      lineHeight: 1.04,
      marginTop: 12,
      lineClamp: 2,
    },
    text,
  )

const line = (text: string, tone: string = color.text2, size = 32) =>
  h('span', { fontFamily: 'Chakra Petch', fontWeight: 600, fontSize: size, color: tone, marginTop: 10 }, text)

/** La placa roja de abajo: la cuenta atrás congelada o la llamada a la acción. */
const plate = (text: string, marginTop = 0) =>
  h(
    'div',
    { backgroundColor: color.redCta, padding: '10px 22px', alignSelf: 'flex-start', marginTop },
    h('span', { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 30, color: color.white }, text),
  )

/** El marco común: la pieza visual a la izquierda, el texto a la derecha y la firma abajo. */
function frame(visual: Node, text: Child[], foot: Child): Node {
  return h(
    'div',
    { width: OG_WIDTH, height: OG_HEIGHT, backgroundColor: color.black, padding: 32 },
    h(
      'div',
      {
        flex: 1,
        backgroundColor: color.panel,
        border: `2px solid ${color.lineStrong}`,
        padding: '40px 44px',
        alignItems: 'center',
      },
      h('div', { width: COVER_SIZE, height: COVER_SIZE, flexShrink: 0 }, visual),
      h(
        'div',
        {
          flex: 1,
          height: '100%',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingLeft: 44,
        },
        h('div', { flexDirection: 'column' }, ...text),
        h(
          'div',
          { justifyContent: 'space-between', alignItems: 'flex-end' },
          foot ?? h('div', {}),
          h(
            'div',
            { flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 24 },
            h(
              'span',
              { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 28, color: color.text3 },
              'BEAT BATTLE',
            ),
            h('span', { fontFamily: 'Anybody', fontWeight: 900, fontSize: 40, color: color.red }, 'OTP.'),
          ),
        ),
      ),
    ),
  )
}

const medalImg = (place: 1 | 2 | 3, size: number): Node => ({
  type: 'img',
  props: { src: dataUri(medalSvg(place), 'image/svg+xml'), width: size, height: size },
})

function tree(data: OgData): Node {
  switch (data.kind) {
    case 'week': {
      const head =
        data.phase === 'open' ? 'NUEVO DROP' : data.phase === 'voting' ? 'VOTACIÓN ABIERTA' : 'SEMANA CERRADA'
      const deadline =
        data.phase === 'open'
          ? `Envíos hasta el ${data.deadline}`
          : data.phase === 'voting'
            ? `Votos hasta el ${data.deadline}`
            : 'Resultados oficiales'
      return frame(
        cover(`week:${data.slug}`, data.bpm, data.musicalKey),
        [
          kicker(`SEMANA #${data.number} · ${head}`),
          title(data.sampleTitle),
          line(data.credits, color.text3),
          chips(data.bpm, data.musicalKey) ? line(chips(data.bpm, data.musicalKey), color.white) : null,
          plate(deadline, 28),
        ],
        null,
      )
    }
    case 'entry': {
      const r = data.result
      const place = r?.position && r.position <= 3 ? (r.position as 1 | 2 | 3) : null
      const who = data.producer
        ? h(
            'div',
            { marginTop: 10, alignItems: 'baseline' },
            r
              ? h(
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
                )
              : null,
            h(
              'span',
              { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 36, color: color.white },
              data.producer,
            ),
          )
        : line(data.alias, color.white, 36)
      const foot = r
        ? h(
            'div',
            { alignItems: 'center' },
            place ? medalImg(place, 72) : null,
            h(
              'span',
              {
                fontFamily: 'Oxanium',
                fontWeight: 700,
                fontSize: 44,
                color: color.white,
                marginLeft: place ? 16 : 0,
              },
              r.position
                ? `${r.position}.º · ${scoreText(r.scoreMilli)}`
                : `Sin clasificar · ${r.votes} votos`,
            ),
          )
        : data.votingOpen
          ? plate('Escúchala y vota')
          : null
      return frame(
        cover(data.coverSeed, data.bpm, data.musicalKey),
        [
          kicker(`SEMANA #${data.weekNumber} · ${data.sampleTitle.toUpperCase()}`),
          title(data.title, 64),
          who,
          chips(data.bpm, data.musicalKey) ? line(chips(data.bpm, data.musicalKey), color.text3, 30) : null,
        ],
        foot,
      )
    }
    case 'results': {
      const rows = data.podium.map((row) =>
        h(
          'div',
          { alignItems: 'center', marginTop: 14 },
          medalImg(row.position as 1 | 2 | 3, 64),
          h(
            'div',
            { flexDirection: 'column', marginLeft: 18, maxWidth: 560 },
            h(
              'span',
              {
                fontFamily: 'Chakra Petch',
                fontWeight: 700,
                fontSize: 32,
                color: color.white,
                lineClamp: 1,
                display: 'block',
              },
              `${row.position}.º ${row.title}`,
            ),
            h(
              'span',
              { fontFamily: 'Chakra Petch', fontWeight: 600, fontSize: 28, color: color.text3 },
              row.producer ?? 'Productor eliminado',
            ),
          ),
        ),
      )
      return frame(
        medalImg(1, COVER_SIZE),
        [
          kicker(`SEMANA #${data.number} · ${data.corrected ? 'CLASIFICACIÓN CORREGIDA' : 'RESULTADOS'}`),
          title(data.empty ? 'Semana desierta' : data.sampleTitle, 56),
          ...(rows.length
            ? rows
            : [line(data.empty ? 'Nadie subió su flip.' : 'Sin podio: nadie llegó a 3 votos.')]),
        ],
        null,
      )
    }
    case 'profile': {
      // La carta de productor (tarea 7.28): el anverso de la carta, inclinado, y al lado lo que dice en grande.
      const stat = (name: string, value: string) =>
        h(
          'div',
          { flexDirection: 'column', marginRight: 40 },
          h('span', { fontFamily: 'Chakra Petch', fontWeight: 600, fontSize: 28, color: color.text3 }, name),
          h(
            'span',
            { fontFamily: 'Oxanium', fontWeight: 700, fontSize: 60, color: color.white, lineHeight: 1 },
            value,
          ),
        )
      const card = data.card
      const wins = card.wins
      return h(
        'div',
        { width: OG_WIDTH, height: OG_HEIGHT, backgroundColor: color.black, padding: 32 },
        h(
          'div',
          {
            flex: 1,
            backgroundColor: color.panel,
            border: `2px solid ${color.lineStrong}`,
            padding: '0 44px 0 52px',
            alignItems: 'center',
          },
          cardNode(profileCard(data), PROFILE_CARD_WIDTH),
          h(
            'div',
            {
              flex: 1,
              height: '100%',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '40px 0 40px 56px',
            },
            h(
              'div',
              { flexDirection: 'column' },
              kicker('CARTA DE PRODUCTOR · BEAT BATTLE'),
              title(data.displayName),
              line(`@${data.username}`, color.text3),
              line(`${RANK_NAMES[card.rank] ?? card.rank} · Nivel ${card.level}`, color.red, 32),
              h(
                'div',
                { marginTop: 28 },
                stat('VICTORIAS', String(wins)),
                stat('PODIOS', String(data.podiums)),
                stat('SEMANAS', String(data.weeks)),
              ),
            ),
            h(
              'div',
              { justifyContent: 'flex-end', alignItems: 'flex-end' },
              h(
                'div',
                { flexDirection: 'column', alignItems: 'flex-end' },
                h(
                  'span',
                  { fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: 28, color: color.text3 },
                  'BEAT BATTLE',
                ),
                h('span', { fontFamily: 'Anybody', fontWeight: 900, fontSize: 40, color: color.red }, 'OTP.'),
              ),
            ),
          ),
        ),
      )
    }
  }
}

export const ogSvg = (data: OgData) => renderSvg(tree(data), OG_WIDTH, OG_HEIGHT)
export const ogPng = (data: OgData) => renderPng(tree(data), OG_WIDTH, OG_HEIGHT)

type ProfileOg = Extract<OgData, { kind: 'profile' }>

/** La carta de un perfil para `cardNode`: lo público (solo semanas selladas). */
function profileCard(data: ProfileOg) {
  const { card } = data
  return {
    name: data.displayName,
    number: card.number,
    initials: card.initials,
    since: card.since,
    level: card.level,
    levelFraction: card.levelFraction,
    rank: card.rank,
    variant: card.variant,
    stats: { wins: card.wins, podiums: data.podiums, weeks: data.weeks },
    showcase: card.showcase.length,
    achievements: card.achievements,
  }
}

/**
 * **La carta sola** (jurado de la 7.35, §4.19.5): el anverso, inclinado −3°, en vertical y sin nada al lado, para la
 * «Carta del trimestre» de `season.wrap`. La imagen OG (1200 × 630) en el email se veía a 512 px y, en el móvil, a unos
 * 306: la letra de la carta bajaba a 3–6 px. Aquí la carta ocupa casi todo el ancho de la imagen (con el margen justo
 * para su giro), así que a 306 px de ancho su letra más pequeña (el «Nv» del sello) se queda en ~11 px, el resto en
 * 12 o más; a 376, el tamaño del email en escritorio, es la carta del perfil (352 px). Fondo propio del panel del email.
 */
export const CARD_IMAGE_WIDTH = 608
export const CARD_IMAGE_HEIGHT = 828
const CARD_IMAGE_CARD_WIDTH = 560

const cardImageTree = (data: ProfileOg): Node =>
  h(
    'div',
    {
      width: CARD_IMAGE_WIDTH,
      height: CARD_IMAGE_HEIGHT,
      backgroundColor: color.panel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardNode(profileCard(data), CARD_IMAGE_CARD_WIDTH),
  )

export const cardImageSvg = (data: ProfileOg) =>
  renderSvg(cardImageTree(data), CARD_IMAGE_WIDTH, CARD_IMAGE_HEIGHT)
export const cardImagePng = (data: ProfileOg) =>
  renderPng(cardImageTree(data), CARD_IMAGE_WIDTH, CARD_IMAGE_HEIGHT)

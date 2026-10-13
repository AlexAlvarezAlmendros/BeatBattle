import { musicalKeyName } from '@beatbattle/emails'
import { scoreText } from '../../media/ogKit'
import { type OgData, ogImagePath } from './og'

/**
 * Metadatos de las páginas compartibles (§2.15, §4.7.7; tarea 6.12): título, descripción, Open Graph,
 * Twitter, canonical y datos estructurados (`Event` para la semana, `MusicRecording` para una entrada
 * sellada) a partir de los mismos datos que su imagen OG, así que respetan el voto ciego igual que ella
 * (`RF-SHARE-04`): una entrada sin sellar dice «Escúchala y vota», nunca «Vota a X».
 */

export interface PageMeta {
  title: string
  description: string
  /** Ruta de la página (`/e/…`), para el canonical y `og:url`. */
  path: string
  image: string
  imageAlt: string
  type: 'website' | 'music.song' | 'profile'
  jsonLd: Record<string, unknown> | null
}

const SITE = 'Beat Battle'
const ORGANIZER = { '@type': 'Organization', name: 'Other People Records', url: 'https://www.otherpeople.es' }
const iso = (ms: number) => new Date(ms).toISOString()

/** `PT2M31S`. */
function isoDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `PT${Math.floor(total / 60)}M${total % 60}S`
}

const chips = (bpm: number | null, key: string | null) =>
  [bpm ? `${Math.round(bpm)} BPM` : null, key ? musicalKeyName(key) : null].filter(Boolean).join(' · ')

export function pageMeta(data: OgData, publicUrl: string): PageMeta {
  const image = `${publicUrl}${ogImagePath(data)}`
  switch (data.kind) {
    case 'week': {
      const path = `/semana/${data.slug}`
      const tail = chips(data.bpm, data.musicalKey)
      const description =
        data.phase === 'open'
          ? `Semana #${data.number} de ${SITE}: flipea «${data.sampleTitle}»${tail ? ` (${tail})` : ''} y súbelo antes del ${data.deadline}.`
          : data.phase === 'voting'
            ? `Semana #${data.number} de ${SITE}: escucha los flips de «${data.sampleTitle}» y vota hasta el ${data.deadline}.`
            : `Semana #${data.number} de ${SITE}: los flips de «${data.sampleTitle}» y su clasificación.`
      return {
        title: `Semana #${data.number}: «${data.sampleTitle}» · ${SITE}`,
        description,
        path,
        image,
        imageAlt: `Semana #${data.number} de ${SITE}: «${data.sampleTitle}»`,
        type: 'website',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: `${SITE} · Semana #${data.number}: «${data.sampleTitle}»`,
          description,
          startDate: iso(data.startsAt),
          endDate: iso(data.endsAt),
          eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
          eventStatus: 'https://schema.org/EventScheduled',
          location: { '@type': 'VirtualLocation', url: `${publicUrl}${path}` },
          image: [image],
          organizer: ORGANIZER,
        },
      }
    }
    case 'entry': {
      const path = `/e/${data.id}`
      const r = data.result
      const by = data.producer ? ` de ${data.producer}` : ` (${data.alias})`
      const description = r
        ? r.position
          ? `«${data.title}»${by}: ${r.position}.º en la semana #${data.weekNumber} de ${SITE} con ${scoreText(r.scoreMilli)}.`
          : `«${data.title}»${by}, un flip de «${data.sampleTitle}» en la semana #${data.weekNumber} de ${SITE}.`
        : `«${data.title}»${by}, un flip de «${data.sampleTitle}» en la semana #${data.weekNumber} de ${SITE}.${data.votingOpen ? ' Escúchala y vota.' : ''}`
      return {
        title: `«${data.title}»${data.producer ? ` · ${data.producer}` : ` · ${data.alias}`} · ${SITE}`,
        description,
        path,
        image,
        imageAlt: `Portada de «${data.title}»`,
        type: 'music.song',
        // Solo selladas (§2.15): antes, la autoría puede ser secreta.
        jsonLd:
          r && data.producer
            ? {
                '@context': 'https://schema.org',
                '@type': 'MusicRecording',
                name: data.title,
                byArtist: { '@type': 'Person', name: data.producer },
                url: `${publicUrl}${path}`,
                image,
                ...(data.durationMs ? { duration: isoDuration(data.durationMs) } : {}),
                description,
              }
            : null,
      }
    }
    case 'results': {
      const podium = data.podium
        .map((row) => `${row.position}.º «${row.title}»${row.producer ? ` de ${row.producer}` : ''}`)
        .join(', ')
      return {
        title: `Resultados de la semana #${data.number} · ${SITE}`,
        description: data.empty
          ? `Semana #${data.number} de ${SITE}: semana desierta.`
          : podium
            ? `Podio de la semana #${data.number} de ${SITE} («${data.sampleTitle}»): ${podium}.`
            : `Semana #${data.number} de ${SITE} («${data.sampleTitle}»): sin podio, nadie llegó a 3 votos.`,
        path: `/semana/${data.slug}/resultados`,
        image,
        imageAlt: `Podio de la semana #${data.number} de ${SITE}`,
        type: 'website',
        jsonLd: null,
      }
    }
    case 'profile':
      return {
        title: `${data.displayName} (@${data.username}) · ${SITE}`,
        description: `${data.displayName} en ${SITE}: ${data.weeks} ${data.weeks === 1 ? 'semana' : 'semanas'}, ${data.podiums} ${data.podiums === 1 ? 'podio' : 'podios'}${data.best ? `, mejor puesto ${data.best}.º` : ''}.`,
        path: `/p/${data.username}`,
        image,
        imageAlt: `Carta de ${data.displayName}`,
        type: 'profile',
        jsonLd: null,
      }
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Mete los metadatos en el `index.html` construido: el título, la descripción y el resto antes de `</head>`. */
export function injectMeta(html: string, meta: PageMeta, publicUrl: string): string {
  const url = `${publicUrl}${meta.path}`
  const tags = [
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`,
    // `<` escapado: un título con `</script>` no puede cerrar el bloque.
    meta.jsonLd
      ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>`
      : '',
  ]
    .filter(Boolean)
    .join('\n    ')
  // Con funciones: un `$&` en un título no es un patrón de sustitución.
  return html
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(meta.title)}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/,
      () => `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    )
    .replace('</head>', () => `    ${tags}\n  </head>`)
}

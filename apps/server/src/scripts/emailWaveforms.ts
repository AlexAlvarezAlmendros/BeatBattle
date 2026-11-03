/**
 * Las imágenes de ejemplo de la galería de emails (tareas 4.20, 4.13, 7.30 y 7.35): el QR del recibo, las cartas de
 * `season.wrap` (la carta sola del perfil, `card-<nombre>.png`) y el PNG de `GET /api/email/waveform` para los
 * ejemplos del recibo (con clip, como su pico real de +0,4 dBTP) y del audio sustituido (sin clip, −1,2
 * dBTP), con el mismo codificador que el servidor. Se guardan con el nombre de su versión (`v` de la URL
 * del ejemplo), que es lo que sirve `tools/shot/emails.mjs` al capturar.
 *
 *   pnpm --filter @beatbattle/server exec tsx src/scripts/emailWaveforms.ts <carpeta>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cardImagePng } from '../media/ogImages'
import { qrPng } from '../media/qrPng'
import { waveformPng } from '../media/waveformPng'

/** 1000 tramos `[mín, máx]` de un beat: golpes cada 1/32 y, si `clip`, cuatro que tocan el máximo. */
function peaks(clip: boolean): Int8Array {
  const out = new Int8Array(2000)
  for (let bin = 0; bin < 1000; bin++) {
    const phase = (bin % 31) / 31
    const level = Math.round(40 + 70 * (1 - phase) * (0.75 + 0.25 * Math.sin(bin / 37)))
    const peak = clip && bin % 250 === 0 ? 127 : Math.min(118, level)
    out[bin * 2] = -peak
    out[bin * 2 + 1] = peak
  }
  return out
}

const [dir = 'ondas'] = process.argv.slice(2)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'a1b2c3d4e5f6.png'), waveformPng(peaks(true)))
writeFileSync(join(dir, 'f6e5d4c3b2a1.png'), waveformPng(peaks(false)))
// El QR del ejemplo (4.13), a la ficha de la entrada del ejemplo.
writeFileSync(join(dir, 'qr.png'), qrPng('https://battle.otherpeople.es/e/7b0c6a0e'))
// Las cartas de los ejemplos de `season.wrap` (7.30): la carta sola del perfil (`/api/og/profile/:username/card.png`,
// 7.35), una por ejemplo y en su variante: la holo de `mar_beats`, la de campeón de `kairo.wav` y la estándar del
// jurado `oido.fino`. `tools/shot/emails.mjs` sirve `card-<nombre>.png` (y, si no está, `profile-card.png`).
const cards = [
  {
    username: 'mar_beats',
    weeks: 13,
    podiums: 7,
    card: {
      number: 42,
      initials: 'MB',
      level: 12,
      levelFraction: 0.4,
      rank: 'grooveArchitect',
      variant: 'holo',
      wins: 2,
    },
    showcase: ['win', 'golden_ear', 'streak_8'],
    achievements: 14,
  },
  {
    username: 'kairo.wav',
    weeks: 13,
    podiums: 11,
    card: {
      number: 7,
      initials: 'KA',
      level: 17,
      levelFraction: 0.7,
      rank: 'blockLegend',
      variant: 'champion',
      wins: 6,
    },
    showcase: ['season_champ', 'win_3', 'double'],
    achievements: 21,
  },
  {
    username: 'oido.fino',
    weeks: 0,
    podiums: 0,
    card: {
      number: 118,
      initials: 'OI',
      level: 6,
      levelFraction: 0.2,
      rank: 'sampler',
      variant: 'standard',
      wins: 0,
    },
    showcase: ['votes_100'],
    achievements: 5,
  },
] as const
for (const sample of cards) {
  const png = await cardImagePng({
    kind: 'profile',
    username: sample.username,
    displayName: sample.username,
    weeks: sample.weeks,
    podiums: sample.podiums,
    best: sample.card.wins ? 1 : null,
    card: {
      ...sample.card,
      since: '03/2026',
      showcase: [...sample.showcase],
      achievements: sample.achievements,
    },
  })
  writeFileSync(join(dir, `card-${sample.username}.png`), png)
  if (sample.username === 'mar_beats') writeFileSync(join(dir, 'profile-card.png'), png)
}
console.log('ondas en', dir)

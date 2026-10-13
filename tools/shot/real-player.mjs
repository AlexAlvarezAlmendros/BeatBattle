// La parte de navegador de la prueba real del reproductor (tarea 5.23, `apps/server/src/scripts/realPlayerCheck.ts`):
// carga la web en desarrollo, reproduce el MP3 firmado de Cloudinary con el reproductor global y mide que suena,
// que la ganancia se aplica, que el analizador lee el audio (y no con una entrada ciega, `RD-MOT-06`) y que la
// Media Session lleva sus datos. Uso: node tools/shot/real-player.mjs <web> <mp3 firmado>
import { chromium } from '@playwright/test'

const [web, streamUrl] = process.argv.slice(2)
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.addInitScript(() => localStorage.setItem('bb:title', 'off'))
await page.goto(`${web}/como-funciona`)
await page.mouse.click(5, 5)
const result = await page.evaluate(async (url) => {
  // La misma instancia que usa la página (tras un cambio en caliente, Vite la sirve con `?t=`).
  const loaded = (path) =>
    performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname + new URL(entry.name).search)
      .find((name) => name.startsWith(path)) ?? path
  const { usePlayer, playerElement } = await import(loaded('/src/features/player/store.ts'))
  const { audio } = await import(loaded('/src/audio/engine.ts'))
  const track = (blind) => ({
    id: blind ? 'prueba-ciega' : 'prueba',
    kind: 'entry',
    title: 'Prueba real 5.23',
    artist: 'Tigre Púrpura',
    streamUrl: url,
    durationMs: 30_000,
    gainDb: -6,
    artworkUrl: null,
    cover: null,
    peaks: null,
    blind,
    weekSlug: 'prueba',
  })
  const level = () => {
    const analyser = audio.musicAnalyser
    if (!analyser) return null
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    return data.reduce((sum, v) => sum + v, 0)
  }
  usePlayer.getState().play(track(false))
  await new Promise((r) => setTimeout(r, 4000))
  const el = playerElement()
  const open = {
    tiempo: el.currentTime,
    estado: usePlayer.getState().status,
    analizador: level(),
    volumen: el.volume,
  }
  const metadata = navigator.mediaSession?.metadata
  const session = metadata ? { titulo: metadata.title, artista: metadata.artist } : null
  usePlayer.getState().play(track(true))
  await new Promise((r) => setTimeout(r, 2000))
  const blind = { analizador: level(), suena: !playerElement().paused }
  usePlayer.getState().stop()
  return { open, session, blind }
}, streamUrl)
console.log('navegador:', JSON.stringify(result))
const ok =
  result.open.tiempo > 2 &&
  result.open.analizador > 0 &&
  result.session?.titulo === 'Prueba real 5.23' &&
  result.blind.analizador === null
console.log(ok ? 'OK' : 'FALLA')
await browser.close()
if (!ok) process.exit(1)

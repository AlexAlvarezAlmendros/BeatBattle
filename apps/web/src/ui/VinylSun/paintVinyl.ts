import { color, font } from '@beatbattle/shared/tokens'

/**
 * Pinta el vinilo-sol (el `vinyl()` de las maquetas, `final.js`): disco negro, trama roja que crece
 * hacia los surcos medios, surcos tenues, galleta roja con la semana y el tempo, y el agujero.
 */
export function paintVinyl(ctx: CanvasRenderingContext2D, size: number, label: string, sub: string): void {
  const center = size / 2
  const radius = size / 2
  const tau = Math.PI * 2
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = color.black
  ctx.beginPath()
  ctx.arc(center, center, radius - 1, 0, tau)
  ctx.fill()
  const cell = Math.max(5, size / 34)
  ctx.fillStyle = color.red
  for (let y = -radius; y <= radius; y += cell) {
    for (let x = -radius; x <= radius; x += cell) {
      const yy = y + ((Math.round(x / cell) % 2) * cell) / 2
      const distance = Math.hypot(x, yy) / radius
      if (distance > 0.97 || distance < 0.36) continue
      const wave = 0.6 + 0.4 * Math.cos(Math.atan2(yy, x) * 3 + distance * 8)
      const strength = Math.min(
        1,
        Math.max(0, 0.25 + 0.75 * (1 - Math.abs(distance - 0.7) / 0.34) ** 1.2 * wave),
      )
      ctx.beginPath()
      ctx.arc(center + x, center + yy, cell * 0.46 * strength, 0, tau)
      ctx.fill()
    }
  }
  ctx.strokeStyle = color.line
  ctx.lineWidth = 1
  for (let ring = 0.4; ring < 0.97; ring += 0.06) {
    ctx.beginPath()
    ctx.arc(center, center, radius * ring, 0, tau)
    ctx.stroke()
  }
  ctx.fillStyle = color.red
  ctx.beginPath()
  ctx.arc(center, center, radius * 0.32, 0, tau)
  ctx.fill()
  ctx.fillStyle = color.black
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `italic 900 ${Math.round(radius * 0.2)}px ${font.display}`
  ctx.fillText(label, center, center - radius * 0.1)
  ctx.font = `700 ${Math.max(7, Math.round(radius * 0.07))}px ${font.num}`
  ctx.fillText(sub, center, center + radius * 0.14)
  ctx.beginPath()
  ctx.arc(center, center + radius * 0.01, radius * 0.025, 0, tau)
  ctx.fill()
}

import { useEffect, useState } from 'react'
import { cx } from '../forceState'
import styles from './ProducerCard.module.css'

/** Margen de silencio alrededor del código, en módulos (ISO/IEC 18004, el mismo del QR del recibo). */
export const QR_QUIET_MODULES = 4

/** La matriz de un QR: `size × size`, con los módulos oscuros en `dark`. */
export interface QrMatrix {
  size: number
  dark: (x: number, y: number) => boolean
}

/**
 * La matriz del QR de `text` con `qrcode` (modo byte, Reed-Solomon y máscaras: la decisión del usuario del 2026-10-13
 * para el del recibo, §4.1), nivel de corrección M. La librería va en su propio trozo: se pide la primera vez que se
 * enseña un reverso, nunca con la primera pintura.
 */
export async function qrMatrix(text: string): Promise<QrMatrix> {
  const { default: QRCode } = await import('qrcode')
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  return { size: modules.size, dark: (x, y) => modules.get(y, x) === 1 }
}

/** El trazado SVG de los módulos oscuros, en unidades de módulo, ya desplazado por el margen de silencio. */
export function qrPath({ size, dark }: QrMatrix): string {
  const parts: string[] = []
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (dark(x, y)) parts.push(`M${x + QR_QUIET_MODULES} ${y + QR_QUIET_MODULES}h1v1h-1z`)
  return parts.join('')
}

/**
 * El QR del perfil en el reverso de la carta (§3.4.4): módulos negros sobre blanco con su margen de silencio, que es lo
 * que leen bien todas las cámaras aunque la carta sea oscura. Dibujo: lo que dice (la dirección del perfil) va escrito
 * al lado. Mientras se calcula, el cuadro blanco vacío.
 */
export function ProfileQr({ url, className }: { url: string; className?: string }) {
  const [matrix, setMatrix] = useState<{ url: string; path: string; side: number } | null>(null)
  useEffect(() => {
    let active = true
    void qrMatrix(url).then((found) => {
      if (active) setMatrix({ url, path: qrPath(found), side: found.size + 2 * QR_QUIET_MODULES })
    })
    return () => {
      active = false
    }
  }, [url])
  const ready = matrix?.url === url ? matrix : null
  return (
    <svg
      viewBox={ready ? `0 0 ${ready.side} ${ready.side}` : '0 0 1 1'}
      className={cx(styles.qr, className)}
      shapeRendering="crispEdges"
      focusable="false"
      aria-hidden="true"
      data-qr={ready ? 'ready' : 'pending'}
    >
      <rect width="100%" height="100%" className={styles.qrPaper} />
      {ready && <path d={ready.path} className={styles.qrInk} />}
    </svg>
  )
}

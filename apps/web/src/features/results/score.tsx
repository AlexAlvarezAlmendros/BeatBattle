import { formatNumber, t } from '../../i18n'
import styles from './score.module.css'

/** Cifras de un resultado sellado (§2.8): las comparten la página de resultados y la ficha (`RF-PLAY-08`). */

/** «4,21». */
export const scoreOf = (scoreMilli: number) =>
  formatNumber(scoreMilli / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Histograma de 5 barras (1 a 5 estrellas), con su lectura completa para los lectores de pantalla. */
export function MiniHistogram({ histogram }: { histogram: readonly number[] }) {
  const max = Math.max(1, ...histogram)
  const [one = 0, two = 0, three = 0, four = 0, five = 0] = histogram
  return (
    <span
      className={styles.histogram}
      role="img"
      aria-label={t('results.histogram', { one, two, three, four, five })}
    >
      {histogram.map((count, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: las cinco barras son fijas
          key={index}
          className={styles.bar}
          data-five={index === 4 || undefined}
          style={{ '--bar': count / max } as React.CSSProperties}
        />
      ))}
    </span>
  )
}

import type { ProfileHistoryRow } from '@beatbattle/shared'
import { useRef } from 'react'
import { t } from '../../i18n'
import { useElementWidth } from '../../ui/hooks/useElementWidth'
import styles from './ProfilePage.module.css'

/** Semanas de la gráfica: las últimas selladas en las que combatió (la maqueta `05-perfil` enseña doce). */
export const CHART_WEEKS = 12
/** Alto del dibujo (px): el de la maqueta. */
const CHART_H = 118
/** Margen dentro del dibujo, para que el rombo de los extremos no se corte. */
const PAD = 9

export interface ChartPoint {
  weekNumber: number
  position: number | null
}

/** Medio lado del rombo de cada semana (px). */
const MARK = 6

/** El rombo de una semana, centrado en `(cx, cy)`. */
const diamond = (cx: number, cy: number) =>
  `M${cx.toFixed(1)} ${(cy - MARK).toFixed(1)}l${MARK} ${MARK}l${-MARK} ${MARK}l${-MARK} ${-MARK}z`

/** Los puntos de la gráfica, de la semana más antigua a la más reciente (el historial llega al revés). */
export function chartPoints(history: readonly ProfileHistoryRow[]): ChartPoint[] {
  return history
    .slice(0, CHART_WEEKS)
    .map((row) => ({ weekNumber: row.weekNumber, position: row.position }))
    .reverse()
}

/** El puesto más bajo del eje: el peor de la gráfica, y como poco el 3.º (el podio siempre cabe). */
export const chartFloor = (points: readonly ChartPoint[]) =>
  Math.max(3, ...points.map((point) => point.position ?? 0))

/**
 * La gráfica de posiciones del perfil (§3.8.10; tarea 7.24): línea roja sobre rejilla, el 1.º arriba, las victorias en
 * rombo blanco y las demás en rombo negro; una semana sin clasificar corta la línea. Es un dibujo con su tabla para el
 * lector de pantalla (semana y puesto), y sus rótulos (los puestos del eje y las semanas) son texto de verdad, fuera
 * del dibujo y sobre panel (`RD-VIS-05`).
 */
export function PositionsChart({ history }: { history: readonly ProfileHistoryRow[] }) {
  const points = chartPoints(history)
  const boxRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(boxRef)
  const floor = chartFloor(points)
  const first = points[0]
  const last = points.at(-1)
  const w = Math.max(width, PAD * 4)
  const x = (index: number) =>
    points.length <= 1 ? w / 2 : PAD + (index * (w - 2 * PAD)) / (points.length - 1)
  const y = (position: number) => PAD + ((position - 1) * (CHART_H - 2 * PAD)) / Math.max(1, floor - 1)
  // La línea, partida donde una semana no clasificó.
  const segments: string[] = []
  let current = ''
  points.forEach((point, index) => {
    if (point.position === null) {
      if (current) segments.push(current)
      current = ''
      return
    }
    current += `${current ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point.position).toFixed(1)}`
  })
  if (current) segments.push(current)
  const mid = Math.round((1 + floor) / 2)

  return (
    <section className={styles.section} aria-labelledby="profile-chart">
      <div className={styles.sectionHead}>
        <h2 id="profile-chart" className={styles.sectionTitle}>
          {t('pages.profile.chart.title')}
        </h2>
        {first && last && (
          <span className="bb-label">
            {t('pages.profile.chart.range', { from: first.weekNumber, to: last.weekNumber })}
          </span>
        )}
      </div>
      {points.length === 0 ? (
        <div className={styles.chart}>
          <p className={styles.chartEmpty}>{t('pages.profile.chart.empty')}</p>
        </div>
      ) : (
        <div className={styles.chartFilled}>
          <div className={styles.chartPlot}>
            <div ref={boxRef} className={styles.chartBox}>
              {width > 0 && (
                <svg
                  viewBox={`0 0 ${w} ${CHART_H}`}
                  className={styles.chartSvg}
                  focusable="false"
                  aria-hidden="true"
                  data-chart=""
                >
                  {[1, mid, floor].map((position) => (
                    <line
                      key={position}
                      x1="0"
                      x2={w}
                      y1={y(position)}
                      y2={y(position)}
                      className={styles.chartGrid}
                    />
                  ))}
                  {segments.map((d) => (
                    <path key={d} d={d} className={styles.chartLine} />
                  ))}
                  {points.map((point, index) =>
                    point.position === null ? null : (
                      <path
                        // biome-ignore lint/suspicious/noArrayIndexKey: una semana por punto, en orden
                        key={index}
                        d={diamond(x(index), y(point.position))}
                        className={point.position === 1 ? styles.chartWin : styles.chartDot}
                        data-win={point.position === 1 || undefined}
                      />
                    ),
                  )}
                </svg>
              )}
            </div>
            <ul className={styles.chartAxis} aria-hidden="true">
              {[...new Set([1, mid, floor])].map((place) => (
                <li key={place}>{t('pages.profile.chart.place', { place })}</li>
              ))}
            </ul>
          </div>
          {first && last && (
            <p className={styles.chartWeeks} aria-hidden="true">
              <span>{t('pages.profile.history.week', { number: first.weekNumber })}</span>
              <span>{t('pages.profile.history.week', { number: last.weekNumber })}</span>
            </p>
          )}
          <table className="sr-only">
            <caption>{t('pages.profile.chart.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('pages.profile.chart.weekHead')}</th>
                <th scope="col">{t('pages.profile.chart.placeHead')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.weekNumber}>
                  <th scope="row">{t('pages.profile.history.week', { number: point.weekNumber })}</th>
                  <td>
                    {point.position === null
                      ? t('pages.profile.history.unranked')
                      : t('pages.profile.history.place', { place: point.position })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

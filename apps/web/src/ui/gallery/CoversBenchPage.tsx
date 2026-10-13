import { COVER_FAMILIES, type PaintedCover } from '@beatbattle/covers'
import { coverSeed } from '@beatbattle/rules'
import { MUSICAL_KEYS } from '@beatbattle/shared'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DocumentTitle } from '../../app/DocumentTitle'
import { formatNumber, t } from '../../i18n'
import { GenerativeCover } from '../CoverArt'
import styles from './CoversBenchPage.module.css'

/** Semillas por defecto (`RD-VIS-04`: 48 o más) y tope (la revisión manual de 200, §3.4.5). */
const DEFAULT_COUNT = 48
const MAX_COUNT = 200
/** Tolerancia del test de integridad (§3.4.5): ±5 % de la media. */
export const COVER_TOLERANCE = 0.05

interface Measured {
  red: number
  lum: number
  ms: number
  family: string
  passes: number
}

/** La entrada de muestra `index`: semilla como la de una entrada real, y BPM y tonalidad que varían. */
function sample(index: number) {
  return {
    seed: coverSeed(`entrada-${index}`),
    bpm: 70 + ((index * 7) % 110),
    musicalKey: MUSICAL_KEYS[index % MUSICAL_KEYS.length],
  }
}

const percent = (value: number) => `${formatNumber(Math.round(value * 1000) / 10)}\u00a0%`

/**
 * `/dev/portadas` — banco de las portadas generativas (guía §3.4.5, `RD-VIS-04`; tarea 4.11). Solo en
 * desarrollo. Pinta `?n=` portadas (48 por defecto, hasta 200 para la revisión manual) por CPU y mide cada
 * una: proporción de rojo y luminancia media, con la peor desviación respecto a la media. El E2E
 * `covers.spec.ts` lee las medidas de los atributos `data-*` de cada portada.
 */
export function CoversBenchPage() {
  const [params] = useSearchParams()
  const count = Math.min(MAX_COUNT, Math.max(1, Number(params.get('n')) || DEFAULT_COUNT))
  const samples = useMemo(() => Array.from({ length: count }, (_, index) => sample(index)), [count])
  const [measured, setMeasured] = useState<Record<number, Measured>>({})
  const onPainted = useCallback((index: number, painted: PaintedCover, ms: number) => {
    setMeasured((previous) => ({
      ...previous,
      [index]: {
        ...painted.stats,
        ms,
        passes: painted.passes,
        family: COVER_FAMILIES[painted.spec.family] ?? '',
      },
    }))
  }, [])

  const done = Object.values(measured)
  const summary =
    done.length === count
      ? (() => {
          const mean = (key: 'red' | 'lum') => done.reduce((sum, item) => sum + item[key], 0) / done.length
          const red = mean('red')
          const lum = mean('lum')
          const worst = (key: 'red' | 'lum', avg: number) =>
            Math.max(...done.map((item) => Math.abs(item[key] - avg) / avg))
          return {
            red,
            lum,
            worstRed: worst('red', red),
            worstLum: worst('lum', lum),
            ms: done.reduce((sum, item) => sum + item.ms, 0) / done.length,
          }
        })()
      : null
  const pass = summary ? summary.worstRed <= COVER_TOLERANCE && summary.worstLum <= COVER_TOLERANCE : null

  return (
    <div className={styles.bench}>
      <DocumentTitle page={t('dev.covers.title')} />
      <p className={styles.intro}>{t('dev.covers.intro', { count })}</p>
      <p
        className={styles.summary}
        aria-live="polite"
        data-covers-summary=""
        data-pass={pass === null ? undefined : String(pass)}
      >
        {summary
          ? t('dev.covers.summary', {
              red: percent(summary.red),
              lum: percent(summary.lum),
              worstRed: percent(summary.worstRed),
              worstLum: percent(summary.worstLum),
              ms: formatNumber(Math.round(summary.ms)),
              verdict: t(pass ? 'dev.covers.pass' : 'dev.covers.fail'),
            })
          : t('dev.covers.painting', { done: done.length, count })}
      </p>
      <ol className={styles.grid}>
        {samples.map((item, index) => {
          const m = measured[index]
          return (
            <li
              key={item.seed}
              className={styles.item}
              data-cover-index={index}
              data-red={m?.red}
              data-lum={m?.lum}
              data-ms={m?.ms}
              data-family={m?.family}
              data-passes={m?.passes}
            >
              <GenerativeCover
                seed={item.seed}
                bpm={item.bpm}
                musicalKey={item.musicalKey}
                className={styles.cover}
                onPainted={(painted, ms) => onPainted(index, painted, ms)}
              />
              <span className={styles.label}>
                {m ? `${m.family} · ${item.musicalKey} · ${item.bpm}` : formatNumber(index + 1)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

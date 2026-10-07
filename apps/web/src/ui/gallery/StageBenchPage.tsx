import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DocumentTitle } from '../../app/DocumentTitle'
import { t } from '../../i18n'
import { type BurstKind, stageBurst, useStageRuntime } from '../../stage/runtime'
import { Button } from '../Button'
import { Frame } from '../Frame'
import { VinylSun } from '../VinylSun'
import styles from './StageBenchPage.module.css'

/** Banco: ráfagas de confeti tan grandes que el anillo se llena (4.000 vivas con la calidad alta). */
const BENCH_COUNT = 1400
/** Una ráfaga cada ~340 ms: las 3 por segundo que deja el limitador. */
const BENCH_EVERY_MS = 340

type Status = 'idle' | 'granted' | 'denied' | 'offline'

/**
 * `/dev/escenario` — banco del Escenario (guía §3.5 capas 1 y 2, tareas 1.3 y 1.11). Solo en desarrollo.
 * El vinilo-sol de la semana como **vista anclada** en la arena abierta (sin panel encima) y ráfagas de
 * chispas y confeti, siempre por el limitador de destellos. `?banco` lanza ráfagas sin parar para medir
 * con `tools/shot/bench.mjs` la arena, el vinilo y 4.000 partículas a la vez.
 */
export function StageBenchPage() {
  const [params] = useSearchParams()
  const target = useRef<HTMLDivElement>(null)
  const [bench, setBench] = useState(() => params.has('banco'))
  const [status, setStatus] = useState<Status>('idle')
  const running = useStageRuntime((state) => state.running)

  const burst = (kind: BurstKind, count?: number) => {
    const box = target.current?.getBoundingClientRect()
    if (!box) return
    if (!useStageRuntime.getState().running) {
      setStatus('offline')
      return
    }
    const grant = stageBurst({
      kind,
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      reason: kind === 'sparks' ? 'vote' : 'ceremony',
      count,
      area: 0.25,
    })
    setStatus(grant ? 'granted' : 'denied')
  }
  const burstRef = useRef(burst)
  burstRef.current = burst

  useEffect(() => {
    if (!bench || !running) return
    let turn = 0
    const timer = window.setInterval(() => {
      burstRef.current(turn++ % 4 === 3 ? 'sparks' : 'confetti', BENCH_COUNT)
    }, BENCH_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [bench, running])

  return (
    <div className={styles.page}>
      <DocumentTitle page={t('dev.stage.title')} />
      <h1 className="sr-only">{t('dev.stage.title')}</h1>
      <div className={styles.arena}>
        <VinylSun
          className={styles.vinyl}
          label={t('dev.stage.vinylLabel')}
          sub={t('dev.stage.vinylSub')}
          bpm={92}
          stage
        />
        <div ref={target} className={styles.target} data-burst-target="" />
      </div>
      <Frame as="section" className={styles.panel} aria-labelledby="stage-bench-title">
        <h2 id="stage-bench-title" className="bb-label">
          {t('dev.stage.controls')}
        </h2>
        <p className={styles.intro}>{t('dev.stage.intro')}</p>
        <div className={styles.buttons}>
          <Button onClick={() => burst('sparks')}>{t('dev.stage.sparks')}</Button>
          <Button onClick={() => burst('confetti')}>{t('dev.stage.confetti')}</Button>
          <Button variant="outline" onClick={() => setBench((value) => !value)} aria-pressed={bench}>
            {t(bench ? 'dev.stage.benchStop' : 'dev.stage.benchStart')}
          </Button>
        </div>
        <p className={styles.status} aria-live="polite" data-burst-status={status}>
          {status === 'idle' ? '' : t(`dev.stage.status.${status}`)}
        </p>
      </Frame>
    </div>
  )
}

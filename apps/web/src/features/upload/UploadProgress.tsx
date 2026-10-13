import type { OwnEntry } from '@beatbattle/shared'
import { useEffect, useState } from 'react'
import { paths } from '../../app/paths'
import { audio } from '../../audio/engine'
import { formatDuration, formatNumber, t } from '../../i18n'
import { Announcer } from '../../ui/Announcer'
import { Button } from '../../ui/Button'
import { GenerativeCover } from '../../ui/CoverArt/GenerativeCover'
import { Frame } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { Meter } from '../../ui/Meter'
import styles from './UploadProgress.module.css'

const MB = 1024 * 1024
const mb = (bytes: number) => formatNumber(bytes / MB, { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/**
 * El medidor de súper (§3.8.5; tarea 4.16): los bytes reales, la velocidad, el tiempo restante y «Cancelar
 * [Esc]», que aborta la subida (`RF-ENT-07`). El porcentaje en cifra grande es el equivalente visual de
 * `upload.progress` (`RNF-A11Y-05`). Al final, mientras el servidor verifica y mide, lo dice.
 */
export function UploadMeter({
  sent,
  total,
  speed,
  remaining,
  registering,
  onCancel,
}: {
  sent: number
  total: number
  speed: number | null
  remaining: number | null
  registering: boolean
  onCancel: () => void
}) {
  useEffect(() => {
    if (registering) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [registering, onCancel])

  const pct = total > 0 ? Math.min(100, Math.floor((sent / total) * 100)) : 0
  return (
    <Frame as="section" variant="stage" cut="lg" texture={false} className={styles.meter} aria-busy="true">
      <h2 className={cx('bb-label', styles.label)}>
        {registering ? t('pages.upload.progress.registering') : t('pages.upload.progress.title')}
      </h2>
      <p className={styles.pct} aria-hidden="true">
        {registering ? '100' : pct}
        <span className={styles.pctUnit}>%</span>
      </p>
      <Meter
        role="progressbar"
        value={registering ? total : sent}
        max={Math.max(1, total)}
        label={t('pages.upload.progress.title')}
        valueText={t('pages.upload.progress.valueText', { pct: registering ? 100 : pct })}
        caption={{
          start: t('pages.upload.progress.bytes', { sent: mb(registering ? total : sent), total: mb(total) }),
          end:
            registering || speed === null
              ? undefined
              : t('pages.upload.progress.speed', {
                  speed: mb(speed),
                  remaining: remaining === null ? '—' : formatDuration(Math.ceil(remaining)),
                }),
        }}
      />
      {!registering && (
        <div className={styles.actions}>
          <Button variant="outline" onClick={onCancel} keyHint={t('frame.keys.glyph.escape')}>
            {t('pages.upload.progress.cancel')}
          </Button>
        </div>
      )}
    </Frame>
  )
}

/** Cuánto tarda el anunciador en estampar tras el final de la subida (Anexo E: `ann.newbeat` a 1,5 s). */
export const NEW_BEAT_IMPACT_MS = 1500

/**
 * La celebración (§3.8.5; tarea 4.16): el anunciador «¡NUEVO BEAT EN LA BATALLA!» con `ann.newbeat`, la
 * portada generativa con el alias («Así te verán hasta el domingo…») y «Ya estás en la batalla #41». Sin
 * movimiento, todo de una vez y sin estampado. Si la entrada aún se está midiendo, lo dice (el recibo llega
 * cuando termine).
 */
export function UploadCelebration({ entry, weekNumber }: { entry: OwnEntry; weekNumber: number }) {
  const reduced = useReducedMotion()
  const [impact, setImpact] = useState(reduced)
  useEffect(() => {
    if (reduced) return
    const timer = window.setTimeout(() => {
      setImpact(true)
      audio.play('ann.newbeat')
    }, NEW_BEAT_IMPACT_MS)
    return () => window.clearTimeout(timer)
  }, [reduced])

  return (
    <Frame as="section" variant="stage" cut="lg" texture={false} className={styles.done}>
      <div className={styles.announcerSlot}>
        {impact && <Announcer text={t('pages.upload.done.announcer')} />}
      </div>
      <div className={styles.fighter}>
        <div className={styles.cover}>
          <GenerativeCover
            seed={entry.cover.kind === 'generative' ? entry.cover.seed : entry.id}
            bpm={entry.bpm}
            musicalKey={entry.musicalKey}
          />
        </div>
        <div className={styles.who}>
          <p className={cx('bb-display', styles.alias)}>{entry.alias}</p>
          <p className={styles.text}>{t('pages.upload.done.alias', { alias: entry.alias.toUpperCase() })}</p>
          <p className={styles.inside}>{t('pages.upload.done.inside', { number: weekNumber })}</p>
          <p className={styles.text}>
            {entry.status === 'processing'
              ? t('pages.upload.done.processing')
              : t('pages.upload.done.receipt')}
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <Button to={paths.entry(entry.id)} variant="cta">
          {t('pages.upload.done.view')}
        </Button>
        <Button to={paths.home()} variant="outline">
          {t('pages.upload.done.menu')}
        </Button>
      </div>
    </Frame>
  )
}

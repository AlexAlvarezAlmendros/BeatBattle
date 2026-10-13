import type { OwnEntry } from '@beatbattle/shared'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useControlKeys } from '../../app/layout/screen'
import { paths } from '../../app/paths'
import { audio } from '../../audio/engine'
import { formatDuration, formatNumber, t } from '../../i18n'
import { Trans } from '../../i18n/Trans'
import { Announcer } from '../../ui/Announcer'
import { announce, ensureAnnouncer } from '../../ui/announce'
import { Button } from '../../ui/Button'
import { GenerativeCover } from '../../ui/CoverArt/GenerativeCover'
import { Frame } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { Meter } from '../../ui/Meter'
import styles from './UploadProgress.module.css'

const MB = 1024 * 1024
const mb = (bytes: number) => formatNumber(bytes / MB, { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** Lleva la vista y el foco a `element` al montarse: el panel nuevo sustituye a uno más largo (la hoja). */
function useArrive(element: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = element.current
    if (!node) return
    // Primero el bloque a la vista (en el móvil la hoja dejaba la página desplazada al pie; `nearest` no
    // desplaza si ya se ve, y así no recorta el HUD) y después el foco, sin que el navegador vuelva a desplazar.
    node.closest('section')?.scrollIntoView?.({ block: 'nearest' })
    node.focus({ preventScroll: true })
  }, [element])
}

/** Cuartos del progreso que se anuncian al lector de pantalla (como la descarga del sample, acta F3 A4). */
const QUARTERS = [25, 50, 75] as const

/**
 * El medidor de súper (§3.8.5; tarea 4.16): los bytes reales, la velocidad, el tiempo restante y «Cancelar
 * [Esc]», que aborta la subida (`RF-ENT-07`). El porcentaje en cifra grande es el equivalente visual de
 * `upload.progress` (`RNF-A11Y-05`). Al final, mientras el servidor verifica y mide, lo dice. Al llegar, la
 * vista sube al medidor y el foco va a «Cancelar»; el lector oye el comienzo, los cuartos y la verificación,
 * y la barra cambia «ESC VOLVER» por «ESC CANCELAR» (jurado de la 4.20: J1, J8, A4, A5 y A7).
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
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useArrive(cancelRef)
  // Al pasar a verificar, «Cancelar» desaparece: el foco va al título del medidor en vez de caer en
  // `<body>` (jurado de la 4.20, A12).
  useEffect(() => {
    if (registering) titleRef.current?.focus({ preventScroll: true })
  }, [registering])
  useControlKeys(registering ? ['sound'] : ['cancel', 'sound'])

  const pct = total > 0 ? Math.min(100, Math.floor((sent / total) * 100)) : 0
  const said = useRef(0)
  useEffect(() => {
    ensureAnnouncer()
    announce(t('pages.upload.progress.started'))
  }, [])
  useEffect(() => {
    const quarter = QUARTERS.filter((q) => pct >= q).at(-1) ?? 0
    if (registering || quarter <= said.current) return
    said.current = quarter
    announce(t('pages.upload.progress.valueText', { pct: quarter }))
  }, [pct, registering])
  useEffect(() => {
    if (registering) announce(t('pages.upload.progress.registering'))
  }, [registering])

  // Esc cancela mientras sube. Mientras se verifica ya no se puede cancelar, pero tampoco se sale al menú: la
  // entrada se está creando y la persona perdería la celebración y su alias (A12).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (registering) announce(t('pages.upload.progress.registering'))
      else onCancel()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [registering, onCancel])

  return (
    <Frame as="section" variant="stage" cut="lg" texture={false} className={styles.meter}>
      <h2 ref={titleRef} tabIndex={-1} data-focus-target="heading" className={cx('bb-label', styles.label)}>
        {registering ? t('pages.upload.progress.registering') : t('pages.upload.progress.title')}
      </h2>
      <p className={styles.pct} aria-hidden="true">
        {registering ? '100' : pct}
        <span className={styles.pctUnit}>%</span>
      </p>
      <Meter
        size="super"
        instant={registering}
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
          <Button ref={cancelRef} variant="outline" onClick={onCancel} keyHint={t('frame.keys.glyph.escape')}>
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
 *
 * Al llegar, la vista sube a la celebración y el foco va al alias, su título (en el móvil la hoja dejaba la
 * página al pie). El anunciador va en una franja que cruza el panel, al cuerpo del contador, y el lector lo
 * oye por la región compartida, que ya está en el árbol (una región que se monta llena no siempre se
 * anuncia). La única acción es «Ver mi entrada»: el pie del panel ya lleva «Volver al menú [Esc]» (jurado
 * de la 4.20: J1, J6, J7, A1).
 */
export function UploadCelebration({ entry, weekNumber }: { entry: OwnEntry; weekNumber: number }) {
  const reduced = useReducedMotion()
  const [impact, setImpact] = useState(reduced)
  const aliasRef = useRef<HTMLHeadingElement>(null)
  useArrive(aliasRef)
  useEffect(() => {
    ensureAnnouncer()
    if (reduced) {
      announce(t('pages.upload.done.announcer'))
      return
    }
    const timer = window.setTimeout(() => {
      setImpact(true)
      audio.play('ann.newbeat')
      announce(t('pages.upload.done.announcer'))
    }, NEW_BEAT_IMPACT_MS)
    return () => window.clearTimeout(timer)
  }, [reduced])

  return (
    <Frame as="section" variant="stage" cut="lg" texture={false} className={styles.done}>
      <div className={styles.announcerSlot} data-impact={impact || undefined}>
        <div className={styles.announcerBox}>
          {impact && (
            <Announcer className={styles.announcer} text={t('pages.upload.done.announcer')} silent />
          )}
        </div>
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
          <h2
            ref={aliasRef}
            tabIndex={-1}
            data-focus-target="heading"
            className={cx('bb-display', styles.alias)}
          >
            {entry.alias}
          </h2>
          <p className={cx(styles.text, styles.aliasNote)}>
            {t('pages.upload.done.alias', { alias: entry.alias.toUpperCase() })}
          </p>
          <p className={styles.inside}>
            <Trans
              k="pages.upload.done.inside"
              values={{ number: <span className={styles.insideNumber}>{weekNumber}</span> }}
            />
          </p>
          <p className={cx(styles.text, styles.receiptNote)}>
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
      </div>
    </Frame>
  )
}

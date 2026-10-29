import { useEffect, useState } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import styles from './ProducerCard.module.css'

/** Lado del PNG que sirve el servidor (`qrPng`: 6 px por módulo con el margen de silencio), para reservar su sitio. */
const QR_PX = 246

/**
 * El QR del perfil en el reverso de la carta (§3.4.4, §4.10; tarea 7.22): el PNG de `GET /api/profiles/:username/qr.png`,
 * que pinta el servidor con `qrcode` (que solo vive allí, §4.1) y su codificador propio: módulos negros sobre blanco con
 * el margen de silencio, lo que mejor leen las cámaras aunque la carta sea oscura. Mientras llega, el papel blanco vacío;
 * si no llega, el papel con «QR no disponible» (la dirección del perfil va escrita al lado de todos modos).
 */
export function ProfileQr({ src, name, className }: { src: string; name: string; className?: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  // biome-ignore lint/correctness/useExhaustiveDependencies: otra imagen, otra carga
  useEffect(() => setState('loading'), [src])
  return (
    <span className={cx(styles.qr, className)} data-qr={state}>
      {state === 'error' ? (
        <span className={styles.qrFallback}>{t('ui.producerCard.qrUnavailable')}</span>
      ) : (
        <img
          src={src}
          alt={t('ui.producerCard.qrAlt', { name })}
          width={QR_PX}
          height={QR_PX}
          loading="lazy"
          decoding="async"
          className={styles.qrImage}
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
        />
      )}
    </span>
  )
}

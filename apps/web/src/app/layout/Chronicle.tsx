import { loop } from '@beatbattle/shared/tokens'
import { type FocusEvent, type ReactNode, useEffect, useState } from 'react'
import { t } from '../../i18n'
import { Trans } from '../../i18n/Trans'
import { frameAttributes } from '../../ui/Frame'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { Icon } from '../../ui/Icon'
import styles from './Chronicle.module.css'

/**
 * Crónica de la arena (guía §3.8.3; la pieza propia que sustituye al teletipo, §3.1): una
 * línea en el hueco derecho de la barra de controles que cambia de mensaje cada 5 s por fundido
 * (`--bb-loop-chronicle`). En voto ciego nunca dice quién ha subido (§1.3): solo hechos de la semana.
 *
 * - **Pausa** (WCAG 2.2.2, contenido que se actualiza solo): un botón de 44 px con `aria-pressed`
 *   («Pausar la crónica») la deja quieta hasta que se vuelve a pulsar; además se para sola con el ratón
 *   encima y con el foco dentro (teclado). Con «reducir movimiento» los bucles se paran (§3.6): se queda
 *   el primer mensaje y no hay botón.
 * - No es una región viva (`aria-live="off"`): cambiar cada 5 s no se anuncia; quien lo recorre lee el
 *   mensaje del momento.
 */
export function Chronicle({ messages, label }: { messages: readonly ReactNode[]; label: string }) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [held, setHeld] = useState(false)
  const canRotate = !reduced && messages.length > 1
  const rotates = canRotate && !hovered && !focused && !held

  useEffect(() => {
    if (!rotates) return
    const timer = setInterval(() => setIndex((current) => (current + 1) % messages.length), loop.chronicle)
    return () => clearInterval(timer)
  }, [rotates, messages.length])

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)))
      setFocused(false)
  }

  const current = messages[index % Math.max(1, messages.length)] ?? ''
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: no es interactivo; solo escucha el ratón y el foco para pausar la rotación (WCAG 2.2.2)
    <div
      className={styles.wrap}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      <p className={styles.chronicle} aria-live="off" data-chronicle="" data-static={reduced || undefined}>
        <span className="sr-only">{label}: </span>
        <span key={index} className={styles.message}>
          {current}
        </span>
      </p>
      {canRotate && (
        <button
          type="button"
          {...frameAttributes({ cut: 'sm' })}
          className={styles.pause}
          aria-pressed={held}
          aria-label={t('frame.controls.chroniclePause')}
          onClick={() => setHeld((value) => !value)}
          data-chronicle-pause=""
        >
          <Icon name={held ? 'play' : 'pause'} />
        </button>
      )}
    </div>
  )
}

/**
 * «Inserta tu beat · Crédito 01» (§3.8.3), el guiño a «INSERT COIN / CREDIT 01» de las recreativas: en
 * caja mixta, con el crédito en Oxanium rojo y «Inserta tu beat» respirando (2 s; quieto sin
 * movimiento). Con la entrada ya subida, «Crédito 00 · ya estás dentro».
 */
export function CreditLine({ inside }: { inside: boolean }) {
  const credit = <em>{t('home.chronicle.credit', { count: inside ? '00' : '01' })}</em>
  return (
    <span className={styles.credit} data-credit="">
      {inside ? (
        <Trans k="home.chronicle.inside" values={{ credit }} />
      ) : (
        <Trans
          k="home.chronicle.insert"
          values={{
            action: <b className={styles.breathe}>{t('home.chronicle.insertAction')}</b>,
            credit,
          }}
        />
      )}
    </span>
  )
}

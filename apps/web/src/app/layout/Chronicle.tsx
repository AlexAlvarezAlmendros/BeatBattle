import { loop } from '@beatbattle/shared/tokens'
import { type FocusEvent, type ReactNode, useEffect, useState } from 'react'
import { t } from '../../i18n'
import { Trans } from '../../i18n/Trans'
import { frameAttributes } from '../../ui/Frame'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { Icon } from '../../ui/Icon'
import { useLoops } from '../../ui/loops'
import styles from './Chronicle.module.css'

/**
 * Crónica de la arena (guía §3.8.3; la pieza propia que sustituye al teletipo, §3.1): una
 * línea en el hueco derecho de la barra de controles que cambia de mensaje cada 5 s por fundido
 * (`--bb-loop-chronicle`). En voto ciego nunca dice quién ha subido (§1.3): solo hechos de la semana.
 *
 * - **Pausa** (WCAG 2.2.2, contenido que se mueve o se actualiza solo): un botón de 44 px con
 *   `aria-pressed` («Pausar las animaciones») deja quietos la crónica y todos los bucles decorativos de
 *   la pantalla (el vinilo-sol, el respiro de «Inserta tu beat», el latido del reloj; `ui/loops.ts`)
 *   hasta que se vuelve a pulsar. La crónica se para además sola con el ratón encima y con el foco
 *   dentro (teclado). El botón está si hay algo que pausar: más de un mensaje o, con `loops`, otros
 *   bucles en la pantalla. Con «reducir movimiento» los bucles ya están parados (§3.6): se queda el
 *   primer mensaje y no hay botón.
 * - No es una región viva (`aria-live="off"`): cambiar cada 5 s no se anuncia; quien lo recorre lee el
 *   mensaje del momento.
 */
export function Chronicle({
  messages,
  label,
  loops = false,
}: {
  messages: readonly ReactNode[]
  label: string
  /** La pantalla tiene otros bucles decorativos (el vinilo, el respiro, el reloj) que el botón para. */
  loops?: boolean
}) {
  const reduced = useReducedMotion()
  const paused = useLoops((state) => state.paused)
  const togglePaused = useLoops((state) => state.toggle)
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const canRotate = !reduced && messages.length > 1
  const rotates = canRotate && !hovered && !focused && !paused
  const canPause = !reduced && (messages.length > 1 || loops)

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
      {canPause && (
        <button
          type="button"
          {...frameAttributes({ cut: 'sm' })}
          className={styles.pause}
          aria-pressed={paused}
          aria-label={t('frame.controls.loopsPause')}
          onClick={togglePaused}
          data-chronicle-pause=""
        >
          <Icon name={paused ? 'play' : 'pause'} />
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

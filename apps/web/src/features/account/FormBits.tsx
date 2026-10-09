import { type ReactNode, useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { Icon } from '../../ui/Icon'
import { Meter } from '../../ui/Meter'
import styles from './FormBits.module.css'
import { type PasswordStrength, passwordStrength } from './passwordStrength'

/*
 * Piezas comunes de los formularios de cuenta (§2.3, §3.2 «Estados»): las usan las pantallas de acceso
 * (tarea 2.15) y Ajustes → Cuenta (tarea 2.16).
 */

/**
 * Aviso de papel (§3.2 «Estados»): blanco con texto negro e icono de alerta. Por defecto se anuncia al
 * salir (`role="alert"`); `live={false}` para un aviso fijo de la página (que no debe anunciarse al cargar).
 */
export function PaperNotice({
  children,
  action,
  live = true,
}: {
  children: ReactNode
  action?: ReactNode
  live?: boolean
}) {
  return (
    <div className={styles.paper} role={live ? 'alert' : undefined}>
      <Icon name="alert" className={styles.paperIcon} />
      <div>
        <p>{children}</p>
        {action}
      </div>
    </div>
  )
}

/**
 * Éxito (§3.2): check y texto. Al aparecer recibe el foco (jurado de la 2.25, WCAG 2.4.3 y 4.1.3): suele
 * sustituir al formulario o al control que se acaba de usar, que desaparece; con el foco aquí, el lector lo
 * lee y el teclado no vuelve al principio de la página. Una región viva que se monta ya llena no siempre se
 * anuncia.
 */
export function Done({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <p ref={ref} className={styles.done} tabIndex={-1} data-focus-target="done">
      <Icon name="check" className={styles.doneIcon} />
      <span>{children}</span>
    </p>
  )
}

/** Medidor de fortaleza (`zxcvbn-ts`, diferido): el medidor segmentado del juego con su valor en texto. */
export function StrengthMeter({ password, userInputs }: { password: string; userInputs: string[] }) {
  const [strength, setStrength] = useState<PasswordStrength | null>(null)
  const inputsKey = userInputs.join('|')
  // biome-ignore lint/correctness/useExhaustiveDependencies: `inputsKey` resume `userInputs`
  useEffect(() => {
    let active = true
    if (!password) {
      setStrength(null)
      return
    }
    const timer = window.setTimeout(() => {
      void passwordStrength(password, userInputs).then((result) => active && setStrength(result))
    }, 150)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [password, inputsKey])
  if (!password) return null
  const level = strength ? t(`account.strength.levels.score${strength.score}`) : t('account.strength.loading')
  return (
    <div className={styles.strength}>
      <Meter
        value={strength ? strength.score + 1 : 0}
        max={5}
        label={t('account.strength.label')}
        valueText={level}
        caption={{ start: `${t('account.strength.label')} · ${level}` }}
      />
      {strength?.warning && <p className={styles.strengthWarning}>{strength.warning}</p>}
    </div>
  )
}

/**
 * Tras una validación local fallida, el foco al primer campo con error del formulario (jurado de la 2.25,
 * WCAG 3.3.1): el error se lee con el campo (`aria-describedby`) aunque quede lejos del botón de enviar.
 * Va al fotograma siguiente, cuando React ya ha pintado los errores.
 */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}

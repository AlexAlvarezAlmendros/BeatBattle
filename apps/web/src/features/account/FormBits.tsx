import { type ReactNode, useEffect, useState } from 'react'
import { t } from '../../i18n'
import { Icon } from '../../ui/Icon'
import { Meter } from '../../ui/Meter'
import styles from './FormBits.module.css'
import { type PasswordStrength, passwordStrength } from './passwordStrength'

/*
 * Piezas comunes de los formularios de cuenta (§2.3, §3.2 «Estados»): las usan las pantallas de acceso
 * (tarea 2.15) y Ajustes → Cuenta (tarea 2.16).
 */

/** Aviso de papel (§3.2 «Estados»): blanco con texto negro e icono de alerta; se anuncia al salir. */
export function PaperNotice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.paper} role="alert">
      <Icon name="alert" className={styles.paperIcon} />
      <div>
        <p>{children}</p>
        {action}
      </div>
    </div>
  )
}

/** Éxito (§3.2): check y texto. */
export function Done({ children }: { children: ReactNode }) {
  return (
    <p className={styles.done} role="status">
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

import { type InputHTMLAttributes, type ReactNode, type Ref, useId, useState } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import { Icon } from '../Icon'
import styles from './TextField.module.css'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'children'> {
  label: string
  /** Ayuda debajo del campo (formato, qué pasa con el dato). */
  hint?: ReactNode
  /** El motivo del error, en texto (§3.2 «Estados»): borde blanco de 3 px, icono y el motivo. */
  error?: string | null
  /** Contraseña: añade el botón «Ver / Ocultar» (pegar está permitido, §2.3). */
  revealable?: boolean
  /** Algo debajo de la ayuda (el medidor de fortaleza de la contraseña). */
  below?: ReactNode
  ref?: Ref<HTMLInputElement>
}

/**
 * Campo de texto de los formularios (guía §3.8.14: «campos normales y accesibles en paneles opacos»; tarea
 * 2.15). Etiqueta siempre visible encima, el campo a todo lo ancho con 44 px de alto, la ayuda debajo y, si
 * hay error, el motivo en texto con su icono y el borde blanco de 3 px (nunca solo color, §3.2). El foco es
 * el de fuera de los menús: contorno blanco y halo rojo (`global.css`).
 */
export function TextField({
  label,
  hint,
  error,
  revealable = false,
  below,
  className,
  type = 'text',
  ref,
  ...rest
}: TextFieldProps) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx(styles.field, className)} data-invalid={error ? '' : undefined}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          {...rest}
          ref={ref}
          id={id}
          type={revealable && revealed ? 'text' : type}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {revealable && (
          <button
            type="button"
            className={styles.reveal}
            aria-pressed={revealed}
            aria-label={revealed ? t('ui.field.hide', { label }) : t('ui.field.show', { label })}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? t('ui.field.hideShort') : t('ui.field.showShort')}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          <Icon name="alert" className={styles.errorIcon} />
          <span>{error}</span>
        </p>
      )}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {below}
    </div>
  )
}

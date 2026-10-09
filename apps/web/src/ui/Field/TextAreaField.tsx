import { type Ref, type TextareaHTMLAttributes, useId } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import { Icon } from '../Icon'
import styles from './TextField.module.css'

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'> {
  label: string
  hint?: string
  error?: string | null
  /** Con `maxLength`, el contador «48 / 160» debajo (se anuncia al acercarse al tope). */
  value: string
  ref?: Ref<HTMLTextAreaElement>
}

/**
 * Campo de varias líneas (la bio del perfil, §2.3; tarea 2.18), con la misma etiqueta, ayuda y error que
 * `TextField` y, si tiene `maxLength`, un contador de caracteres.
 */
export function TextAreaField({
  label,
  hint,
  error,
  className,
  value,
  maxLength,
  rows = 3,
  ref,
  ...rest
}: TextAreaFieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const countId = maxLength ? `${id}-count` : undefined
  const describedBy =
    [errorId, hintId, countId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined
  const near = maxLength !== undefined && value.length >= maxLength - 10
  return (
    <div className={cx(styles.field, className)} data-invalid={error ? '' : undefined}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <textarea
        {...rest}
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        className={cx(styles.input, styles.textarea)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          <Icon name="alert" className={styles.errorIcon} />
          <span>{error}</span>
        </p>
      )}
      <div className={styles.foot}>
        {hint && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )}
        {maxLength !== undefined && (
          <p id={countId} className={styles.count} aria-live={near ? 'polite' : 'off'}>
            {t('ui.field.count', { count: value.length, max: maxLength })}
          </p>
        )}
      </div>
    </div>
  )
}

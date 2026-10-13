import { useRef, useState } from 'react'
import { paths } from '../../app/paths'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { FilterChip } from '../../ui/Chip'
import { Modal } from '../../ui/Modal'
import styles from './WeekPage.module.css'

const POINTS = ['sample', 'license', 'rights', 'one', 'fair'] as const

/**
 * El modal de las bases de la semana (§2.4, `RF-DROP-06`): la primera descarga de cada semana pide aceptar
 * las bases. Resumen en 5 puntos, enlace a las completas (Anexo A) y la casilla obligatoria. «Aceptar y
 * descargar» no se deshabilita: sin la casilla, dice qué falta y la enfoca (jurado de la 2.25).
 */
export function RulesModal({
  open,
  weekNumber,
  busy,
  error,
  onClose,
  onAccept,
}: {
  open: boolean
  weekNumber: number
  busy: boolean
  error: string | null
  onClose: () => void
  onAccept: () => void
}) {
  const [accepted, setAccepted] = useState(false)
  const [missing, setMissing] = useState(false)
  const checkRef = useRef<HTMLDivElement>(null)

  const submit = () => {
    if (!accepted) {
      setMissing(true)
      checkRef.current?.querySelector('button')?.focus()
      return
    }
    onAccept()
  }

  return (
    <Modal
      wide
      open={open}
      onClose={onClose}
      title={t('pages.week.rules.title', { number: weekNumber })}
      description={t('pages.week.rules.summary')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} keyHint={t('frame.keys.glyph.escape')}>
            {t('pages.week.rules.cancel')}
          </Button>
          <Button variant="cta" loading={busy} onClick={submit} keyHint={t('frame.keys.glyph.enter')}>
            {t('pages.week.rules.submit')}
          </Button>
        </>
      }
    >
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ol role="list" className={styles.rulesList}>
        {POINTS.map((point, index) => (
          <li key={point} className={styles.rulesItem}>
            <span className={styles.rulesIndex} aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>{t(`pages.week.rules.points.${point}`)}</span>
          </li>
        ))}
      </ol>
      <a className={styles.rulesLink} href={paths.legal('bases')} target="_blank" rel="noopener">
        {t('pages.week.rules.full')}
        <span className="sr-only"> {t('pages.profile.newTab')}</span>
      </a>
      <div ref={checkRef} className={styles.rulesCheck}>
        <FilterChip
          variant="plate"
          label={t('pages.week.rules.accept', { number: weekNumber })}
          pressed={accepted}
          onChange={(value) => {
            setAccepted(value)
            if (value) setMissing(false)
          }}
          aria-describedby={missing ? 'rules-missing' : undefined}
        />
      </div>
      {missing && (
        <p id="rules-missing" className={styles.rulesError} role="alert">
          {t('pages.week.rules.required')}
        </p>
      )}
      {error && (
        <p className={styles.rulesError} role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}

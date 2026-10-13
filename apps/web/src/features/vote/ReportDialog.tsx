import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '@beatbattle/shared'
import { useId, useState } from 'react'
import type { SimpleMessageKey } from '../../i18n'
import { t } from '../../i18n'
import { ApiClientError } from '../../net/api'
import { reportEntry } from '../../net/votes'
import { Button } from '../../ui/Button'
import { TextAreaField } from '../../ui/Field'
import { Modal } from '../../ui/Modal'
import { Done, PaperNotice } from '../account/FormBits'
import styles from './ReportDialog.module.css'

/** El texto de cada motivo (las claves de i18n van en camelCase). */
const REASON_TEXT: Record<ReportReason, SimpleMessageKey> = {
  not_sample: 'report.reasons.notSample',
  rights: 'report.reasons.rights',
  offensive: 'report.reasons.offensive',
  spam: 'report.reasons.spam',
  other: 'report.reasons.other',
}

/**
 * Denunciar una entrada (guía §2.7, §2.13; tarea 5.19): el motivo (no usa el sample · plagio o derechos ·
 * ofensivo · spam · otro) y un detalle opcional. Una denuncia por usuario y entrada (`RF-VOTE-12`): la
 * segunda lo dice. Va a la cola de moderación (Fase 10).
 */
export function ReportDialog({
  entryId,
  alias,
  open,
  onClose,
}: {
  entryId: string
  alias: string
  open: boolean
  onClose: () => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'exists' | 'error'>('idle')
  const name = useId()
  const send = async () => {
    if (!reason) return
    setState('busy')
    try {
      await reportEntry(entryId, { reason, ...(details.trim() ? { details: details.trim() } : {}) })
      setState('done')
    } catch (error) {
      setState(error instanceof ApiClientError && error.code === 'REPORT_EXISTS' ? 'exists' : 'error')
    }
  }
  const finished = state === 'done' || state === 'exists'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('report.title', { alias })}
      description={t('report.description')}
      footer={
        finished ? (
          <Button onClick={onClose}>{t('report.close')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {t('report.cancel')}
            </Button>
            <Button
              onClick={send}
              loading={state === 'busy'}
              disabled={!reason}
              disabledReason={t('report.pick')}
            >
              {t('report.send')}
            </Button>
          </>
        )
      }
    >
      {state === 'done' ? (
        <Done>{t('report.done')}</Done>
      ) : state === 'exists' ? (
        <PaperNotice live>{t('report.exists')}</PaperNotice>
      ) : (
        <>
          <fieldset className={styles.reasons}>
            <legend className={styles.legend}>{t('report.reason')}</legend>
            {REPORT_REASONS.map((id) => (
              <label key={id} className={styles.reason}>
                <input
                  type="radio"
                  name={name}
                  value={id}
                  checked={reason === id}
                  onChange={() => setReason(id)}
                />
                <span>{t(REASON_TEXT[id])}</span>
              </label>
            ))}
          </fieldset>
          <TextAreaField
            label={t('report.details')}
            value={details}
            maxLength={REPORT_DETAILS_MAX}
            onChange={(event) => setDetails(event.target.value)}
          />
          {state === 'error' && <PaperNotice live>{t('report.error')}</PaperNotice>}
        </>
      )}
    </Modal>
  )
}

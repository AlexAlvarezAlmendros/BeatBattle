import { type FormEvent, useId, useState } from 'react'
import { t } from '../../../i18n'
import { ApiClientError } from '../../../net/api'
import { subscribeToDrops } from '../../../net/weeks'
import { Button } from '../../../ui/Button'
import { TextField } from '../../../ui/Field'
import { Done, PaperNotice } from '../../account/FormBits'
import styles from './DropAlertForm.module.css'

type State = 'idle' | 'busy' | 'sent' | 'error' | 'rateLimited'

/**
 * «Avísame del próximo drop» (§2.12.3, `RF-NOTIF-09`): solo el email, sin cuenta. Responde siempre lo
 * mismo («revisa tu email»), como el servidor, que tampoco dice si la dirección ya estaba. Va en la tarjeta
 * de la semana con el calendario vacío y en «Cómo se juega».
 */
export function DropAlertForm({ className }: { className?: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('idle')
  const [invalid, setInvalid] = useState(false)
  const id = useId()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setInvalid(true)
      form.querySelector('input')?.focus()
      return
    }
    setInvalid(false)
    setState('busy')
    try {
      await subscribeToDrops(email.trim())
      setState('sent')
    } catch (error) {
      setState(error instanceof ApiClientError && error.code === 'RATE_LIMITED' ? 'rateLimited' : 'error')
    }
  }

  if (state === 'sent') return <Done>{t('home.dropAlert.sent')}</Done>

  return (
    <form
      className={[styles.form, className].filter(Boolean).join(' ')}
      onSubmit={submit}
      noValidate
      aria-describedby={`${id}-status`}
    >
      <TextField
        label={t('home.dropAlert.email')}
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={invalid ? t('home.dropAlert.invalid') : null}
      />
      <Button type="submit" size="md" loading={state === 'busy'} className={styles.submit}>
        {t('home.dropAlert.submit')}
      </Button>
      <div id={`${id}-status`} className={styles.status}>
        {state === 'error' && <PaperNotice live>{t('home.dropAlert.error')}</PaperNotice>}
        {state === 'rateLimited' && <PaperNotice live>{t('home.dropAlert.rateLimited')}</PaperNotice>}
      </div>
    </form>
  )
}

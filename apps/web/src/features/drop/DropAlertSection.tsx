import { useId } from 'react'
import { DROP_ALERT_ID } from '../../app/paths'
import { t } from '../../i18n'
import './dropAlert.css'

/**
 * Sección «Avísame del próximo drop» de la home (§2.12.3; en §3.8.3, bajo «Cómo funciona»), destino del
 * CTA del hero (`paths.dropAlert()`). De momento solo cuenta lo que vendrá: el formulario con doble
 * confirmación llega con la alerta de drop sin cuenta (Fase 3), igual que su hueco en el pie.
 */
export function DropAlertSection() {
  const titleId = useId()
  return (
    <section id={DROP_ALERT_ID} className="drop-alert" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('home.dropAlert.title')}</h2>
      <p>{t('home.dropAlert.summary')}</p>
    </section>
  )
}

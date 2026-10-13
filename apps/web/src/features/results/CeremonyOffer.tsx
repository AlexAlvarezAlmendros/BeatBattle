import { useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'

/**
 * La home ofrece la ceremonia la primera vez tras el sellado (§2.8, `RF-RES-09`; tarea 6.19): «Ver la ceremonia»
 * lleva a los resultados con la ceremonia en marcha; «Ahora no» (o cerrar) la da por vista. En los dos casos no
 * se vuelve a ofrecer esa semana; el modo «Resultados» del menú sigue llevando a ella.
 */
export function CeremonyOffer({
  week,
  onDismiss,
}: {
  week: { slug: string; number: number }
  onDismiss: () => void
}) {
  const navigate = useNavigate()
  return (
    <Modal
      open
      onClose={onDismiss}
      title={t('ceremony.offer.title', { number: week.number })}
      description={t('ceremony.offer.body')}
      footer={
        <>
          <Button
            keyHint={t('frame.keys.glyph.enter')}
            onClick={() => navigate(`${paths.weekResults(week.slug)}?ceremonia`)}
          >
            {t('ceremony.watch')}
          </Button>
          <Button variant="outline" onClick={onDismiss}>
            {t('ceremony.offer.later')}
          </Button>
        </>
      }
    />
  )
}

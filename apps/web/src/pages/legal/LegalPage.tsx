import { useParams } from 'react-router'
import { isLegalDoc } from '../../app/paths'
import { t } from '../../i18n'
import { PlaceholderPage } from '../PlaceholderPage'

/**
 * `/legal/:doc` — bases, términos, privacidad y cookies (Fase 10, `docs/legal/`). El loader de la ruta
 * ya responde 404 si el documento no existe, así que aquí `doc` siempre es válido. Provisional (0.10).
 */
export function LegalPage() {
  const { doc } = useParams()
  if (!isLegalDoc(doc)) throw new Error(`Documento legal desconocido: ${doc}`)
  return <PlaceholderPage title={t(`legal.docs.${doc}`)} summary={t('legal.summary')} />
}

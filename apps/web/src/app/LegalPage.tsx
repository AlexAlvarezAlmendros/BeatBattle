import { useParams } from 'react-router'
import { t } from '../i18n'
import { TabLinks } from '../ui/Tabs'
import { PlaceholderPage } from './PlaceholderPage'
import { isLegalDoc, LEGAL_DOCS, paths } from './paths'

/**
 * `/legal/:doc` — bases, términos, privacidad y cookies (Fase 10, `docs/legal/`), en el marco simple
 * (§3.8.14) con los cuatro documentos como pestañas (Q/E). El loader de la ruta ya responde 404 si el
 * documento no existe, así que aquí `doc` siempre es válido. Provisional.
 */
export function LegalPage() {
  const { doc } = useParams()
  if (!isLegalDoc(doc)) throw new Error(`Documento legal desconocido: ${doc}`)
  return (
    <PlaceholderPage
      title={t(`legal.docs.${doc}`)}
      kicker={t('frame.plates.legal')}
      summary={t('legal.summary')}
    >
      <TabLinks
        label={t('legal.navLabel')}
        links={LEGAL_DOCS.map((item) => ({ to: paths.legal(item), label: t(`legal.docs.${item}`) }))}
      />
    </PlaceholderPage>
  )
}

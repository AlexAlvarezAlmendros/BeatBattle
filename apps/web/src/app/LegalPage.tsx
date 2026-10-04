import { useParams } from 'react-router'
import { t } from '../i18n'
import { TabLinks } from '../ui/Tabs'
import { PlaceholderPage } from './PlaceholderPage'
import { isLegalDoc, LEGAL_DOCS, paths } from './paths'

/**
 * `/legal/:doc` — bases, términos, privacidad y cookies (Fase 10, `docs/legal/`), en el marco simple con
 * la plantilla de las interiores (§3.8.14 «Admin y legales»): el sello «EN OBRAS» en la columna de la
 * pieza mientras no estén los textos, el bloque centrado entre el HUD y la barra y los cuatro documentos
 * como pestañas (Q/E) en una fila de rótulos cortos (BASES · TÉRMINOS · PRIVACIDAD · COOKIES, con el
 * nombre completo como nombre accesible). El nombre completo del documento es el título del panel (el
 * `<h1>`); en móvil, la cabeza enseña el de la placa, «LEGAL · LETRA PEQUEÑA». El loader de la ruta ya
 * responde 404 si el documento no existe, así que aquí `doc` siempre es válido. Provisional.
 */
export function LegalPage() {
  const { doc } = useParams()
  if (!isLegalDoc(doc)) throw new Error(`Documento legal desconocido: ${doc}`)
  return (
    <PlaceholderPage
      title={t(`legal.docs.${doc}`)}
      kicker={t('frame.plates.legal')}
      summary={t('legal.summary')}
      titlePlacement="panel"
      tabs={
        <TabLinks
          short
          label={t('legal.navLabel')}
          links={LEGAL_DOCS.map((item) => ({
            to: paths.legal(item),
            label: t(`legal.tabs.${item}`),
            name: t(`legal.docs.${item}`),
          }))}
        />
      }
    />
  )
}

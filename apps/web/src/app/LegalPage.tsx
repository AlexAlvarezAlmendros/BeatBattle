import { useMemo } from 'react'
import { useParams } from 'react-router'
import bases from '../../../../docs/legal/bases.md?raw'
import cookies from '../../../../docs/legal/cookies.md?raw'
import privacidad from '../../../../docs/legal/privacidad.md?raw'
import terminos from '../../../../docs/legal/terminos.md?raw'
import { t } from '../i18n'
import { TabLinks } from '../ui/Tabs'
import styles from './LegalPage.module.css'
import { inline, LegalText, parseLegal } from './legal/markdown'
import { isLegalDoc, LEGAL_DOCS, type LegalDoc, paths } from './paths'
import { ScreenPage } from './ScreenPage'

/** Los textos (`docs/legal/*.md`, la única fuente): borradores de la beta (B.2), revisados por el usuario (B.3). */
const SOURCES: Record<LegalDoc, string> = { bases, terminos, privacidad, cookies }

/**
 * `/legal/:doc` — bases, términos, privacidad y cookies (§2.18, §3.8.14 «Admin y legales»; plan de la beta, B.2):
 * la plantilla de las interiores en el marco simple, con los cuatro documentos como pestañas (Q/E) en una fila de
 * rótulos cortos (BASES · TÉRMINOS · PRIVACIDAD · COOKIES, con el nombre completo como nombre accesible) y el
 * nombre completo como título del panel (el `<h1>`). En la columna de la pieza, el índice del documento y su
 * versión; en el panel, el texto. El loader de la ruta ya responde 404 si el documento no existe.
 */
export function LegalPage() {
  const { doc } = useParams()
  if (!isLegalDoc(doc)) throw new Error(`Documento legal desconocido: ${doc}`)
  const blocks = useMemo(() => parseLegal(SOURCES[doc]), [doc])
  const note = blocks.find((block) => block.kind === 'note')
  const sections = blocks.flatMap((block) =>
    block.kind === 'heading' && block.level === 2 ? [{ id: block.id, text: block.text }] : [],
  )
  return (
    <ScreenPage
      title={t(`legal.docs.${doc}`)}
      kicker={t('frame.plates.legal')}
      titlePlacement="panel"
      fill
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
      piece={
        <div className={styles.piece}>
          {sections.length > 0 && (
            <nav className={styles.index} aria-label={t('legal.indexLabel')}>
              <p className="bb-label">{t('legal.index')}</p>
              <ol>
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {note?.kind === 'note' && <p className={styles.version}>{inline(note.text, styles.placeholder)}</p>}
        </div>
      }
    >
      <article className={styles.text}>
        <LegalText
          blocks={blocks.filter((block) => block.kind !== 'note')}
          classes={{ placeholder: styles.placeholder, table: styles.table }}
        />
      </article>
    </ScreenPage>
  )
}

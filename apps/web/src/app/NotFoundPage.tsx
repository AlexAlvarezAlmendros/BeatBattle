import { t } from '../i18n'
import { Key } from '../ui/Key'
import { TitlePlate } from '../ui/TitlePlate'
import { FrameSlot } from './layout/slots'
import styles from './NotFoundPage.module.css'
import { ScreenPage } from './ScreenPage'

/** El pad de 4 × 4 de §3.8.11, fila a fila: los *chops* del sample arriba y la batería debajo. */
const PAD_ROWS = ['1234', 'QWER', 'ASDF', 'ZXCV'] as const

/**
 * `*` — la 404 «BONUS STAGE» (guía §3.8.11): «Te has perdido… pero ya que estás.» El beat pad de 4 × 4
 * llega en la Fase 8; aquí se enseña su forma, quieta y decorativa, con «Volver al menú [Esc]». También
 * la pinta el límite de errores de las rutas cuando un loader responde 404 (un documento legal que no
 * existe): por eso pone su propia placa en el HUD, por encima de la de la ruta.
 */
export function NotFoundPage() {
  return (
    <>
      <FrameSlot name="hudCenter">
        <TitlePlate
          aria-hidden="true"
          kicker={t('frame.plates.notFound')}
          title={t('pages.notFound.plate')}
        />
      </FrameSlot>
      <ScreenPage
        title={t('pages.notFound.title')}
        kicker={t('frame.plates.notFound')}
        summary={t('pages.notFound.summary')}
      >
        <figure className={styles.pad}>
          <div className={styles.keys} aria-hidden="true">
            {PAD_ROWS.flatMap((row) =>
              [...row].map((key) => (
                <Key key={key} tone={row === '1234' ? 'marked' : 'dark'} className={styles.key}>
                  {key}
                </Key>
              )),
            )}
          </div>
          <figcaption className={styles.caption}>{t('pages.notFound.pad')}</figcaption>
        </figure>
      </ScreenPage>
    </>
  )
}

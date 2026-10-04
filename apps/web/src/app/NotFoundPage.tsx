import { useId } from 'react'
import { t } from '../i18n'
import { cx } from '../ui/forceState'
import { Key } from '../ui/Key'
import { TitlePlate } from '../ui/TitlePlate'
import { FrameSlot } from './layout/slots'
import styles from './NotFoundPage.module.css'
import { BackToMenu, ScreenPage } from './ScreenPage'

/** El pad de 4 × 4 de §3.8.11, fila a fila: los *chops* del sample arriba y la batería debajo. */
const PAD_ROWS = ['1234', 'QWER', 'ASDF', 'ZXCV'] as const

/**
 * Lo que traerá el pad cuando llegue (§3.8.11), en filas con índice como las reglas de «Cómo se juega»:
 * los chops y la batería con sus teclas, en las mismas filas del pad (la batería va por filas, Q W E R /
 * A S D F / Z X C V, no como intervalo: «[Q]–[V]» se leía como Q, R, S, T, U, V; tercer pase del jurado,
 * L-404), y el metrónomo opcional y la grabación de 4 compases, que no tienen tecla propia.
 */
const LEGEND: readonly {
  id: 'chops' | 'drums' | 'extras'
  rows?: readonly string[]
  tone?: 'marked' | 'dark'
}[] = [
  { id: 'chops', rows: PAD_ROWS.slice(0, 1), tone: 'marked' },
  { id: 'drums', rows: PAD_ROWS.slice(1), tone: 'dark' },
  { id: 'extras' },
]

/**
 * `*` — la 404 «BONUS STAGE» (guía §3.8.11): el titular es el momento de juego, «BONUS STAGE», con «Te
 * has perdido… pero ya que estás» de subtítulo. La pieza de la cuña es el beat pad de 4 × 4 (teclas de
 * chaflán `--bb-cut-md` de 72 px), quieto y decorativo hasta la Fase 8, con «Volver al menú [Esc]»
 * justo debajo del pad y su nota; el panel lleva el subtítulo y el resumen arriba y, al pie, lo que
 * traerá el pad cuando llegue (los chops en la fila de arriba, la batería en las otras tres, el metrónomo
 * y la grabación), en filas a su alto natural. Es una pantalla de poco contenido: el bloque del pad y el
 * panel, del mismo alto, va centrado entre el HUD y la barra (§3.8.14 «Reparto del alto»).
 *
 * Orden de lectura y de foco, el del DOM (v0.6.7): titular, subtítulo, resumen, cómo se tocará, pad con
 * su nota y «Volver al menú» (el panel va antes que el pad: `panelFirst`). La colocación en móvil es de
 * CSS, sin cambiar ese orden: el panel, el botón (al pie del panel; en el móvil bajo, ≤ 700 px de alto,
 * justo después del resumen) y el pad debajo; en táctil la barra no enseña Esc y el botón es la única
 * salida, así que se ve sin desplazar. En escritorio, el pad a la izquierda, con el botón debajo, y el
 * panel a la derecha.
 *
 * También la pinta el límite de errores de las rutas cuando un loader responde 404 (un documento legal
 * que no existe): por eso pone su propia placa en el HUD, por encima de la de la ruta. La pestaña dice
 * «Página no encontrada».
 */
export function NotFoundPage() {
  const legendId = useId()
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
        title={t('pages.notFound.plate')}
        documentTitle={t('pages.notFound.title')}
        kicker={t('frame.plates.notFound')}
        titleInHud
        panelFirst
        actions={null}
        className={styles.screen}
        piece={
          <div className={styles.padColumn}>
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
            {/*
             * «Volver al menú», lo último en el orden de lectura y del foco, después de la nota del pad. En
             * escritorio va justo debajo del pad, alineado con él; en móvil, el CSS lo sube antes del pad (al
             * pie del panel o, en el móvil bajo, tras el resumen; §3.8.11).
             */}
            <div className={styles.back}>
              <BackToMenu start />
            </div>
          </div>
        }
      >
        <p className={styles.subtitle}>{t('pages.notFound.subtitle')}</p>
        <p className={styles.summary}>{t('pages.notFound.summary')}</p>
        <section className={styles.legend} aria-labelledby={legendId}>
          <h2 id={legendId} className={cx('bb-label', styles.legendTitle)}>
            {t('pages.notFound.legendTitle')}
          </h2>
          {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
          <ul role="list" className={styles.legendList}>
            {LEGEND.map((row, index) => (
              <li key={row.id} className={styles.legendRow}>
                <span className={styles.legendIndex} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.legendText}>
                  {row.id !== 'extras' && (
                    <span className="sr-only">{t(`pages.notFound.legend.${row.id}.keysLabel`)} </span>
                  )}
                  {t(`pages.notFound.legend.${row.id}.text`)}
                </span>
                {row.rows && (
                  <span className={styles.legendKeys} aria-hidden="true">
                    {row.rows.map((padRow) => (
                      <span key={padRow} className={styles.keyRow} data-pad-row>
                        {[...padRow].map((key) => (
                          <Key key={key} tone={row.tone}>
                            {key}
                          </Key>
                        ))}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </ScreenPage>
    </>
  )
}

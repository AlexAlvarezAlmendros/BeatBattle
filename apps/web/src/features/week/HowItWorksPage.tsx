import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { Frame } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { Key } from '../../ui/Key'
import styles from './HowItWorksPage.module.css'

/** Los tres movimientos (§3.8.14 «Cómo se juega»), con sus teclas. */
const MOVES = [
  { id: 'sample', keys: ['frame.keys.glyph.enter'] },
  { id: 'flip', keys: [] },
  { id: 'vote', keys: ['howItWorks.keys.one', 'howItWorks.keys.five'] },
] as const

/** Las reglas de juego limpio en cinco líneas (§1.3, §2.7, §2.8). */
const RULES = ['blind', 'listen', 'fairRound', 'bayes', 'xp'] as const

/**
 * `/como-funciona` — «Cómo se juega» como **lista de movimientos** de recreativa (guía §3.8.14): 1 Pilla
 * el sample · 2 Cocina tu flip · 3 Sube y vota, cada uno con sus teclas; las reglas de juego limpio en
 * cinco líneas y el enlace a las bases. La marca «HECHO» de cada movimiento llega con las cuentas.
 */
export function HowItWorksPage() {
  return (
    <ScreenPage
      title={t('pages.howItWorks.title')}
      kicker={t('frame.plates.howItWorks')}
      summary={t('pages.howItWorks.summary')}
    >
      <ol className={styles.moves}>
        {MOVES.map((move, index) => (
          <li key={move.id}>
            <Frame cut="base" className={styles.move}>
              <span className={styles.number} aria-hidden="true">
                {t('howItWorks.moveNumber', { number: index + 1 })}
              </span>
              <div className={styles.moveText}>
                <h2 className={cx('bb-display', styles.moveTitle)}>
                  {t(`howItWorks.moves.${move.id}.title`)}
                </h2>
                <p>{t(`howItWorks.moves.${move.id}.text`)}</p>
              </div>
              {move.keys.length > 0 && (
                <span className={styles.keys} aria-hidden="true">
                  {move.keys.map((key) => (
                    <Key key={key}>{t(key)}</Key>
                  ))}
                </span>
              )}
            </Frame>
          </li>
        ))}
      </ol>
      <section className={styles.rules} aria-labelledby="juego-limpio">
        <h2 id="juego-limpio" className={cx('bb-label', styles.rulesTitle)}>
          {t('howItWorks.rulesTitle')}
        </h2>
        <ul className={styles.ruleList}>
          {RULES.map((rule) => (
            <li key={rule}>
              <b>{t(`howItWorks.rules.${rule}.title`)}</b> {t(`howItWorks.rules.${rule}.text`)}
            </li>
          ))}
        </ul>
        <p>
          <Link to={paths.legal('bases')} className={styles.link}>
            {t('legal.docs.bases')}
          </Link>
        </p>
      </section>
    </ScreenPage>
  )
}

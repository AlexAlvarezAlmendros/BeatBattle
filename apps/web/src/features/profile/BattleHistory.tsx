import type { ProfileHistoryRow } from '@beatbattle/shared'
import { useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { GenerativeCover } from '../../ui/CoverArt'
import { frameAttributes } from '../../ui/Frame'
import { Medal, type MedalPlace } from '../../ui/Medal'
import { scoreOf } from '../results/score'
import styles from './ProfilePage.module.css'

/** Combates a la vista antes de «Ver todos» (los de la maqueta `05-perfil`). */
export const HISTORY_ROWS = 5

const isMedal = (position: number | null): position is MedalPlace =>
  position === 1 || position === 2 || position === 3

/**
 * El historial de combates del perfil (§3.8.10; tarea 7.24): solo semanas selladas (hueco G1), de la más reciente a la
 * más antigua: portada, título, «S40 · era ~~Faro Errante~~ · 41 votos», posición, puntuación y, en el podio, su
 * medalla de vinilo. Cada fila lleva a la ficha de la entrada (sellada, con su resultado, `RF-PLAY-08`). La semana en
 * curso nunca está aquí: lo dice la nota del pie.
 */
export function BattleHistory({ history }: { history: readonly ProfileHistoryRow[] }) {
  const [all, setAll] = useState(false)
  const rows = all ? history : history.slice(0, HISTORY_ROWS)
  return (
    <section className={styles.section} aria-labelledby="profile-history">
      <div className={styles.sectionHead}>
        <h2 id="profile-history" className={styles.sectionTitle}>
          {t('pages.profile.history.title')}
        </h2>
        <span className="bb-label">{t('pages.profile.history.note')}</span>
      </div>
      {history.length === 0 ? (
        <p className={styles.empty}>{t('pages.profile.history.empty')}</p>
      ) : (
        <ol className={styles.history}>
          {rows.map((row) => (
            <li key={row.entryId}>
              <Link
                to={paths.entry(row.entryId)}
                {...frameAttributes({ cut: 'md' })}
                className={styles.fight}
              >
                <span className={styles.fightCover} aria-hidden="true">
                  {row.cover.kind === 'own' ? (
                    <img src={row.cover.url} alt="" />
                  ) : (
                    <GenerativeCover seed={row.cover.seed} />
                  )}
                </span>
                <span className={styles.fightText}>
                  <span className={styles.fightTitle}>{row.title}</span>
                  <span className={styles.fightMeta}>
                    {t.parts('pages.profile.history.meta', {
                      week: t('pages.profile.history.week', { number: row.weekNumber }),
                      alias: <s key="alias">{row.alias}</s>,
                      votes: t('pages.profile.history.votes', { count: row.votes }),
                    })}
                  </span>
                </span>
                <span className={styles.fightPlace} data-first={row.position === 1 || undefined}>
                  {row.position === null ? (
                    <>
                      <span aria-hidden="true">{t('pages.profile.noValue')}</span>
                      <span className="sr-only">{t('pages.profile.history.unranked')}</span>
                    </>
                  ) : (
                    t('pages.profile.history.place', { place: row.position })
                  )}
                </span>
                <span className={styles.fightScore}>
                  <span className="sr-only">{t('pages.profile.history.scoreLabel')} </span>
                  {scoreOf(row.scoreMilli)}
                </span>
                <span className={styles.fightMedal}>
                  {isMedal(row.position) && <Medal place={row.position} />}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {history.length > HISTORY_ROWS && (
        <Button
          variant="outline"
          size="sm"
          className={styles.more}
          aria-expanded={all}
          onClick={() => setAll((value) => !value)}
        >
          {all ? t('pages.profile.history.less') : t('pages.profile.history.more', { count: history.length })}
        </Button>
      )}
      <p className={styles.note}>{t('pages.profile.history.pending')}</p>
    </section>
  )
}

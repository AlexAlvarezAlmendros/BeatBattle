import { type ArchiveWeek, PublicEntrySchema } from '@beatbattle/shared'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { formatDate, t } from '../../i18n'
import { apiFetch } from '../../net/api'
import { archiveQuery } from '../../net/archive'
import { Button } from '../../ui/Button'
import { GenerativeCover } from '../../ui/CoverArt'
import { Frame } from '../../ui/Frame'
import { Medal, type MedalPlace } from '../../ui/Medal'
import { usePlayer } from '../player/store'
import { entryTrack } from '../player/tracks'
import styles from './WeeksPage.module.css'

/**
 * `/semanas` — el archivo (guía §2.9, `RF-ARC-01`; tarea 6.18): las semanas selladas, de la más reciente a la
 * más antigua y de 20 en 20, con su sample, el número de entradas y el podio, que se escucha desde aquí (el
 * reproductor global pide la ficha de la entrada y la pone a sonar). Cada semana lleva a sus resultados.
 */
export function WeeksPage() {
  const archive = useInfiniteQuery(archiveQuery())
  const weeks = archive.data?.pages.flatMap((page) => page.weeks) ?? []
  return (
    <ScreenPage
      title={t('pages.weeks.title')}
      kicker={t('archive.kicker')}
      summary={t('archive.summary')}
      fill
    >
      {archive.isError ? (
        <p className={styles.note}>{t('archive.error')}</p>
      ) : archive.isPending ? null : weeks.length === 0 ? (
        <p className={styles.note}>{t('archive.none')}</p>
      ) : (
        <>
          <ol className={styles.weeks}>
            {weeks.map((week) => (
              <li key={week.slug}>
                <WeekCard week={week} />
              </li>
            ))}
          </ol>
          {archive.hasNextPage && (
            <Button
              variant="outline"
              className={styles.more}
              disabled={archive.isFetchingNextPage}
              onClick={() => archive.fetchNextPage()}
            >
              {t('archive.more')}
            </Button>
          )}
        </>
      )}
    </ScreenPage>
  )
}

async function play(entryId: string) {
  const entry = await apiFetch(`/api/entries/${encodeURIComponent(entryId)}`, { schema: PublicEntrySchema })
  usePlayer.getState().play(entryTrack(entry, { votable: false }))
}

function WeekCard({ week }: { week: ArchiveWeek }) {
  const headingId = `semana-${week.slug}`
  const [broken, setBroken] = useState(false)
  return (
    <Frame className={styles.card} aria-labelledby={headingId}>
      <div className={styles.cover}>
        {week.sampleCoverUrl && !broken ? (
          <img src={week.sampleCoverUrl} alt="" onError={() => setBroken(true)} />
        ) : (
          // Sin portada que cargar, el vinilo-sol de la semana (el de su imagen OG).
          <GenerativeCover seed={`week:${week.slug}`} />
        )}
      </div>
      <div className={styles.info}>
        <h2 id={headingId} className={styles.heading}>
          <span className="bb-label">
            {t('archive.week', { number: week.number })} · {formatDate(week.sealedAt)}
          </span>
          <Link to={paths.weekResults(week.slug)} className={`bb-display ${styles.title}`}>
            {week.sampleTitle}
          </Link>
        </h2>
        <p className={styles.meta}>{t('archive.entries', { count: week.entries })}</p>
        {week.entries === 0 ? (
          <p className={styles.meta}>{t('archive.empty')}</p>
        ) : week.podium.length === 0 ? (
          <p className={styles.meta}>{t('archive.noPodium')}</p>
        ) : null}
      </div>
      {week.podium.length > 0 && (
        <ol className={styles.podium}>
          {week.podium.map((row) => (
            <li key={row.entryId} className={styles.row}>
              <Medal place={row.position as MedalPlace} className={styles.medal} />
              <Link to={paths.entry(row.entryId)} className={styles.entry}>
                <span className={styles.position}>{row.position}.º</span>{' '}
                <b>{row.producer ?? t('results.deletedProducer')}</b> · {row.title}
              </Link>
              <Button
                variant="white"
                iconOnly
                icon="triangleRight"
                aria-label={t('archive.play', { title: row.title })}
                onClick={() => void play(row.entryId)}
              />
            </li>
          ))}
        </ol>
      )}
      <Button variant="outline" to={paths.weekResults(week.slug)} className={styles.link}>
        {t('archive.results')}
      </Button>
    </Frame>
  )
}

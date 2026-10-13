import { parseLocalDate, scheduleWeek } from '@beatbattle/rules'
import type { AdminSample, AdminWeek } from '@beatbattle/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { Link } from 'react-router'
import { ScreenPage } from '../../app/ScreenPage'
import { formatDate, formatDuration, t } from '../../i18n'
import {
  adminCalendarQuery,
  adminSamplesQuery,
  scheduleWeek as schedule,
  unscheduleWeek,
} from '../../net/admin'
import { ApiClientError } from '../../net/api'
import { queryKeys } from '../../net/queryKeys'
import { Button } from '../../ui/Button'
import { FilterChip } from '../../ui/Chip'
import { TextField } from '../../ui/Field'
import { Done, PaperNotice } from '../account/FormBits'
import { RequireSession } from '../account/RequireSession'
import { useSession } from '../account/session'
import styles from './AdminPage.module.css'

/** El lunes «2026-10-12» en palabras («lun 12 oct 2026»). */
const mondayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return formatDate(Date.UTC(y, m - 1, d, 12), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Guarda del panel: con sesión y con el rol (la de verdad es la del servidor, `RF-AUTH-03`). */
export function AdminGate({ children }: { children: ReactNode }) {
  const me = useSession((state) => state.me)
  return (
    <RequireSession reason={t('admin.require')}>
      {me?.role === 'admin' ? children : <PaperNotice live={false}>{t('admin.forbidden')}</PaperNotice>}
    </RequireSession>
  )
}

/**
 * `/admin` — panel de administración (§2.14; tarea 3.18), en modo denso: tablas y sin efectos. El
 * calendario de las próximas 12 semanas con los huecos en rojo (`RF-ADM-02`) y el formulario para
 * programar, el recuento de descargas de cada semana (`RF-DROP-08`) y la lista de samples.
 */
export function AdminPage() {
  return (
    <ScreenPage title={t('pages.admin.title')} kicker={t('frame.plates.admin')} actions={null} wide>
      <AdminGate>
        <div className={styles.panel} data-dense="">
          <Calendar />
          <Samples />
        </div>
      </AdminGate>
    </ScreenPage>
  )
}

function Calendar() {
  const calendar = useQuery(adminCalendarQuery())
  const samples = useQuery(adminSamplesQuery())
  const queryClient = useQueryClient()
  const headingId = useId()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.weeks.all })
  }
  const [error, setError] = useState<string | null>(null)
  const now = Date.now()

  if (!calendar.data)
    return (
      <section className={styles.section} aria-labelledby={headingId}>
        <h2 id={headingId} className={`bb-label ${styles.heading}`}>
          {t('admin.calendar.title')}
        </h2>
        <Status loading={calendar.isPending} />
      </section>
    )
  const upcoming = calendar.data.weeks.filter((week) => week.voteEndsAt > now)
  const past = calendar.data.weeks.filter((week) => week.voteEndsAt <= now).reverse()
  const rows: ({ kind: 'week'; week: AdminWeek } | { kind: 'gap'; monday: string })[] = [
    ...upcoming.map((week) => ({ kind: 'week' as const, week })),
    ...calendar.data.gaps.map((monday) => ({ kind: 'gap' as const, monday })),
  ].sort((a, b) =>
    (a.kind === 'week' ? a.week.monday : a.monday).localeCompare(
      b.kind === 'week' ? b.week.monday : b.monday,
    ),
  )

  const remove = async (slug: string) => {
    setError(null)
    try {
      await unscheduleWeek(slug)
      refresh()
      // La fila (y su botón) desaparece: el foco va al título del calendario.
      document.getElementById(headingId)?.focus()
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : t('admin.error'))
    }
  }

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={`bb-label ${styles.heading}`} tabIndex={-1}>
        {t('admin.calendar.title')}
      </h2>
      <p className={styles.summary}>{t('admin.calendar.summary')}</p>
      <WeeksTable rows={rows} caption={t('admin.calendar.upcoming')} onRemove={(slug) => void remove(slug)} />
      {error && <PaperNotice live>{error}</PaperNotice>}
      <ScheduleForm gaps={calendar.data.gaps} samples={samples.data ?? []} onDone={refresh} />
      {past.length > 0 && (
        <>
          <h3 className={`bb-label ${styles.subheading}`}>{t('admin.calendar.past')}</h3>
          <WeeksTable
            rows={past.map((week) => ({ kind: 'week' as const, week }))}
            caption={t('admin.calendar.past')}
          />
        </>
      )}
    </section>
  )
}

function WeeksTable({
  rows,
  caption,
  onRemove,
}: {
  rows: ({ kind: 'week'; week: AdminWeek } | { kind: 'gap'; monday: string })[]
  caption: string
  onRemove?: (slug: string) => void
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: la tabla se desplaza en horizontal en móvil; con el foco, también con el teclado
    <section className={styles.tableWrap} tabIndex={0} aria-label={caption}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('admin.calendar.monday')}</th>
            <th scope="col">{t('admin.calendar.week')}</th>
            <th scope="col">{t('admin.calendar.sample')}</th>
            <th scope="col">{t('admin.calendar.phase')}</th>
            <th scope="col">{t('admin.calendar.downloads')}</th>
            {onRemove && <th scope="col">{t('admin.calendar.actions')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.kind === 'gap' ? (
              <tr key={row.monday} data-gap="">
                <th scope="row">{mondayLabel(row.monday)}</th>
                <td colSpan={onRemove ? 5 : 4}>
                  <span className={styles.gap}>{t('admin.calendar.gap')}</span>
                </td>
              </tr>
            ) : (
              <tr key={row.week.slug}>
                <th scope="row">{mondayLabel(row.week.monday)}</th>
                <td className={styles.num}>
                  #{row.week.number} · {row.week.label}
                </td>
                <td className={styles.wrap}>{row.week.sample.title}</td>
                <td>{t(`admin.calendar.phases.${row.week.phase}`)}</td>
                <td className={styles.num}>
                  {t('admin.calendar.downloadsValue', {
                    count: row.week.downloads.accounts,
                    total: row.week.downloads.total,
                  })}
                </td>
                {onRemove && (
                  <td>
                    {row.week.phase === 'scheduled' && (
                      <Button size="sm" variant="outline" onClick={() => onRemove(row.week.slug)}>
                        {t('admin.calendar.unschedule')}
                        <span className="sr-only">
                          {' '}
                          {t('admin.calendar.weekNumber', { number: row.week.number })}
                        </span>
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  )
}

function ScheduleForm({
  gaps,
  samples,
  onDone,
}: {
  gaps: readonly string[]
  samples: readonly AdminSample[]
  onDone: () => void
}) {
  const now = Date.now()
  // Solo los lunes que aún no han empezado (programar una semana empezada da `WEEK_LOCKED`).
  const future = gaps.filter((monday) => scheduleWeek(parseLocalDate(monday)).startsAt > now)
  const [monday, setMonday] = useState('')
  const [sampleId, setSampleId] = useState('')
  const [challenge, setChallenge] = useState('')
  const [blind, setBlind] = useState(true)
  const [golden, setGolden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const ids = { monday: useId(), sample: useId(), title: useId() }
  const chosenMonday = monday || future[0] || ''
  const chosenSample = sampleId || samples[0]?.id || ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setDone(null)
    setBusy(true)
    try {
      const created = await schedule({
        monday: chosenMonday,
        sampleId: chosenSample,
        challenge: challenge || null,
        blind,
        golden,
      })
      setChallenge('')
      setMonday('')
      setDone(t('admin.calendar.scheduled', { number: created.number, monday: mondayLabel(created.monday) }))
      onDone()
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : t('admin.error'))
    } finally {
      setBusy(false)
    }
  }

  if (samples.length === 0) return <p className={styles.summary}>{t('admin.calendar.noSamples')}</p>
  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={ids.title}>
      <h3 id={ids.title} className={`bb-label ${styles.subheading}`}>
        {t('admin.calendar.scheduleTitle')}
      </h3>
      <div className={styles.formRow}>
        <label className={styles.select} htmlFor={ids.monday}>
          <span className="bb-label">{t('admin.calendar.mondayField')}</span>
          <select id={ids.monday} value={chosenMonday} onChange={(event) => setMonday(event.target.value)}>
            {future.map((date) => (
              <option key={date} value={date}>
                {mondayLabel(date)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.select} htmlFor={ids.sample}>
          <span className="bb-label">{t('admin.calendar.sampleField')}</span>
          <select id={ids.sample} value={chosenSample} onChange={(event) => setSampleId(event.target.value)}>
            {samples.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TextField
        label={t('admin.calendar.challengeField')}
        value={challenge}
        maxLength={140}
        onChange={(event) => setChallenge(event.target.value)}
      />
      <div className={styles.formRow}>
        <FilterChip variant="plate" label={t('admin.calendar.blind')} pressed={blind} onChange={setBlind} />
        <FilterChip
          variant="plate"
          label={t('admin.calendar.golden')}
          pressed={golden}
          onChange={setGolden}
        />
      </div>
      {error && <PaperNotice live>{error}</PaperNotice>}
      {done && <Done>{done}</Done>}
      <Button type="submit" variant="cta" loading={busy} className={styles.submit}>
        {t('admin.calendar.submit')}
      </Button>
    </form>
  )
}

function Samples() {
  const samples = useQuery(adminSamplesQuery())
  const headingId = useId()
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h2 id={headingId} className={`bb-label ${styles.heading}`}>
          {t('admin.samples.title')}
        </h2>
        <Button to="/admin/samples/nuevo" size="sm" variant="white">
          {t('admin.samples.new')}
        </Button>
      </div>
      {!samples.data ? (
        <Status loading={samples.isPending} />
      ) : samples.data.length === 0 ? (
        <p className={styles.summary}>{t('admin.samples.empty')}</p>
      ) : (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: la tabla se desplaza en horizontal en móvil; con el foco, también con el teclado
        <section className={styles.tableWrap} tabIndex={0} aria-label={t('admin.samples.title')}>
          <table className={styles.table}>
            <caption className="sr-only">{t('admin.samples.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.calendar.sample')}</th>
                <th scope="col">{t('admin.samples.duration')}</th>
                <th scope="col">{t('admin.samples.loudness')}</th>
                <th scope="col">{t('admin.samples.chops')}</th>
                <th scope="col">{t('admin.samples.usedBy')}</th>
                <th scope="col">{t('admin.calendar.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {samples.data.map((sample) => (
                <tr key={sample.id}>
                  <th scope="row" className={styles.wrap}>
                    <b>{sample.title}</b>
                    <span className={styles.muted}> · {sample.credits}</span>
                  </th>
                  <td className={styles.num}>{formatDuration(sample.durationMs / 1000)}</td>
                  <td className={styles.num}>
                    {sample.loudnessLufs === null
                      ? '—'
                      : t('admin.samples.loudnessValue', { value: sample.loudnessLufs.toFixed(1) })}
                  </td>
                  <td>
                    {t(sample.chops.length === 8 ? 'admin.samples.chopsDone' : 'admin.samples.chopsMissing')}
                  </td>
                  <td>{sample.weeks.join(', ') || '—'}</td>
                  <td>
                    <Link className={styles.link} to={`/admin/samples/${sample.id}`}>
                      {t('admin.samples.edit')}
                      <span className="sr-only"> {sample.title}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  )
}

function Status({ loading }: { loading: boolean }) {
  return (
    <p className={styles.summary} role="status">
      {loading ? t('admin.loading') : t('admin.error')}
    </p>
  )
}

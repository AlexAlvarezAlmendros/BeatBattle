import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Chronicle, CreditLine } from '../../../app/layout/Chronicle'
import { HudStat, PlayerCard } from '../../../app/layout/PlayerCard'
import { FrameSlot } from '../../../app/layout/slots'
import { paths } from '../../../app/paths'
import { formatNumber, t } from '../../../i18n'
import { Trans } from '../../../i18n/Trans'
import { Frame } from '../../../ui/Frame'
import { cx } from '../../../ui/forceState'
import { GameLogo } from '../../../ui/GameLogo'
import { useRovingMenu } from '../../../ui/hooks/useRovingMenu'
import { MenuPlate } from '../../../ui/MenuPlate'
import { OTP_SIGNATURE_HREF, OtpSlapImage } from '../../../ui/OtpSlap'
import { RoundClock } from '../../../ui/RoundClock'
import { Tag } from '../../../ui/Tag'
import styles from './MainMenu.module.css'
import { MENU_MODES, type MenuMode, type MenuModel } from './model'
import { StageCard } from './StageCard'

interface ModeEntry {
  mode: MenuMode
  to?: string
  disabled: boolean
  detail?: ReactNode
  help: ReactNode
}

const bold = (text: ReactNode) => <b>{text}</b>

/**
 * Qué hace cada modo según la semana y el jugador (§3.8.3): a dónde lleva, su dato, si está
 * deshabilitado (con el motivo como dato) y la ayuda del panel de debajo.
 */
export function menuEntries({ week, player, lastSealed }: MenuModel): ModeEntry[] {
  const signIn = paths.signIn()
  const play: ModeEntry = !week
    ? {
        mode: 'play',
        disabled: true,
        detail: t('home.modes.play.empty'),
        help: t('home.modes.play.helpEmpty'),
      }
    : week.phase === 'voting'
      ? {
          mode: 'play',
          disabled: true,
          detail: t('home.modes.play.closed'),
          help: t('home.modes.play.helpClosed'),
        }
      : !player
        ? {
            mode: 'play',
            to: signIn,
            disabled: false,
            detail: t('home.modes.play.upload'),
            help: <Trans k="home.modes.play.helpVisitor" values={{ when: bold(week.when) }} />,
          }
        : player.uploaded
          ? {
              mode: 'play',
              to: paths.upload(),
              disabled: false,
              detail: t('home.modes.play.edit'),
              help: t('home.modes.play.helpEdit'),
            }
          : {
              mode: 'play',
              to: paths.upload(),
              disabled: false,
              detail: t('home.modes.play.upload'),
              help: (
                <Trans
                  k="home.modes.play.help"
                  values={{
                    when: bold(week.when),
                    credits: bold(t('home.modes.play.credits', { count: 1 })),
                  }}
                />
              ),
            }
  const jury: ModeEntry = !player
    ? {
        mode: 'jury',
        to: signIn,
        disabled: false,
        detail: t('home.modes.jury.signIn'),
        help: t('home.modes.jury.helpVisitor'),
      }
    : !week
      ? {
          mode: 'jury',
          disabled: true,
          detail: t('home.modes.jury.empty'),
          help: t('home.modes.jury.helpEmpty'),
        }
      : {
          mode: 'jury',
          to: paths.jury(),
          disabled: false,
          detail: (
            <Trans k="home.modes.jury.unvoted" values={{ count: bold(formatNumber(player.unvoted)) }} />
          ),
          help: (
            <Trans
              k="home.modes.jury.help"
              values={{ count: bold(t('home.modes.jury.beats', { count: player.unvoted })) }}
            />
          ),
        }
  const results: ModeEntry = !lastSealed
    ? {
        mode: 'results',
        disabled: true,
        detail: t('home.modes.results.none'),
        help: t('home.modes.results.helpNone'),
      }
    : {
        mode: 'results',
        to: paths.weekResults(String(lastSealed.number)),
        disabled: false,
        detail: (
          <>
            {lastSealed.unseen && <Tag tone="white">{t('home.modes.results.new')}</Tag>}{' '}
            <span className={styles.optional}>
              {t('home.modes.results.week', { number: lastSealed.number })}
            </span>
          </>
        ),
        help: (
          <Trans
            k="home.modes.results.help"
            values={{ week: bold(t('home.modes.results.week', { number: lastSealed.number })) }}
          />
        ),
      }
  return [
    play,
    jury,
    results,
    { mode: 'hallOfFame', to: paths.hallOfFame(), disabled: false, help: t('home.modes.hallOfFame.help') },
    {
      mode: 'howItWorks',
      to: paths.howItWorks(),
      disabled: false,
      detail: (
        <span className={styles.optional}>
          <Trans k="home.modes.howItWorks.detail" values={{ minutes: bold('1') }} />
        </span>
      ),
      help: t('home.modes.howItWorks.help'),
    },
    {
      mode: 'settings',
      to: paths.settings(),
      disabled: false,
      detail: <span className={styles.optional}>{t('home.modes.settings.detail')}</span>,
      help: t('home.modes.settings.help'),
    },
  ]
}

/**
 * Menú principal (guía §3.8.3; tarea 0.24): la pantalla de título y selección de modo. A la izquierda,
 * el logo con su lockup «TORNEO SEMANAL DE PRODUCTORES by [OTP.]» y la tarjeta del escenario de la
 * semana; a la derecha, sobre la cuña, «ELIGE MODO» con seis placas y el panel de ayuda del modo
 * elegido (región viva). En el HUD, el reloj de ronda (si hay semana) y el jugador; en la barra, la
 * crónica de la arena; en la cuña, el número de semana gigante.
 *
 * Teclado (`RD-MOT-05`): `role="menu"` de una sola parada, ↑↓ en bucle, Inicio/Fin, letra inicial e
 * Intro. Al entrar, el cursor está en la primera opción disponible, sin robar el foco (el primer Tab
 * sigue siendo «Saltar al contenido»); pero si el foco no está en ningún control, las flechas e Intro
 * van al menú, como en una recreativa.
 */
export function MainMenu({ model }: { model: MenuModel }) {
  const entries = menuEntries(model)
  const titleId = useId()
  const helpId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const firstEnabled = Math.max(0, model.player?.uploaded ? 1 : entries.findIndex((entry) => !entry.disabled))
  const menu = useRovingMenu({
    count: entries.length,
    initialIndex: firstEnabled,
    isDisabled: (index) => Boolean(entries[index]?.disabled),
    getLabel: (index) => t(`home.modes.${MENU_MODES[index]!}.label`),
  })
  const active = entries[menu.activeIndex] ?? entries[0]!

  // Las flechas e Intro, con el foco en ningún control (la página recién cargada), van al menú.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const focused = document.activeElement
      const idle = !focused || focused === document.body || focused.hasAttribute('data-focus-target')
      if (!idle) return
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
      if (step === undefined && !['Home', 'End', 'Enter'].includes(event.key)) return
      event.preventDefault()
      const count = entries.length
      const current = menu.activeIndex
      if (event.key === 'Enter') {
        listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[current]?.click()
        return
      }
      const next =
        event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (current + (step ?? 0) + count) % count
      menu.moveTo(next)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [entries.length, menu])

  const { week, player } = model
  const chronicle: ReactNode[] = week
    ? [<CreditLine key="credit" inside={Boolean(player?.uploaded)} />, ...model.chronicle]
    : [...model.chronicle]

  return (
    <div className={styles.menu} data-week={week ? week.phase : 'empty'}>
      <h1 className="sr-only">{t('pages.home.title')}</h1>

      {player && (
        <FrameSlot name="hudPlayer">
          <PlayerCard {...player} />
        </FrameSlot>
      )}
      {week && (
        <FrameSlot name="hudCenter">
          <RoundClock
            target={week.closesAt}
            label={t(week.phase === 'open' ? 'home.clock.closes' : 'home.clock.votes')}
            when={week.clockWhen}
            week={week.weekBar}
          />
        </FrameSlot>
      )}
      {player && (player.season || player.streak) && (
        <FrameSlot name="hudRight">
          {player.season && <HudStat label={player.season.label} value={player.season.value} />}
          {player.streak !== undefined && (
            <HudStat
              label={t('home.hud.streak')}
              value={t('home.hud.streakValue', { count: player.streak })}
            />
          )}
        </FrameSlot>
      )}
      <FrameSlot name="controlsRight">
        <Chronicle messages={chronicle} label={t('frame.controls.chronicle')} />
      </FrameSlot>
      {week && (
        <FrameSlot name="arena">
          <span className={cx('bb-display', styles.giant)} data-fx="">
            {week.number}
          </span>
        </FrameSlot>
      )}

      <section className={styles.title} aria-label={t('home.title.label')}>
        <GameLogo className={styles.logoFull} />
        <GameLogo className={styles.logoCompact} compact />
        <div className={styles.lockup}>
          <p className={styles.ribbon}>
            {t('home.title.ribbonStart')}
            <span className={styles.ribbonEnd}> {t('home.title.ribbonEnd')}</span>
          </p>
          <a
            className={styles.signature}
            href={OTP_SIGNATURE_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('ui.otpSlap.label')}
            data-otp-signature=""
          >
            <span aria-hidden="true">{t('home.title.by')}</span>
            <OtpSlapImage size="menu" />
          </a>
        </div>
        <StageCard week={week} />
      </section>

      <nav className={styles.modes} aria-labelledby={titleId}>
        <div className={styles.head}>
          <h2 id={titleId} className={cx('bb-display', styles.headTitle)}>
            {t('home.menu.title')}
          </h2>
          <span className={cx('bb-label', styles.touch)}>{t('home.menu.touch')}</span>
        </div>
        <ul
          ref={listRef}
          {...menu.getContainerProps({ 'aria-labelledby': titleId })}
          aria-describedby={helpId}
          className={styles.plates}
        >
          {entries.map((entry, index) => (
            <li key={entry.mode} role="none">
              <MenuPlate
                index={index + 1}
                label={t(`home.modes.${entry.mode}.label`)}
                detail={entry.detail}
                disabled={entry.disabled}
                to={entry.to}
                itemProps={menu.getItemProps(index)}
              />
            </li>
          ))}
        </ul>
        <Frame cut="base" className={styles.help}>
          <span className={cx('bb-label', styles.helpKicker)} aria-hidden="true">
            {t(`home.modes.${active.mode}.label`)}
          </span>
          <p id={helpId} className={styles.helpText} aria-live="polite">
            {active.help}
          </p>
        </Frame>
      </nav>
    </div>
  )
}

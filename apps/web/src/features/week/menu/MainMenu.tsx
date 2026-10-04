import { type CSSProperties, type ReactNode, useId, useRef } from 'react'
import { Chronicle, CreditLine } from '../../../app/layout/Chronicle'
import { HudStat, PlayerCard } from '../../../app/layout/PlayerCard'
import { FrameSlot } from '../../../app/layout/slots'
import { paths } from '../../../app/paths'
import { formatNumber, t } from '../../../i18n'
import { Trans } from '../../../i18n/Trans'
import { Frame } from '../../../ui/Frame'
import { cx } from '../../../ui/forceState'
import { GameLogo, logoAspect } from '../../../ui/GameLogo'
import { useIdleMenuKeys } from '../../../ui/hooks/useIdleMenuKeys'
import { useRovingMenu } from '../../../ui/hooks/useRovingMenu'
import { MenuPlate, useMenuPlateFit } from '../../../ui/MenuPlate'
import { RoundClock } from '../../../ui/RoundClock'
import { Tag } from '../../../ui/Tag'
import { TitleLockup } from '../../../ui/TitleLockup'
import styles from './MainMenu.module.css'
import { MENU_MODES, type MenuMode, type MenuModel } from './model'
import { StageCard } from './StageCard'

interface ModeEntry {
  mode: MenuMode
  to?: string
  disabled: boolean
  /** Dato corto (cifra, etiqueta o motivo): se ve siempre. */
  detail?: ReactNode
  /** Dato largo, en texto: en móvil, solo en la elegida (`MenuPlate`). */
  extra?: ReactNode
  help: ReactNode
}

const bold = (text: ReactNode) => <b>{text}</b>

/** La proporción del logo en dos líneas, para que el lockup (fuera del logo) se mida con él (§3.8.3). */
const BRAND_STYLE = { '--game-logo-aspect': logoAspect() } as CSSProperties

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
            extra: t('home.modes.play.upload'),
            help: <Trans k="home.modes.play.helpVisitor" values={{ when: bold(week.when) }} />,
          }
        : player.uploaded
          ? {
              mode: 'play',
              to: paths.upload(),
              disabled: false,
              extra: t('home.modes.play.edit'),
              help: t('home.modes.play.helpEdit'),
            }
          : {
              mode: 'play',
              to: paths.upload(),
              disabled: false,
              extra: t('home.modes.play.upload'),
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
        extra: t('home.modes.jury.signIn'),
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
        detail: lastSealed.unseen ? <Tag tone="white">{t('home.modes.results.new')}</Tag> : undefined,
        extra: t('home.modes.results.week', { number: lastSealed.number }),
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
      detail: <Trans k="home.modes.howItWorks.detail" values={{ minutes: bold('1') }} />,
      help: t('home.modes.howItWorks.help'),
    },
    {
      mode: 'settings',
      to: paths.settings(),
      disabled: false,
      extra: t('home.modes.settings.detail'),
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
  const helpRef = useRef<HTMLDivElement>(null)
  const firstEnabled = Math.max(0, model.player?.uploaded ? 1 : entries.findIndex((entry) => !entry.disabled))
  const menu = useRovingMenu({
    count: entries.length,
    initialIndex: firstEnabled,
    isDisabled: (index) => Boolean(entries[index]?.disabled),
    getLabel: (index) => t(`home.modes.${MENU_MODES[index]!}.label`),
    onMove: () => requestAnimationFrame(() => revealHelp(listRef.current, helpRef.current)),
  })
  const active = entries[menu.activeIndex] ?? entries[0]!
  // Un mismo cuerpo de rótulo y un mismo alto para todas las placas en reposo (§3.3).
  const fit = useMenuPlateFit(listRef)

  // Las flechas e Intro, con el foco en ningún control (la página recién cargada), van al menú.
  useIdleMenuKeys(menu, entries.length, listRef)

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
          {/* En la tableta vertical, el reloj va en la tarjeta de la semana, como en el móvil (CSS). */}
          <div className={styles.hudClock}>
            <RoundClock
              target={week.closesAt}
              label={t(week.phase === 'open' ? 'home.clock.closes' : 'home.clock.votes')}
              when={week.clockWhen}
              week={week.weekBar}
            />
          </div>
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
        {/* Con semana, la pantalla tiene más bucles (vinilo, respiro, reloj) que para el botón de pausa. */}
        <Chronicle messages={chronicle} label={t('frame.controls.chronicle')} loops={Boolean(week)} />
      </FrameSlot>
      {week && (
        <FrameSlot name="arena">
          <span className={cx('bb-display', styles.giant)} data-fx="" data-giant-number="">
            {week.number}
          </span>
        </FrameSlot>
      )}

      <section className={styles.title} aria-label={t('home.title.label')}>
        {/* El logo y su lockup: con la ventana baja, el lockup se mide con el logo (proporción del lienzo). */}
        <div className={styles.brand} style={BRAND_STYLE}>
          <GameLogo className={styles.logoFull} />
          <GameLogo className={styles.logoCompact} compact />
          <TitleLockup className={styles.lockup} />
        </div>
        <StageCard week={week} />
      </section>

      <nav className={styles.modes} aria-labelledby={titleId}>
        <div className={styles.head}>
          <h2 id={titleId} className={cx('bb-display', styles.headTitle)}>
            {t('home.menu.title')}
          </h2>
          {/* Según la entrada (§3.8.3): «Toca para entrar» en táctil, «Intro para entrar» con teclado. */}
          <span className={cx('bb-label', styles.hint, styles.hintTouch)}>{t('home.menu.touch')}</span>
          <span className={cx('bb-label', styles.hint, styles.hintKeys)}>{t('home.menu.keys')}</span>
        </div>
        <ul
          ref={listRef}
          {...menu.getContainerProps({ 'aria-labelledby': titleId })}
          aria-describedby={helpId}
          className={styles.plates}
          style={fit.style}
        >
          {entries.map((entry, index) => (
            <li key={entry.mode} role="none">
              <MenuPlate
                index={index + 1}
                label={t(`home.modes.${entry.mode}.label`)}
                detail={entry.detail}
                extra={entry.extra}
                disabled={entry.disabled}
                to={entry.to}
                itemProps={menu.getItemProps(index)}
                fitKey={fit.key}
              />
            </li>
          ))}
        </ul>
        <Frame ref={helpRef} cut="base" className={styles.help}>
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

/**
 * Al mover el cursor con el teclado (o el mando), el panel de ayuda de debajo de las placas (la región viva
 * que describe el modo) queda también a la vista, por encima de la barra de controles (§3.8.3, composición
 * intermedia; jurado de la 0.28, cierre: a 1024 × 768 quedaba entero bajo la barra). El navegador ya ha
 * desplazado la pantalla hasta la placa enfocada; aquí se desplaza lo justo para la ayuda (su
 * `scroll-margin` es el alto real de la barra) y, si las dos no caben juntas, manda la placa. La elegida
 * crece con una transición (`--bb-dur-tick`) que empuja la ayuda hacia abajo: se repite al acabar. Con el
 * ratón no se mueve nada: solo cuenta el foco que se ve (`:focus-visible`), el del teclado.
 */
function revealHelp(list: HTMLElement | null, help: HTMLElement | null) {
  const focused = document.activeElement
  if (!list || !help || !(focused instanceof HTMLElement) || !list.contains(focused)) return
  if (!focused.matches(':focus-visible')) return
  const reveal = () => {
    help.scrollIntoView({ block: 'nearest' })
    focused.scrollIntoView({ block: 'nearest' })
  }
  reveal()
  focused.addEventListener('transitionend', reveal, { once: true })
  // Sin transición (sin movimiento), el aviso no llega: no se deja esperando a la siguiente.
  setTimeout(() => focused.removeEventListener('transitionend', reveal), REVEAL_WAIT_MS)
}

/** Lo que se espera al final de la transición de la placa elegida (`--bb-dur-tick`, 90 ms) antes de soltarla. */
const REVEAL_WAIT_MS = 500

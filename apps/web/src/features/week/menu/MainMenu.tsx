import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { MOBILE_QUERY } from '../../../app/layout/ArenaBackdrop'
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
import { useMediaQuery } from '../../../ui/hooks/useMediaQuery'
import { useRovingMenu } from '../../../ui/hooks/useRovingMenu'
import { MenuPlate, useMenuPlateFit } from '../../../ui/MenuPlate'
import { RoundClock } from '../../../ui/RoundClock'
import { Tag } from '../../../ui/Tag'
import { TitleLockup } from '../../../ui/TitleLockup'
import styles from './MainMenu.module.css'
import { MENU_MODES, type MenuMode, type MenuModel } from './model'
import { StageCard } from './StageCard'
import { TitleGate } from './TitleGate'
import { shouldShowTitle } from './titleGate'

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

/**
 * La proporción del logo en dos líneas, para que el lockup (fuera del logo) se mida con él, y la del logo en
 * una, para el alto mínimo del logo en la tableta vertical y el reparto de lo que sobra (§3.8.3). Van en la
 * columna del título: las leen el logo, el lockup y el hueco de debajo de la tarjeta.
 */
const BRAND_STYLE = {
  '--game-logo-aspect': logoAspect(),
  '--game-logo-aspect-compact': logoAspect(true),
} as CSSProperties

/** Táctil: el mismo criterio que el CSS de los pliegues del móvil (`hover: none` o `pointer: coarse`). */
const TOUCH_QUERY = '(hover: none), (pointer: coarse)'

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
export function MainMenu({ model, title }: { model: MenuModel; title?: boolean }) {
  // Pantalla de título (§3.8.1, 1.13): la primera vez en la sesión, salvo que esté desactivada.
  const [gate, setGate] = useState(() => title ?? shouldShowTitle())
  const entries = menuEntries(model)
  const titleId = useId()
  const helpId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const brandRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLElement>(null)
  const firstEnabled = Math.max(0, model.player?.uploaded ? 1 : entries.findIndex((entry) => !entry.disabled))
  const revealHelp = useRevealHelp(listRef, helpRef)
  const menu = useRovingMenu({
    count: entries.length,
    initialIndex: firstEnabled,
    isDisabled: (index) => Boolean(entries[index]?.disabled),
    getLabel: (index) => t(`home.modes.${MENU_MODES[index]!}.label`),
    onMove: revealHelp,
  })
  const active = entries[menu.activeIndex] ?? entries[0]!
  // Un mismo cuerpo de rótulo y un mismo alto para todas las placas en reposo (§3.3).
  const fit = useMenuPlateFit(listRef)
  // Con la ventana baja, el logo deja al lockup su alto real (§3.1: la tarjeta no tapa la pegatina).
  useLockupExtent(brandRef)

  // Las flechas e Intro, con el foco en ningún control (la página recién cargada), van al menú.
  useIdleMenuKeys(menu, entries.length, listRef)

  // Composición estrecha con teclado y ratón (≤ 720 px sin táctil; §3.8.3 v0.6.7): no se pliega nada y la
  // tarjeta entera iba antes que las placas, así que el menú abría sin ninguna a la vista. Ahí «ELIGE MODO»,
  // sus placas y su ayuda van antes que la tarjeta, en la pantalla y en el DOM (el orden de lectura y de
  // Tab sigue al que se ve). En táctil, el orden de la maqueta.
  const narrow = useMediaQuery(MOBILE_QUERY)
  const touch = useMediaQuery(TOUCH_QUERY)
  const modesFirst = narrow && !touch
  const card = <StageCard week={model.week} nextDrop={model.nextDrop} />
  // En la tableta vertical, lo que sobra de alto se reparte alrededor de la tarjeta (CSS): necesita su alto. La
  // tarjeta cambia de sitio (`modesFirst`) y de pieza (sin semana, la del calendario vacío).
  useCardHeight(titleRef, `${modesFirst}|${Boolean(model.week)}`)

  const { week, player } = model
  // La crónica empieza por el crédito solo con la semana abierta a envíos; en `voting` la barra no invita
  // a subir y empieza por el cierre (§3.8.3 v0.6.7).
  const chronicle: ReactNode[] = !week
    ? [...model.chronicle]
    : week.phase === 'open'
      ? [<CreditLine key="credit" inside={Boolean(player?.uploaded)} />, ...model.chronicle]
      : [t('home.chronicle.closed'), ...model.chronicle]

  return (
    <div
      className={styles.menu}
      data-week={week ? week.phase : 'empty'}
      data-modes-first={modesFirst || undefined}
    >
      {gate && <TitleGate model={model} onDone={() => setGate(false)} />}
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

      <section ref={titleRef} className={styles.title} style={BRAND_STYLE} aria-label={t('home.title.label')}>
        {/* El logo y su lockup: con la ventana baja, el lockup se mide con el logo (proporción del lienzo). */}
        <div ref={brandRef} className={styles.brand}>
          <GameLogo className={styles.logoFull} />
          <GameLogo className={styles.logoCompact} compact />
          <TitleLockup className={styles.lockup} />
        </div>
        {!modesFirst && card}
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
      {modesFirst && card}
    </div>
  )
}

/**
 * Al mover el cursor con el teclado (o el mando), el panel de ayuda de debajo de las placas (la región viva
 * que describe el modo) queda también a la vista, por encima de la barra de controles (§3.8.3, composición
 * intermedia; jurado de la 0.28, cierre: a 1024 × 768 quedaba entero bajo la barra). El navegador ya ha
 * desplazado la pantalla hasta la placa enfocada; en el fotograma siguiente se desplaza lo justo para la
 * ayuda (su `scroll-margin` es el alto real de la barra) y, si las dos no caben juntas, manda la placa. La
 * elegida crece y la anterior encoge con su transición (`--bb-dur-tick`), que mueve la ayuda: al acabar
 * las dos, se repite. Con el ratón no se mueve nada: solo cuenta el foco que se ve (`:focus-visible`), el
 * del teclado.
 *
 * Cada movimiento anula el anterior (WCAG 2.4.11; revisión del cierre de la 0.28): con las flechas
 * repetidas deprisa, lo que dejó esperando un movimiento viejo (su fotograma, el final de sus transiciones)
 * ya no desplaza la pantalla hasta una placa que ha dejado de tener el foco, dejando fuera la enfocada. Y
 * solo se espera a las transiciones de alto de las placas que hay en marcha (`getAnimations`): sin ellas
 * (sin movimiento) no se espera nada, y ningún `transitionend` de otra pieza lo dispara.
 */
function useRevealHelp(
  listRef: RefObject<HTMLElement | null>,
  helpRef: RefObject<HTMLElement | null>,
): () => void {
  const moves = useRef(0)
  return useCallback(() => {
    const move = ++moves.current
    const current = () => move === moves.current
    requestAnimationFrame(() => {
      const list = listRef.current
      const help = helpRef.current
      const focused = document.activeElement
      if (!current() || !list || !help || !(focused instanceof HTMLElement) || !list.contains(focused)) return
      // Sin `scrollIntoView` (jsdom) no hay nada que desplazar.
      if (!focused.matches(':focus-visible') || typeof help.scrollIntoView !== 'function') return
      const reveal = () => {
        if (!current() || document.activeElement !== focused) return
        help.scrollIntoView({ block: 'nearest' })
        focused.scrollIntoView({ block: 'nearest' })
      }
      reveal()
      const resizing = list.getAnimations?.({ subtree: true }).filter(isPlateResize) ?? []
      if (resizing.length > 0) void Promise.allSettled(resizing.map((change) => change.finished)).then(reveal)
    })
  }, [listRef, helpRef])
}

/** Una transición de alto de una placa (la elegida crece, la anterior encoge; `MenuPlate`). */
function isPlateResize(animation: Animation): boolean {
  return (
    typeof CSSTransition !== 'undefined' &&
    animation instanceof CSSTransition &&
    (animation.transitionProperty === 'height' || animation.transitionProperty === 'min-height')
  )
}

/** Variable con lo que ocupa el lockup bajo el logo (`MainMenu.module.css`, ventana baja). */
const LOCKUP_EXTENT_VAR = '--menu-lockup-extent'

/**
 * Publica en la columna del título (la caja del logo, `.brand`, la hereda) lo que ocupa de verdad el lockup
 * (§3.1, §3.8.3): de su margen de arriba al de abajo, contando la pegatina girada que cuelga de la fila. Con
 * la ventana baja, el logo se queda con el alto que sobra; si la cinta parte en dos líneas (el espaciado de
 * texto de WCAG 1.4.12, la letra ampliada), el logo baja y la tarjeta de la semana ya no tapa el pie de la
 * pegatina. El ancho del
 * lockup no depende de esto (CSS), así que medirlo no cambia lo medido. Se vuelve a medir cuando cambia de
 * tamaño, en el fotograma siguiente.
 */
function useLockupExtent(brandRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const brand = brandRef.current
    const lockup = brand
      ?.querySelector<HTMLElement>('[data-otp-signature]')
      ?.closest<HTMLElement>(`.${styles.lockup}`)
    if (!brand || !lockup || typeof ResizeObserver === 'undefined') return
    // En la columna del título: también la lee el hueco de debajo de la tarjeta (la tableta vertical).
    const host = brand.parentElement ?? brand
    const update = () => {
      const box = lockup.getBoundingClientRect()
      if (box.height === 0) return
      const style = getComputedStyle(lockup)
      const sticker = lockup.querySelector('img')?.getBoundingClientRect()
      // La pegatina puede colgar dentro del margen de debajo (como en la maqueta): solo cuenta lo que pase.
      const top = box.top - Number.parseFloat(style.marginTop)
      const bottom = Math.max(box.bottom + Number.parseFloat(style.marginBottom), sticker?.bottom ?? 0)
      // Redondeado hacia arriba, sin el ruido de coma flotante de las restas (72,0000001 → 72, no 73).
      const value = `${Math.ceil(Math.round((bottom - top) * 100) / 100)}px`
      if (host.style.getPropertyValue(LOCKUP_EXTENT_VAR) !== value)
        host.style.setProperty(LOCKUP_EXTENT_VAR, value)
    }
    update()
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    })
    observer.observe(lockup)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [brandRef])
}

/** Variable con el alto de la tarjeta de la semana en la columna del título (`MainMenu.module.css`). */
const CARD_HEIGHT_VAR = '--menu-card-h'

/**
 * Publica en la columna del título el alto de la tarjeta de la semana (§3.8.3, tableta vertical; jurado de la
 * 0.28, ronda final, E5): con el logo en una línea, lo que sobra de alto se reparte a partes iguales entre el
 * lockup y la tarjeta y entre la tarjeta y «ELIGE MODO», y el CSS necesita saber cuánto sobra (el alto de la
 * columna menos el de la tarjeta). El alto de la tarjeta no depende de ese reparto (solo de su ancho y su
 * contenido): se actualiza dentro del aviso, sin bucle. Sin la tarjeta en la columna (la composición estrecha
 * con teclado la saca, `modesFirst`), no hay variable y no se reparte nada. `card` cambia cuando la tarjeta
 * cambia de sitio o de pieza: se vuelve a buscar.
 */
function useCardHeight(titleRef: RefObject<HTMLElement | null>, card: string) {
  useLayoutEffect(() => {
    // `card` solo está para volver a buscar la tarjeta cuando cambia de sitio o de pieza.
    void card
    const title = titleRef.current
    const article = title?.querySelector<HTMLElement>(':scope > article')
    if (!title || !article || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const value = `${Math.round(article.getBoundingClientRect().height * 100) / 100}px`
      if (title.style.getPropertyValue(CARD_HEIGHT_VAR) !== value)
        title.style.setProperty(CARD_HEIGHT_VAR, value)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(article)
    return () => {
      observer.disconnect()
      title.style.removeProperty(CARD_HEIGHT_VAR)
    }
  }, [titleRef, card])
}

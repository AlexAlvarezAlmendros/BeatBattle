import { useEffect, useId, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { type SimpleMessageKey, t } from '../../i18n'
import { Cursor } from '../../ui/Cursor'
import { frameAttributes } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { isEditableTarget } from '../../ui/hooks/roving'
import { useIdleMenuKeys } from '../../ui/hooks/useIdleMenuKeys'
import { useRovingMenu } from '../../ui/hooks/useRovingMenu'
import { Key } from '../../ui/Key'
import { singleKeyAllowed } from '../../ui/shortcuts'
import styles from './HowItWorksPage.module.css'

/** Una tecla de ayuda de un movimiento: lo que se ve y, si hace falta, cómo se lee. */
interface MoveKey {
  glyph: SimpleMessageKey
}

interface Move {
  id: 'sample' | 'flip' | 'vote'
  /** A dónde lleva Intro sobre el movimiento. */
  to: string
  /** Teclas o gesto con que se hace en el juego (§3.8.14: «cada uno con sus teclas o gestos»). */
  keys: readonly MoveKey[]
  /** Si las teclas son un intervalo («[1]–[5]», «del 1 al 5»). */
  range?: boolean
  /** Cómo se leen las teclas (las teclas se ocultan a los lectores de pantalla). */
  keysLabel?: SimpleMessageKey
}

/** Los tres movimientos (§3.8.14 «Cómo se juega»), con sus teclas o su gesto y a dónde llevan. */
const MOVES: readonly Move[] = [
  {
    id: 'sample',
    to: paths.home(),
    keys: [{ glyph: 'frame.keys.glyph.enter' }],
    keysLabel: 'howItWorks.moves.sample.keysLabel',
  },
  { id: 'flip', to: paths.upload(), keys: [] },
  {
    id: 'vote',
    to: paths.jury(),
    keys: [{ glyph: 'howItWorks.keys.one' }, { glyph: 'howItWorks.keys.five' }],
    range: true,
    keysLabel: 'howItWorks.moves.vote.keysLabel',
  },
]

/** Las reglas de juego limpio en cinco líneas (§1.3, §2.7, §2.8). */
const RULES = ['blind', 'listen', 'fairRound', 'bayes', 'xp'] as const

/** Tecla de «Bases de la competición» en esta pantalla. */
const BASES_KEY = 'b'

/**
 * `/como-funciona` — «Cómo se juega» como **lista de movimientos** de recreativa (guía §3.8.14): a la
 * izquierda, sobre la cuña, un menú de juego con los tres movimientos (1 Pilla el sample · 2 Cocina tu
 * flip · 3 Sube y vota, cada uno con sus teclas o su gesto), «Bases [B]» y «Volver al menú [ESC]»; a la
 * derecha, las cinco reglas de juego limpio como filas con índice, cada una con su nombre en display y
 * una línea de explicación (como las filas de `05-perfil`). La pantalla tiene poco contenido: su bloque
 * va centrado entre el HUD y la barra, a su alto natural (§3.8.14 «Reparto del alto»).
 *
 * Teclado (`RD-VIS-02` d, `RD-MOT-05`): `role="menu"` de una sola parada con el cursor y la etiqueta
 * 1P; ↑/↓ en bucle, Inicio/Fin y letra inicial; Intro entra; B abre las bases desde cualquier sitio de
 * la pantalla y Esc vuelve al menú (`useFrameKeys`). Con el foco en ningún control, las flechas e Intro
 * van a la lista. La marca «HECHO» de cada movimiento llega con las cuentas (Fase 2).
 */
export function HowItWorksPage() {
  const navigate = useNavigate()
  const listRef = useRef<HTMLUListElement>(null)
  const listLabelId = useId()
  const rulesId = useId()
  const count = MOVES.length + 2
  const menu = useRovingMenu({
    count,
    getLabel: (index) =>
      index < MOVES.length
        ? t(`howItWorks.moves.${MOVES[index]!.id}.title`)
        : index === MOVES.length
          ? t('legal.docs.bases')
          : t('screen.backToMenu'),
  })
  useIdleMenuKeys(menu, count, listRef)

  // B abre las bases desde cualquier sitio de la pantalla (en captura: antes que la letra inicial del
  // menú, que si no la usaría para saltar a «Bases»). Con los atajos de una tecla apagados, solo con el
  // foco en la lista de movimientos (WCAG 2.1.4, `ui/shortcuts.ts`).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (isEditableTarget(event.target) || event.key.toLowerCase() !== BASES_KEY) return
      if (!singleKeyAllowed(listRef.current?.contains(document.activeElement) ?? false)) return
      event.preventDefault()
      navigate(paths.legal('bases'))
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [navigate])

  const moveList = (
    <ul ref={listRef} {...menu.getContainerProps({ 'aria-labelledby': listLabelId })} className={styles.list}>
      {MOVES.map((move, index) => (
        <li key={move.id} role="none">
          <MovePlate move={move} number={index + 1} itemProps={menu.getItemProps(index)} />
        </li>
      ))}
      <li role="none">
        <Link
          to={paths.legal('bases')}
          {...menu.getItemProps(MOVES.length)}
          {...frameAttributes({ cut: 'md' })}
          className={cx(styles.option, styles.optionBases)}
        >
          <Cursor cut="md" player />
          <span className={styles.optionLabel}>{t('legal.docs.bases')}</span>
          <Key aria-hidden="true">{t('howItWorks.keys.bases')}</Key>
        </Link>
      </li>
      <li role="none">
        <Link
          to={paths.home()}
          {...menu.getItemProps(MOVES.length + 1)}
          {...frameAttributes({ cut: 'md' })}
          className={styles.option}
        >
          <Cursor cut="md" player />
          <span className={styles.optionLabel}>{t('screen.backToMenu')}</span>
          <Key aria-hidden="true">{t('frame.keys.glyph.escape')}</Key>
        </Link>
      </li>
    </ul>
  )

  return (
    <ScreenPage
      title={t('pages.howItWorks.title')}
      kicker={t('frame.plates.howItWorks')}
      summary={t('pages.howItWorks.summary')}
      actions={null}
      piece={
        <nav className={styles.moves} aria-labelledby={listLabelId}>
          {/* El rótulo ya se ve en la placa del HUD («LISTA DE MOVIMIENTOS · CÓMO SE JUEGA»). */}
          <h2 id={listLabelId} className="sr-only">
            {t('frame.plates.howItWorks')}
          </h2>
          {moveList}
        </nav>
      }
    >
      <section className={styles.rules} aria-labelledby={rulesId}>
        <h2 id={rulesId} className={cx('bb-label', styles.rulesTitle)}>
          {t('howItWorks.rulesTitle')}
        </h2>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ol role="list" className={styles.ruleList}>
          {RULES.map((rule, index) => (
            <li key={rule} className={styles.rule}>
              <span className={styles.ruleIndex} aria-hidden="true">
                {t('howItWorks.ruleIndex', { index: String(index + 1).padStart(2, '0') })}
              </span>
              <p className={styles.ruleBody}>
                <b className={cx('bb-display', styles.ruleTitle)}>{t(`howItWorks.rules.${rule}.title`)}</b>
                <span className={styles.ruleText}>{t(`howItWorks.rules.${rule}.text`)}</span>
              </p>
            </li>
          ))}
        </ol>
      </section>
    </ScreenPage>
  )
}

/**
 * Un movimiento de la lista (§3.8.14): placa de marco con el número en Oxanium rojo, el nombre en
 * display, su texto y sus teclas o su gesto como ayuda (teclas oscuras con su verbo, como en la barra
 * de controles: no son la acción de la placa). Elegido = enfocado: relleno rojo, cursor y 1P.
 */
function MovePlate({
  move,
  number,
  itemProps,
}: {
  move: Move
  number: number
  itemProps: ReturnType<ReturnType<typeof useRovingMenu>['getItemProps']>
}) {
  const titleId = useId()
  const textId = useId()
  return (
    <Link
      to={move.to}
      {...itemProps}
      {...frameAttributes({ cut: 'base' })}
      className={styles.move}
      aria-labelledby={titleId}
      aria-describedby={textId}
    >
      <Cursor cut="base" player />
      <span className={styles.number} aria-hidden="true">
        {t('howItWorks.moveNumber', { number })}
      </span>
      <span className={cx('bb-display', styles.moveTitle)} id={titleId}>
        {t(`howItWorks.moves.${move.id}.title`)}
      </span>
      <span className={styles.moveText} id={textId}>
        {t(`howItWorks.moves.${move.id}.text`)}{' '}
        <span className={styles.inputs}>
          {move.keys.length > 0 ? (
            <>
              <span className={styles.keys} aria-hidden="true">
                {move.keys.map((key, index) => (
                  <span key={key.glyph} className={styles.keyGroup}>
                    {move.range && index > 0 && (
                      <span className={styles.dash}>{t('howItWorks.keys.dash')}</span>
                    )}
                    <Key>{t(key.glyph)}</Key>
                  </span>
                ))}
              </span>
              {move.keysLabel && <span className="sr-only">{t(move.keysLabel)}</span>}
            </>
          ) : null}
          <span aria-hidden={move.keys.length > 0 || undefined}>
            {t(`howItWorks.moves.${move.id}.gesture`)}
          </span>
        </span>
      </span>
    </Link>
  )
}

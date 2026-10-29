import { type AchievementId, isAchievementId, LEVEL_MAX, levelOf, xpForLevel } from '@beatbattle/rules'
import type { GameDelta, Me } from '@beatbattle/shared'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { useSession } from '../account/session'
import { achievementXp, applyGameDelta } from './rewards'

/** La sesión de muestra: LilBru, nivel 7, de las maquetas aprobadas (`01-menu`). */
function sampleMe(params: URLSearchParams): Me {
  const xp = Number(params.get('xp') ?? 2980)
  const levelSeen = Number(params.get('nivelVisto') ?? levelOf(xp))
  const pending = (params.get('pendientes') ?? '').split(',').filter(isAchievementId)
  const position = params.get('puesto')
  return {
    id: 'dev-rewards',
    email: 'lilbru@example.com',
    emailVerified: true,
    username: 'lilbru',
    displayUsername: params.get('nombre') ?? 'LilBru',
    role: 'user',
    cardNumber: 42,
    xp,
    avatarUrl: null,
    game: {
      xp,
      level: levelOf(xp),
      levelSeen,
      streak: { current: Number(params.get('racha') ?? 3), best: 5, jokerAvailable: true },
      season: params.has('sinTemporada')
        ? null
        : {
            id: '2026-T4',
            points: Number(params.get('puntos') ?? 12),
            position: position === 'no' ? null : Number(position ?? 9),
          },
      unseenAchievements: pending,
      seasonCeremony: null,
    },
  }
}

/** Lo que ganaría un hecho de muestra: el XP del hecho, el de sus logros y el nivel al que llega. */
function deltaOf(eventXp: number, achievements: AchievementId[]): GameDelta {
  const xp = eventXp + achievements.reduce((sum, id) => sum + achievementXp(id), 0)
  const current = useSession.getState().me?.game.xp ?? 0
  return { xp, achievements, level: levelOf(current + xp) }
}

declare global {
  interface Window {
    /** Para capturas (`tools/shot --eval`): lanza las recompensas de muestra sin pulsar. */
    __bbRewards?: Record<string, (anchor?: Element | null) => void>
  }
}

/**
 * `/dev/recompensas` — banco de la capa de juego del HUD (tareas 7.18–7.20), solo en desarrollo: una sesión de muestra
 * (LilBru, nivel 7, «T4 · 12 PTS · 9.º», racha ×3) y botones que lanzan lo que daría la API: el «+5 XP» del voto que
 * vuela al medidor, los avisos de logro de cada rareza, el legendario al centro y la subida de nivel. Parámetros:
 * `?xp=3340` (XP de partida), `?nivelVisto=6` (una subida pendiente al cargar), `?pendientes=first_vote,early_bird`
 * (logros sin ver al cargar), `?racha=0`, `?puntos=0&puesto=no`, `?sinTemporada`, `?nombre=…`. `window.__bbRewards`
 * lanza cada uno desde la consola o desde `tools/shot --eval`.
 */
export function DevRewardsPage() {
  const [params] = useSearchParams()
  // biome-ignore lint/correctness/useExhaustiveDependencies: la sesión de muestra se fija una vez al entrar
  useEffect(() => {
    const me = sampleMe(params)
    const apply = () => useSession.setState({ status: 'signedIn', me })
    apply()
    // La lectura de la sesión del marco (sin cuenta en desarrollo) la quitaría: se vuelve a poner.
    const unsubscribe = useSession.subscribe((state) => {
      if (!state.me || state.me.id !== me.id) apply()
    })
    return () => {
      unsubscribe()
      useSession.setState({ status: 'anonymous', me: null })
      void useSession.getState().refresh()
    }
  }, [])

  const fire: Record<string, (anchor?: Element | null) => void> = {
    vote: (anchor) => applyGameDelta(deltaOf(5, []), { anchor }),
    voteCombo: (anchor) => applyGameDelta(deltaOf(5, []), { anchor, combo: 4 }),
    upload: (anchor) => applyGameDelta(deltaOf(125, ['first_entry', 'early_bird']), { anchor }),
    common: (anchor) => applyGameDelta(deltaOf(5, ['first_vote']), { anchor }),
    rare: (anchor) => applyGameDelta(deltaOf(0, ['jury_full']), { anchor }),
    epic: () => applyGameDelta(deltaOf(0, ['golden_ear'])),
    legendary: () => applyGameDelta(deltaOf(0, ['win_3'])),
    stack: () => applyGameDelta(deltaOf(0, ['first_drop', 'votes_100', 'unanimous', 'night_owl'])),
    level: (anchor) => {
      const xp = useSession.getState().me?.game.xp ?? 0
      const level = levelOf(xp)
      const next = Math.min(LEVEL_MAX, level + 1)
      // Lo justo para el nivel siguiente (el de las maquetas: de 7 a 8).
      applyGameDelta({ xp: Math.max(5, xpForLevel(next) - xp), achievements: [], level: next }, { anchor })
    },
  }
  useEffect(() => {
    window.__bbRewards = fire
    return () => {
      delete window.__bbRewards
    }
  })

  const button = (key: keyof typeof fire & string, label: string) => (
    <Button variant="outline" onClick={(event) => fire[key]?.(event.currentTarget)}>
      {label}
    </Button>
  )

  return (
    <ScreenPage title={t('dev.rewards.title')} summary={t('dev.rewards.summary')} actions={null}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--bb-space-3)' }}>
        {button('vote', t('dev.rewards.vote'))}
        {button('upload', t('dev.rewards.upload'))}
        {button('common', t('dev.rewards.common'))}
        {button('rare', t('dev.rewards.rare'))}
        {button('epic', t('dev.rewards.epic'))}
        {button('legendary', t('dev.rewards.legendary'))}
        {button('level', t('dev.rewards.level'))}
        {button('stack', t('dev.rewards.stack'))}
      </div>
    </ScreenPage>
  )
}

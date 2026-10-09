import { levelProgress } from '@beatbattle/rules'
import { Navigate } from 'react-router'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { ProducerCard } from '../../ui/ProducerCard'
import { initialsOf, playerOf, useSession } from './session'
import styles from './WelcomePage.module.css'

/** «10/2026» a partir del número de mes y año de alta (la carta solo dice desde cuándo). */
function sinceOf(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

/**
 * `/bienvenida` (guía §3.8.9, tarea 2.17; versión simple): tras verificar el email, «NUEVO JUGADOR» y la
 * carta de luchador se **imprime** saliendo de una ranura de abajo arriba con su número, «Bienvenido a la
 * batalla» y el primer logro por ganar. Sin movimiento, la carta ya está fuera (Anexo E). Sin sesión, a
 * entrar.
 */
export function WelcomePage() {
  const me = useSession((state) => state.me)
  const status = useSession((state) => state.status)
  if (status === 'anonymous') return <Navigate to={paths.signIn()} replace />
  if (!me) return null
  const player = playerOf(me)
  const progress = levelProgress(me.xp)
  return (
    <ScreenPage
      title={t('account.welcome.title')}
      kicker={t('frame.plates.signUp')}
      summary={t('account.welcome.summary', { name: me.displayUsername })}
      piece={
        <div className={styles.slot} data-welcome-slot="">
          <div className={styles.print}>
            <ProducerCard
              name={me.displayUsername}
              initials={initialsOf(me.displayUsername)}
              cardNumber={me.cardNumber}
              level={player.level}
              levelFraction={progress.fraction}
              rank={player.rank}
              stats={{ wins: 0, podiums: 0, weeks: 0 }}
              since={sinceOf(new Date())}
            />
          </div>
        </div>
      }
    >
      <div className={styles.body}>
        <section className={styles.goal} aria-labelledby="welcome-goal">
          <h2 id="welcome-goal" className="bb-label">
            {t('account.welcome.goalTitle')}
          </h2>
          <p className={styles.goalName}>{t('account.welcome.goalName')}</p>
          <p className={styles.goalHow}>{t('account.welcome.goalHow')}</p>
        </section>
        <Button to="/" fullWidth keyHint={t('frame.keys.glyph.enter')}>
          {t('account.welcome.play')}
        </Button>
        <Button to={paths.settings('perfil')} variant="outline" fullWidth>
          {t('account.welcome.profile')}
        </Button>
      </div>
    </ScreenPage>
  )
}

import { GameLogo } from '../../ui/GameLogo'
import { TitleLockup } from '../../ui/TitleLockup'
import styles from './TitlePiece.module.css'

/**
 * El logo del juego con el mismo lockup que el menú (§3.1 «La firma»): la pieza de las pantallas de cuenta
 * y de las que se abren desde un email (la baja), en el marco simple.
 */
export function TitlePiece() {
  return (
    <div className={styles.title} data-title-piece="">
      <GameLogo className={styles.logo} />
      <TitleLockup className={styles.lockup} />
    </div>
  )
}

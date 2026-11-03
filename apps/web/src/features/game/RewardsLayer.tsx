import { FloatXpLayer } from './FloatXp'
import { Notices } from './Notices'

/**
 * La parte animada de las recompensas (tareas 7.19 y 7.20), en su propio trozo: Motion y las piezas solo se
 * descargan tras la primera pintura o cuando llega la primera recompensa (`RewardsViewport`, §4.17): el «+XP» que vuela
 * al medidor y los avisos de logro y de nivel.
 */
export function RewardsLayer() {
  return (
    <>
      <FloatXpLayer />
      <Notices />
    </>
  )
}

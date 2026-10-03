import { DocumentTitle } from '../../app/DocumentTitle'
import { t } from '../../i18n'
import { MainMenu } from './menu/MainMenu'
import type { MenuModel } from './menu/model'

/** Mensajes de la crónica con el calendario vacío (en la Fase 3 llega la crónica viva, §3.8.3). */
export const IDLE_CHRONICLE = [
  'home.chronicle.idle.nextDrop',
  'home.chronicle.idle.everyMonday',
  'home.chronicle.idle.flip',
  'home.chronicle.idle.vote',
  'home.chronicle.idle.seal',
] as const

/**
 * `/` — el menú principal (guía §3.8.3; tarea 0.24) en el estado «calendario vacío» y visitante
 * (§2.19): aún no hay semanas ni cuentas. Sin reloj, Jugar deshabilitado con su motivo, Jurado lleva a
 * entrar, Resultados sin semanas selladas y, en la tarjeta de la semana, el hueco del formulario
 * «Avísame del próximo drop» (§2.12.3, Fase 3). Los demás estados se ven en `/dev/menu`.
 */
export function HomePage() {
  const model: MenuModel = {
    week: null,
    player: null,
    lastSealed: null,
    chronicle: IDLE_CHRONICLE.map((key) => t(key)),
  }
  return (
    <>
      <DocumentTitle />
      <MainMenu model={model} />
    </>
  )
}

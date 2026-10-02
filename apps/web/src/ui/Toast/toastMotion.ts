import { domMax } from 'motion/react'

/**
 * Funciones de Motion que usan los avisos: las de `domAnimation` más `layout` (y el arrastre, que
 * viene en el mismo paquete). Es el único sitio que las importa, para que vayan en su propio trozo y
 * se pidan en diferido (`LazyMotion` en `ToastList`), nunca en el trozo inicial (§4.17).
 */
export default domMax

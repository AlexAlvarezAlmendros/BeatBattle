import type { CardSurface } from '../../ui/Card'
import { ToastViewport } from '../../ui/Toast'
import { ComponentsSection } from './ComponentSections'
import {
  ColorSection,
  MotionSection,
  RadiiSection,
  ShadowsSection,
  SpacingSection,
  TypographySection,
} from './FoundationSections'

/**
 * El cuerpo de la galería: tokens, movimiento y componentes. Se carga aparte (`React.lazy` en
 * `GalleryPage`) porque arrastra todos los componentes y Motion.
 */
export function GalleryContent({ surface }: { surface: CardSurface }) {
  return (
    <>
      <ColorSection />
      <TypographySection />
      <SpacingSection />
      <RadiiSection />
      <ShadowsSection />
      <MotionSection />
      <ComponentsSection surface={surface} />
      <ToastViewport />
    </>
  )
}

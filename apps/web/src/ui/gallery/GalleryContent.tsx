import type { CardSurface } from '../Card'
import { GlassProvider } from '../glass'
import { ComponentsSection } from './ComponentSections'
import {
  ColorSection,
  MotionSection,
  RadiiSection,
  ShadowsSection,
  SpacingSection,
  TypographySection,
} from './FoundationSections'
import { LayoutSection } from './LayoutSection'

/**
 * El cuerpo de la galería: tokens, movimiento, componentes y layout del sello. Se carga aparte
 * (`React.lazy` en `GalleryPage`) porque arrastra todos los componentes y Motion.
 *
 * Con el interruptor de cristal apagado, además de tarjetas y modales macizos, las `GlassSurface` de
 * dentro pasan a su alternativa (`GlassProvider`), como en calidad baja. Los avisos de prueba salen en
 * la zona de avisos del marco (`RootLayout`), la misma que en el resto de la app.
 */
export function GalleryContent({ surface }: { surface: CardSurface }) {
  return (
    <GlassProvider enabled={surface === 'glass'}>
      <ColorSection />
      <TypographySection />
      <SpacingSection />
      <RadiiSection />
      <ShadowsSection />
      <MotionSection />
      <ComponentsSection surface={surface} />
      <LayoutSection />
    </GlassProvider>
  )
}

// Fixture: estilos en línea con valores literales y piezas prohibidas que deben fallar.
import { GlassSurface } from './GlassSurface'

export function Badge() {
  return (
    <GlassSurface>
      <span
        style={{
          color: '#ff003c',
          borderRadius: 8,
          boxShadow: '0 0 12px rgba(255, 0, 60, 0.4)',
          transition: 'opacity 200ms',
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 1 1">
          <rect fill="white" width="1" height="1" />
        </svg>
      </span>
    </GlassSurface>
  )
}

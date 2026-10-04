// Fixture: estilos en línea con tokens; nada de esto debe fallar. Un '#fff' en un comentario no cuenta.
import { Frame } from './Frame'

export function Badge({ label }: { label: string }) {
  return (
    <Frame>
      <a
        href="#contenido"
        style={{
          color: 'var(--bb-red)',
          borderRadius: 0,
          boxShadow: 'var(--bb-shadow-hard)',
          transition: `opacity var(--bb-dur-fast) var(--bb-ease-out)`,
          transform: 'rotate(var(--bb-tilt-sticker))',
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 1 1">
          <rect fill="currentColor" width="1" height="1" strokeWidth="2" />
        </svg>
        {label}
      </a>
    </Frame>
  )
}

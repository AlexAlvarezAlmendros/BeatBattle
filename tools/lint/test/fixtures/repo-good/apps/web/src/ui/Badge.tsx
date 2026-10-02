// Fixture: estilos en línea con tokens; nada de esto debe fallar. Un '#fff' en un comentario no cuenta.
export function Badge({ label }: { label: string }) {
  return (
    <a
      href="#contenido"
      style={{
        color: 'var(--bb-red)',
        borderRadius: 0,
        boxShadow: 'var(--bb-shadow-card)',
        transition: `opacity var(--bb-dur-fast) var(--bb-ease-out)`,
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 1 1">
        <rect fill="currentColor" width="1" height="1" />
      </svg>
      {label}
    </a>
  )
}

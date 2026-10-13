/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Section } from '@react-email/components'
import type { ReactNode } from 'react'
import { mail } from '../theme'

/**
 * El ticket del recibo (§3.8.12, §2.12.1): filas «dato · valor» entre dos líneas troqueladas (borde
 * discontinuo), con el número de recibo arriba.
 */
export function Ticket({ code, rows }: { code: string; rows: readonly [string, ReactNode][] }) {
  return (
    <Section
      style={{
        borderTop: `2px dashed ${mail.text3}`,
        borderBottom: `2px dashed ${mail.text3}`,
        margin: '16px 0',
        padding: '12px 0',
      }}
    >
      <p
        style={{
          color: mail.red,
          fontFamily: mail.font,
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          lineHeight: '24px',
          margin: '0 0 8px',
        }}
      >
        {code}
      </p>
      {/* Párrafos y no una tabla: en el texto plano cada dato sale en su línea («Alias TIGRE PÚRPURA»). */}
      {rows.map(([label, value]) => (
        <p
          key={label}
          style={{
            color: mail.text,
            fontFamily: mail.font,
            fontSize: `${mail.small}px`,
            lineHeight: '20px',
            margin: '0',
            padding: '4px 0',
          }}
        >
          <span
            style={{
              color: mail.text2,
              display: 'inline-block',
              letterSpacing: '0.12em',
              minWidth: '112px',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </span>{' '}
          <strong>{value}</strong>
        </p>
      ))}
    </Section>
  )
}

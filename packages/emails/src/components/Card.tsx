/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Section } from '@react-email/components'
import type { ReactNode } from 'react'
import { mail } from '../theme'

/** Tarjeta del cuerpo (§3.8.12): `#0e0e10` con borde de 2 px. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <Section
      {...{ bgcolor: mail.card }}
      style={{
        backgroundColor: mail.card,
        border: `2px solid ${mail.cardBorder}`,
        padding: '24px',
        margin: '16px 0',
      }}
    >
      {children}
    </Section>
  )
}

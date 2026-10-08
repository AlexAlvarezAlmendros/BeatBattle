/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Heading as BaseHeading, Text as BaseText } from '@react-email/components'
import type { ReactNode } from 'react'
import { mail } from '../theme'

/** Título de un email: Chakra Petch en mayúsculas con interletraje, como los rótulos del juego. */
export function Heading({ children }: { children: ReactNode }) {
  return (
    <BaseHeading
      as="h1"
      style={{
        color: mail.text,
        fontFamily: mail.font,
        fontSize: '26px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        lineHeight: '32px',
        margin: '0 0 16px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </BaseHeading>
  )
}

/** Párrafo del cuerpo: 16 px (nunca menos de 14, §3.8.12). */
export function Paragraph({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <BaseText
      style={{
        color: muted ? mail.text2 : mail.text,
        fontSize: `${mail.body}px`,
        lineHeight: '24px',
        margin: '0 0 12px',
      }}
    >
      {children}
    </BaseText>
  )
}

/** Rótulo pequeño en rojo (el «kicker» de las tarjetas del juego). */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <BaseText
      style={{
        color: mail.red,
        fontSize: `${mail.small}px`,
        fontWeight: 700,
        letterSpacing: '0.18em',
        lineHeight: '20px',
        margin: '0 0 8px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </BaseText>
  )
}

import { Body, Container, Head, Html, Preview } from '@react-email/components'
import type { ReactNode } from 'react'
import { mail } from '../theme'
import { Footer } from './Footer'
import { Header } from './Header'

/**
 * Esqueleto de todos los emails (guía §3.8.12): 600 px, fondo negro también como `bgcolor`, `lang="es"`,
 * modo oscuro declarado (`color-scheme` y `supported-color-schemes`), *preheader* oculto, cabecera con el
 * logo del juego y la pegatina OTP, el cuerpo y el pie con la firma y la baja.
 */
export function Layout({ preheader, children }: { preheader: string; children: ReactNode }) {
  return (
    <Html lang="es" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{':root { color-scheme: light dark; supported-color-schemes: light dark; }'}</style>
      </Head>
      <Preview>{preheader}</Preview>
      <Body
        // `bgcolor` además del CSS: muchos clientes ignoran el fondo por CSS.
        {...{ bgcolor: mail.background }}
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: mail.background,
          fontFamily: mail.font,
          color: mail.text,
        }}
      >
        <Container
          {...{ bgcolor: mail.background }}
          style={{
            width: '100%',
            maxWidth: `${mail.width}px`,
            backgroundColor: mail.background,
            padding: '0 16px',
          }}
        >
          <Header />
          {children}
          <Footer />
        </Container>
      </Body>
    </Html>
  )
}

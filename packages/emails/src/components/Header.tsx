/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Img, Link, Section } from '@react-email/components'
import { useEmail } from '../context'
import images from '../images.json'

/**
 * Cabecera (guía §3.8.12): una sola imagen con la **cuña granate** y su diagonal, el logo del juego (con su
 * extrusión, sobrevive a cualquier cliente) y la pegatina OTP a su lado, como el lockup de la web, sobre
 * fondo negro propio (`tools/brand/email-images.mjs`). Nada de texto HTML encima: la cuña no va bajo texto.
 */
export function Header() {
  const { publicUrl } = useEmail()
  return (
    <Section style={{ padding: '16px 0 8px' }}>
      <Link href={publicUrl}>
        <Img
          src={`${publicUrl}${images.header.path}`}
          width={images.header.width}
          height={images.header.height}
          alt="Beat Battle, by Other People Records"
          style={{
            display: 'block',
            border: 0,
            width: '100%',
            maxWidth: `${images.header.width}px`,
            height: 'auto',
          }}
        />
      </Link>
    </Section>
  )
}

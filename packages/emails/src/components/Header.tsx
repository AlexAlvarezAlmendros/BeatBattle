import { Column, Img, Link, Row, Section } from '@react-email/components'
import { useEmail } from '../context'
import images from '../images.json'

/**
 * Cabecera (guía §3.8.12): el logo del juego como imagen (con su extrusión, sobrevive a cualquier cliente) y
 * la pegatina OTP al lado, las dos con fondo negro propio (`tools/brand/email-images.mjs`).
 */
export function Header() {
  const { publicUrl } = useEmail()
  return (
    <Section style={{ padding: '24px 0 8px' }}>
      <Row>
        <Column>
          <Link href={publicUrl}>
            <Img
              src={`${publicUrl}${images.logo.path}`}
              width={images.logo.width}
              height={images.logo.height}
              alt="Beat Battle"
              style={{ display: 'block', border: 0 }}
            />
          </Link>
        </Column>
        <Column align="right" style={{ verticalAlign: 'bottom' }}>
          <Img
            src={`${publicUrl}${images.slap.path}`}
            width={Math.round(images.slap.width / 2)}
            height={Math.round(images.slap.height / 2)}
            alt="by Other People Records"
            style={{ display: 'block', border: 0 }}
          />
        </Column>
      </Row>
    </Section>
  )
}

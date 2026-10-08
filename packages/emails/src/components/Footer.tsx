/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Hr, Img, Link, Section, Text } from '@react-email/components'
import { type EmailFamily, useEmail } from '../context'
import images from '../images.json'
import { mail } from '../theme'

/** «Recibes este email porque…» según la familia (Anexo H). */
const WHY: Record<EmailFamily, string> = {
  service: 'Recibes este email porque es necesario para usar tu cuenta de Beat Battle.',
  battle: 'Recibes este aviso porque juegas en Beat Battle y lo tienes activado.',
  marketing: 'Recibes este email porque aceptaste las novedades de Beat Battle.',
}

const small = { color: mail.text3, fontSize: `${mail.small}px`, lineHeight: '20px', margin: '8px 0' }

/**
 * Pie de todos los emails (Anexo H): la firma del sello, por qué lo recibe, la baja de ese tipo (salvo los
 * de servicio) y las preferencias. Ni píxeles ni parámetros por persona en las imágenes (`RF-NOTIF-12`).
 */
export function Footer() {
  const { publicUrl, family, unsubscribePageUrl, postalAddress } = useEmail()
  return (
    <Section style={{ padding: '8px 0 32px' }}>
      <Hr style={{ borderColor: mail.cardBorder, margin: '16px 0' }} />
      <Img
        src={`${publicUrl}${images.slap.path}`}
        width={Math.round(images.slap.width / 4)}
        height={Math.round(images.slap.height / 4)}
        alt="Other People Records"
        style={{ display: 'inline-block', border: 0, verticalAlign: 'middle' }}
      />
      <Text style={{ ...small, display: 'inline-block', margin: '0 0 0 8px', verticalAlign: 'middle' }}>
        Un juego de Other People Records
      </Text>
      <Text style={small}>{WHY[family]}</Text>
      <Text style={small}>
        {unsubscribePageUrl && (
          <>
            <Link href={unsubscribePageUrl} style={{ color: mail.text2, textDecoration: 'underline' }}>
              Darme de baja de este tipo de email
            </Link>
            {' · '}
          </>
        )}
        <Link href={`${publicUrl}/ajustes/emails`} style={{ color: mail.text2, textDecoration: 'underline' }}>
          Preferencias de email
        </Link>
      </Text>
      {postalAddress && <Text style={small}>{postalAddress}</Text>}
    </Section>
  )
}

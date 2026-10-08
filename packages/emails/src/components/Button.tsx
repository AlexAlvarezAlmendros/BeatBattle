/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { mail } from '../theme'

/**
 * Botón «a prueba de balas» (§3.8.12): una tabla con el color en `bgcolor` de la celda y el enlace con su
 * relleno dentro. Es rectangular, así que Outlook lo pinta igual con la celda: no hace falta VML.
 */
export function Button({ href, children }: { href: string; children: string }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ margin: '24px 0' }}>
      <tbody>
        <tr>
          <td {...{ bgcolor: mail.button }} style={{ backgroundColor: mail.button }}>
            <a
              href={href}
              target="_blank"
              rel="noopener"
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                color: mail.buttonText,
                fontFamily: mail.font,
                fontSize: `${mail.body}px`,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textDecoration: 'none',
                textTransform: 'uppercase',
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

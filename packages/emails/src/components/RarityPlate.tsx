/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { GameRarity } from '../game'
import { RARITY_NAMES, xpText } from '../game'
import { mail } from '../theme'

/**
 * La placa de rareza de un logro (§3.8.12): el marco del aviso de §3.8.8 llevado a la paleta del email. Épico,
 * granate con borde rojo; legendario, el rojo del botón con borde blanco (blanco sobre `#e6003a` pasa el AA). Una
 * tabla con el color en la celda, como el botón: Outlook la pinta igual.
 */
export function RarityPlate({ rarity, xp }: { rarity: GameRarity; xp: number }) {
  const legendary = rarity === 'legendary'
  const fill = legendary ? mail.button : mail.wine
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ margin: '0 0 12px' }}>
      <tbody>
        <tr>
          <td
            {...{ bgcolor: fill }}
            style={{
              backgroundColor: fill,
              border: `2px solid ${legendary ? mail.white : mail.red}`,
              color: mail.white,
              fontFamily: mail.font,
              fontSize: `${mail.small}px`,
              fontWeight: 700,
              letterSpacing: '0.14em',
              lineHeight: '20px',
              padding: '4px 10px',
              textTransform: 'uppercase',
            }}
          >
            Logro {RARITY_NAMES[rarity]} · +{xpText(xp)}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

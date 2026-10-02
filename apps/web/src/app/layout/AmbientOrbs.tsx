import './AmbientOrbs.css'

/**
 * Fondo ambiental de toda la página: los tres orbes rojos en CSS del sello (`listing-orb`, de
 * `ReactOtpWeb/.../ListingPage.css`, que su `SilkBackground` usa como alternativa al Silk). Fijo detrás
 * del contenido, decorativo y sin eventos.
 *
 * El Silk en WebGL llega con el Escenario (tarea 1.1), que usará estos orbes como alternativa en
 * calidad baja o apagada (§3.5) y mientras carga. Con «reducir movimiento», los orbes quedan quietos.
 */
export function AmbientOrbs() {
  return (
    <div className="ambient-orbs" aria-hidden="true">
      <div className="ambient-orbs__orb ambient-orbs__orb--1" />
      <div className="ambient-orbs__orb ambient-orbs__orb--2" />
      <div className="ambient-orbs__orb ambient-orbs__orb--3" />
    </div>
  )
}

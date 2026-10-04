import { createContext, type ReactNode, useContext } from 'react'

/** ¿Se permite el cristal aquí dentro? Por defecto, sí: decide la detección (`useGlassCapability`). */
export const GlassAllowedContext = createContext(true)

/**
 * Apaga el cristal de las `GlassSurface` de dentro, que pasan a su alternativa sin capacidad (la misma
 * que en un equipo modesto o con «reducir movimiento»). Sirve para la calidad baja (§3.5) y para
 * enseñar las dos variantes en la galería.
 *
 * Solo puede apagarlo: con `enabled` sigue mandando la detección, y dentro de un proveedor apagado
 * otro encendido no lo vuelve a encender.
 */
export function GlassProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const parentAllows = useContext(GlassAllowedContext)
  return <GlassAllowedContext value={parentAllows && enabled}>{children}</GlassAllowedContext>
}

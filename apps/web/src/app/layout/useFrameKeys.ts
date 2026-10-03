import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { isEditableTarget } from '../../ui/hooks/roving'
import { paths } from '../paths'
import { useSound } from './soundStore'

/**
 * Teclas globales del marco de juego (guía §3.3, §3.4.1; tarea 0.23), las que la barra de controles
 * enseña en todas las pantallas:
 *
 * - **Esc — VOLVER**: de una pantalla interior al menú principal. En el menú no hace nada (es el nivel
 *   de arriba). Un diálogo abierto se queda su Esc (lo consume antes de llegar aquí).
 * - **M — SONIDO**: enciende o apaga los efectos (`RD-SND-06`).
 *
 * No roban teclas: se ignoran con modificadores, dentro de un campo de texto y cuando una pieza ya las
 * ha usado (`defaultPrevented`, p. ej. la letra inicial de un menú, §3.3).
 */
export function useFrameKeys(): void {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const toggleSound = useSound((state) => state.toggle)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      if (event.key === 'Escape') {
        if (pathname === paths.home() || document.querySelector('[aria-modal="true"]')) return
        event.preventDefault()
        navigate(paths.home())
        return
      }
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        toggleSound()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigate, pathname, toggleSound])
}

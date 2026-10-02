import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'error'

/** Cierre automático por defecto, en ms (se pausa con el ratón encima o con el foco dentro). */
export const TOAST_DURATION_MS = 4000

/** Avisos a la vez como mucho: al pasar, se va el más antiguo. */
export const TOAST_LIMIT = 4

export interface ToastData {
  id: string
  tone: ToastTone
  title: string
  message?: string
  /** Milisegundos hasta cerrarse solo; `null`, se queda hasta que se cierre a mano. */
  duration: number | null
}

export type ToastInput = Omit<ToastData, 'id' | 'duration'> & { duration?: number | null }

interface ToastStore {
  toasts: ToastData[]
  /** Muestra un aviso y devuelve su id. */
  push: (input: ToastInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

let sequence = 0

/**
 * Almacén de avisos (§3.3, Zustand): cualquier parte de la app los lanza con `toast.success(…)` o con
 * `useToasts.getState().push(…)`, y `ToastViewport` los pinta. Los de logro tienen su propia pieza
 * (§3.8.8).
 */
export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (input) => {
    sequence += 1
    const id = `toast-${sequence}`
    const toast: ToastData = { duration: TOAST_DURATION_MS, ...input, id }
    set((state) => ({ toasts: [...state.toasts, toast].slice(-TOAST_LIMIT) }))
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

type ToastOptions = Omit<ToastInput, 'tone' | 'title'>

/** Atajos: `toast.success('Beat subido')`, `toast.error('Se ha cortado la subida', { message })`. */
export const toast = {
  info: (title: string, options: ToastOptions = {}) =>
    useToasts.getState().push({ tone: 'info', title, ...options }),
  success: (title: string, options: ToastOptions = {}) =>
    useToasts.getState().push({ tone: 'success', title, ...options }),
  error: (title: string, options: ToastOptions = {}) =>
    useToasts.getState().push({ tone: 'error', title, ...options }),
  dismiss: (id: string) => useToasts.getState().dismiss(id),
}

import type { AchievementId, AchievementRarity } from '@beatbattle/rules'
import { create } from 'zustand'

/**
 * El almacén `hud` (guía §4.7.2, §3.4.1; tarea 7.18): lo que la capa de juego del marco tiene en vuelo.
 *
 * - **XP flotante** (§3.4.2): cada «+5 XP» nace junto a lo que lo provoca y el medidor del HUD lo traga al llegar
 *   (`land`). Mientras vuela, su XP ya está en la sesión (`me`) pero el medidor no lo enseña: `pendingXp`.
 * - **Avisos** (§3.8.8): logros y subida de nivel en cola. Las placas (logros común, raro y épico) salen de tres en
 *   tres; lo grande (el logro legendario, al centro, y el nivel) de uno en uno. Nada sale mientras un «+XP» vuela
 *   (primero lo traga el medidor) ni mientras una capa a pantalla completa tapa el marco (`hold`: la pantalla de
 *   título, la revelación del drop, la ceremonia), y sale después, en el orden en que llegó.
 * - **Región viva** (`RNF-A11Y-07`): lo que se dice en voz al lector de pantalla (`live`).
 *
 * Es solo estado: lo que hay que hacer al enseñar un aviso (marcarlo visto en el servidor, decirlo en la región
 * viva) lo pone `rewards.ts` en `onShow`, y los sonidos y el movimiento, la capa que lo pinta.
 */

/** Caja de algo en la ventana (de `getBoundingClientRect`), en px. */
export interface Anchor {
  x: number
  y: number
  width: number
  height: number
}

export interface FloatXp {
  id: number
  amount: number
  /** Lo que lo provoca, en coordenadas de la ventana; `null` si no hay sitio (nace junto al medidor). */
  anchor: Anchor | null
  /** Combo del Modo Jurado: el blip de `xp.gain` sube con él (Anexo D). */
  combo?: number
}

export type RewardNotice =
  | {
      key: number
      kind: 'achievement'
      id: AchievementId
      rarity: AchievementRarity
      /** XP del logro (por su rareza). */
      xp: number
      /** XP que el medidor no enseña hasta que sale el aviso (0 si ya lo enseñaba, como los de `me` al cargar). */
      pending: number
    }
  | {
      key: number
      kind: 'level'
      level: number
      /** Nivel desde el que sube (el último que vio): si cambia el rango, «¡AHORA ERES…!». */
      from: number
    }

export type NoticeInput =
  | Omit<Extract<RewardNotice, { kind: 'achievement' }>, 'key'>
  | Omit<Extract<RewardNotice, { kind: 'level' }>, 'key'>

/** Placas de logro a la vez como mucho (§3.8.8: se apilan); las demás esperan. */
export const MAX_PLATES = 3
/** Lo que dura un aviso de logro en pantalla, en ms (§3.8.8). */
export const NOTICE_MS = 4000
/**
 * Si un «+XP» no llega (la capa no se ha podido cargar, la pestaña en segundo plano), el medidor lo traga igual
 * pasado este tiempo, en ms: nunca se queda enseñando menos XP del que hay.
 */
export const FLOAT_TIMEOUT_MS = 2500

/** ¿Va al centro o bajo el jugador, de uno en uno? El logro legendario y la subida de nivel. */
export function isBig(notice: RewardNotice | NoticeInput): boolean {
  return notice.kind === 'level' || notice.rarity === 'legendary'
}

interface HudState {
  floats: FloatXp[]
  /** XP ya en la sesión que el medidor aún no enseña. */
  pendingXp: number
  /** Cada «+XP» que traga el medidor (su pulso). */
  landed: number
  queue: RewardNotice[]
  plates: RewardNotice[]
  big: RewardNotice | null
  holds: number
  live: { key: number; text: string } | null
  /** Logros ya avisados en esta pestaña (los de `me` y los de las respuestas no se repiten). */
  announced: readonly AchievementId[]
  /** El nivel más alto ya en cola o avisado en esta pestaña. */
  levelAnnounced: number

  gain(input: { amount: number; anchor?: Anchor | null; combo?: number }): number
  land(id: number): void
  notify(notices: readonly NoticeInput[]): void
  dismiss(key: number): void
  hold(): () => void
  say(text: string): void
  /** Al salir de la cuenta: nada en vuelo ni en cola. */
  reset(): void
}

/** Lo que hay que hacer al enseñar un aviso (lo pone `rewards.ts`). */
export const hudEffects: { onShow: (notice: RewardNotice) => void } = { onShow: () => {} }

let sequence = 0

const EMPTY = {
  floats: [],
  pendingXp: 0,
  landed: 0,
  queue: [],
  plates: [],
  big: null,
  holds: 0,
  live: null,
  announced: [],
  levelAnnounced: 0,
} satisfies Partial<HudState>

/**
 * Saca de la cola lo que cabe: nada con una capa a pantalla completa ni con un «+XP» en vuelo; las placas hasta
 * `MAX_PLATES` y lo grande de uno en uno, siempre en orden (lo grande no adelanta a una placa ni al revés).
 */
function pump(state: Pick<HudState, 'queue' | 'plates' | 'big' | 'holds' | 'floats' | 'pendingXp'>) {
  if (state.holds > 0 || state.floats.length > 0 || state.queue.length === 0) return null
  const queue = [...state.queue]
  const plates = [...state.plates]
  let big = state.big
  let pendingXp = state.pendingXp
  const shown: RewardNotice[] = []
  for (let head = queue[0]; head; head = queue[0]) {
    if (isBig(head)) {
      if (big) break
      big = head
    } else {
      if (plates.length >= MAX_PLATES) break
      plates.push(head)
    }
    queue.shift()
    if (head.kind === 'achievement') pendingXp -= head.pending
    shown.push(head)
  }
  if (shown.length === 0) return null
  return { next: { queue, plates, big, pendingXp: Math.max(0, pendingXp) }, shown }
}

export const useHud = create<HudState>((set, get) => {
  /** Aplica un cambio y saca de la cola lo que quepa después; avisa de lo que sale. */
  const commit = (change: (state: HudState) => Partial<HudState>) => {
    let shown: RewardNotice[] = []
    set((state) => {
      const next = { ...state, ...change(state) }
      const pumped = pump(next)
      if (!pumped) return next
      shown = pumped.shown
      return { ...next, ...pumped.next }
    })
    for (const notice of shown) hudEffects.onShow(notice)
  }

  return {
    ...EMPTY,
    gain({ amount, anchor = null, combo }) {
      if (!(amount > 0)) return 0
      sequence += 1
      const id = sequence
      commit((state) => ({
        floats: [...state.floats, { id, amount, anchor, ...(combo ? { combo } : {}) }],
        pendingXp: state.pendingXp + amount,
      }))
      setTimeout(() => get().land(id), FLOAT_TIMEOUT_MS)
      return id
    },
    land(id) {
      const float = get().floats.find((item) => item.id === id)
      if (!float) return
      commit((state) => ({
        floats: state.floats.filter((item) => item.id !== id),
        pendingXp: Math.max(0, state.pendingXp - float.amount),
        landed: state.landed + 1,
      }))
    },
    notify(notices) {
      commit((state) => {
        const queue = [...state.queue]
        const announced = [...state.announced]
        let levelAnnounced = state.levelAnnounced
        let pendingXp = state.pendingXp
        for (const notice of notices) {
          if (notice.kind === 'achievement') {
            if (announced.includes(notice.id)) continue
            announced.push(notice.id)
            pendingXp += notice.pending
            sequence += 1
            queue.push({ ...notice, key: sequence })
          } else {
            if (notice.level <= levelAnnounced) continue
            levelAnnounced = notice.level
            // Una subida que aún espera se queda con el nivel nuevo (y con el de partida): un solo aviso.
            const waiting = queue.findIndex((item) => item.kind === 'level')
            const current = waiting >= 0 ? queue[waiting] : undefined
            if (current?.kind === 'level') queue[waiting] = { ...current, level: notice.level }
            else {
              sequence += 1
              queue.push({ ...notice, key: sequence })
            }
          }
        }
        return { queue, announced, levelAnnounced, pendingXp }
      })
    },
    dismiss(key) {
      commit((state) => ({
        plates: state.plates.filter((notice) => notice.key !== key),
        big: state.big?.key === key ? null : state.big,
      }))
    },
    hold() {
      commit((state) => ({ holds: state.holds + 1 }))
      let released = false
      return () => {
        if (released) return
        released = true
        commit((state) => ({ holds: Math.max(0, state.holds - 1) }))
      }
    },
    say(text) {
      sequence += 1
      set({ live: { key: sequence, text } })
    },
    reset() {
      set((state) => ({ ...EMPTY, holds: state.holds }))
    },
  }
})

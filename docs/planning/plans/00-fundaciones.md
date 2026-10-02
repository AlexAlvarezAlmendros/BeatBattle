# Plan 00 — Fundaciones

> Fase: 0 de 10 | Estado: ⬜ Pendiente | Iniciado: — | Cerrado: —
> Hito del roadmap: CI verde; la galería de componentes (`/dev/galeria`) muestra los tokens y los
> componentes base con la estética del sello y pasa la «prueba del sello» (`RD-VIS-02`).

Deja montado el monorepo con el stack de Orchard, la calidad automática y el **sistema de diseño
heredado de Other People** (tokens, fuentes de verdad, isla de navegación, componentes base). El
riesgo principal es que el sistema de diseño se aleje del sello: por eso la fase termina con una
comparación A/B contra capturas de `otherpeople.es`.

---

## Dependencia con otras fases

- **Requiere:** nada.
- **Habilita:** Fase 1 (tras 0.1 y 0.4), Fase 2 y todas las de UI.

---

## Tareas

### Monorepo y calidad

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 0.1 | Scaffold: pnpm workspaces (`apps/web`, `apps/server`, `packages/{rules,audio,covers,shared,emails}`, `tools/{shot,seed}`), TypeScript estricto, Biome, Vitest; `apps/web` con Vite + React 19 + React Router 7; `apps/server` con Fastify y `GET /api/health`; `api/index.ts` para Vercel; versiones alineadas con Orchard; `.nvmrc` (22) | ⬜ Listo | — | §4.1, §4.4 |
| 0.2 | CI en GitHub Actions: `pnpm install --frozen-lockfile` → Biome → tipos → Vitest → build (Playwright se añade en 0.13) | 🔒 Bloqueado | 0.1 | §4.16 |
| 0.3 | Hooks de Claude Code: `guard-secrets`, `no-ai-attribution`, `format-quality` (Biome) | ✅ Hecho | — | Creados con el plan (2026-10-02) a partir de los de Orchard. Verificados con entradas de prueba: bloquean `git add .env` y `*.db`, y commits y PRs con atribución (también el pie «Generated with [Claude Code]», que el de Orchard dejaba pasar). `format-quality` queda inactivo hasta que exista Biome (0.1) |
| 0.4 | Tokens: `apps/web/src/styles/tokens.css` + espejo `packages/shared/tokens.ts`; regla de lint que prohíbe colores, radios y duraciones literales fuera de los tokens | 🔒 Bloqueado | 0.1 | §3.2 · `RD-VIS-01` |
| 0.5 | Fuentes alojadas en el proyecto: Montserrat (400–900) y JetBrains Mono (500–700), subconjunto latino, `preload` y `font-display: swap` | 🔒 Bloqueado | 0.1 | §3.1 (hallazgo de las fuentes del sello), §3.2 |
| 0.6 | `packages/rules`: esqueleto, regla de lint de pureza (sin DOM, React, three, fetch, `Date.now`, `Math.random`), PRNG con semilla (`hash → sfc32`) y `balance.ts` con las constantes del Anexo B | 🔒 Bloqueado | 0.1 | §4.5 · Anexo B |

### Sistema de diseño

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 0.7 | Layout del sello: isla de navegación flotante (medidas de `Header.css`), logo *OTP.* fijo a −10° enlazado a `otherpeople.es`, pie compartido, rótulos verticales laterales, banda de marquee, rejilla roja y viñeta del hero; titular «BEAT / BATTLE» (macizo + contorno rojo con halo). Cerrar la decisión del nombre de marca | 🔒 Bloqueado | 0.4, 0.5 | §3.1, §3.8.3 · `RF-OTP-01` |
| 0.8 | Componentes base con todos sus estados (reposo, hover, foco, pulsado, cargando, deshabilitado, éxito, error): botón CTA, contorno, icono; chip; tarjeta con inclinación 3D; tesela de dato; rótulo de sección; fila de entrada (sin audio); modal de cristal; aviso; barra de XP; esqueleto; cuenta atrás (visual) | 🔒 Bloqueado | 0.4, 0.5 | §3.3 · Anexo E |
| 0.9 | Galería `/dev/galeria` (solo en desarrollo) con tokens, tipografía, componentes y cada estado, en calidad normal y con «reducir movimiento» | 🔒 Bloqueado | 0.8 | `RD-VIS-03`, `RD-MOT-03` |
| 0.10 | Router y layouts de todas las rutas de §2.18 como páginas vacías con su título; 404 provisional | 🔒 Bloqueado | 0.7 | §2.18 |
| 0.11 | i18n mínimo: `t()` con `Intl.PluralRules`, `es.json`, formato de fechas en `Europe/Madrid` | 🔒 Bloqueado | 0.1 | §4.7.8 |

### Plataforma

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 0.12 | `vercel.json` base: build, salida, reescrituras de `/api`, cabeceras de seguridad y CSP de §4.13 (sin desplegar) | 🔒 Bloqueado | 0.1 | `RNF-SEC-01` |
| 0.13 | Playwright + axe: humo de la home y de la galería, auditoría de accesibilidad en CI | 🔒 Bloqueado | 0.2, 0.9 | §4.16 · `RNF-A11Y-02` |
| 0.14 | `tools/shot` portado de Orchard (`shot.mjs`, `bench.mjs`) + capturas de referencia de `otherpeople.es` (home, beats, ficha) para la «prueba del sello» | 🔒 Bloqueado | 0.1 | `RD-VIS-02` |
| 0.15 | README inicial al estilo de SampleCurator (problema, por qué, cómo arrancarlo; sin checklist ni badges inventados) | 🔒 Bloqueado | 0.1 | Memoria de estilo de README |

---

## Entregable

Un monorepo que compila, pasa la CI y sirve una galería con el sistema de diseño de BeatBattle,
indistinguible de una sección de la web del sello con la capa de juego apagada.

## Criterio de aceptación

1. `pnpm check`, `pnpm typecheck`, `pnpm test` y `pnpm build` en verde en local y en CI.
2. La galería muestra todos los componentes de §3.3 con sus 8 estados y la variante sin movimiento.
3. Comparación A/B con las capturas del sello (0.14): isla, tipografía, rojo, tarjetas y lista
   coinciden en medidas y color (revisión visual registrada con capturas en
   `docs/planning/evidence/f0/`).
4. axe sin errores en la galería.
5. Ningún color literal fuera de los tokens (la regla de lint falla si se introduce uno).

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-02 | — | Plan creado. 0.3 hecha junto con la planificación. |

# Plan 00 — Fundaciones

> Fase: 0 de 10 | Estado: 🔄 En curso | Iniciado: 2026-10-02 | Cerrado: —
> Hito del roadmap: CI verde; la galería de componentes (`/dev/galeria`) muestra los tokens y los
> componentes base con la estética del sello y pasa la «prueba del sello» (`RD-VIS-02`).

Deja montado el monorepo con el stack de Orchard, la calidad automática, el **sistema de diseño
heredado de Other People** (tokens, fuentes de verdad, isla de navegación, componentes base) y las
**bases transversales del servidor** (configuración, reloj, errores, seguridad, base de datos,
contratos de API) que usarán todas las fases. El riesgo principal es que el sistema de diseño se
aleje del sello: por eso la fase termina con una comparación A/B contra capturas de
`otherpeople.es`.

---

## Dependencia con otras fases

- **Requiere:** nada.
- **Habilita:** Fase 1 (tras 0.1 y 0.4), Fase 2 y todas las de UI y servidor.

## Cobertura de la especificación

| Id | Tarea(s) | Verificación |
|----|----------|--------------|
| `RD-VIS-01` | 0.4 | Script `lint:tokens` en `pnpm check` que falla con un color literal fuera de los tokens (test del propio script) |
| `RD-VIS-02` | 0.7, 0.8, 0.14 | Comparación A/B con capturas del sello registrada en `docs/planning/evidence/f0/` |
| `RD-VIS-03` | 0.9 | Galería `/dev/galeria` con todos los estados de §3.3 |
| `RD-MOT-03` | 0.8, 0.9 | Cada componente con variante sin movimiento, visible en la galería |
| `RF-OTP-01` | 0.7 | Logo del sello enlazado y pie compartido, revisión visual |
| `RNF-SEC-01` | 0.12, 0.16 | Test de humo de cabeceras sobre `/api/health` y `vercel.json` validado |
| `RNF-SEC-05` | 0.16 | Tests: `Origin` ajeno → 403; `text/plain` → 415 |
| `RNF-SEC-06` | 0.3 | Hook `guard-secrets` probado |
| `RNF-A11Y-02` | 0.13 | axe sin errores en la home y la galería |
| `RNF-A11Y-03` | 0.8, 0.9 | Galería con «reducir movimiento» emulado |

Bases (sin id propio, exigidas por §4): configuración validada, `Clock` inyectable con la guarda de
§4.12, sobre `{ data } | { error }`, BD con migraciones y helper de tests, rate limit genérico,
contratos compartidos y cliente de API tipado (§4.7.2, §4.10–4.13).

---

## Tareas

### Monorepo y calidad

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 0.1 | Scaffold: pnpm workspaces (`apps/web`, `apps/server`, `packages/{rules,audio,covers,shared,emails}`, `tools/{shot,seed}`), TypeScript estricto, Biome, Vitest; `apps/web` con Vite + React 19 + React Router 7; `apps/server` con Fastify y `GET /api/health`; `api/index.ts` para Vercel; versiones alineadas con Orchard; `.nvmrc` (22); todas las dependencias de la fase instaladas de una vez | ✅ Hecho | — | §4.1, §4.4. Verificado: `pnpm check`, `pnpm typecheck`, `pnpm test` (9 tests) y `pnpm build` en verde; API y web arrancan y el proxy de Vite sirve `/api/health`. React Router 7.18.4 (la 8 ya existe, pero la guía fija la 7); `noUncheckedIndexedAccess` activado además de lo de Orchard |
| 0.2 | CI en GitHub Actions: `pnpm install --frozen-lockfile` → auditoría → Biome y lints propios → tipos → Vitest → build → Playwright | ⬜ Listo | 0.1 | §4.16 |
| 0.3 | Hooks de Claude Code: `guard-secrets`, `no-ai-attribution`, `format-quality` (Biome) | ✅ Hecho | — | Creados con el plan (2026-10-02) a partir de los de Orchard. Verificados con entradas de prueba: bloquean `git add .env` y `*.db`, y commits y PRs con atribución (también el pie «Generated with [Claude Code]», que el de Orchard dejaba pasar). `format-quality` queda inactivo hasta que exista Biome (0.1) |
| 0.4 | Tokens: `apps/web/src/styles/tokens.css` + espejo `packages/shared/src/tokens.ts`; script `lint:tokens` que prohíbe colores, radios y duraciones literales fuera de los tokens | ⬜ Listo | 0.1 | §3.2 · `RD-VIS-01` |
| 0.5 | Fuentes alojadas en el proyecto: Montserrat y JetBrains Mono (variables, `@fontsource-variable`), `preload` de la principal y `font-display: swap` | ⬜ Listo | 0.1 | §3.1 (hallazgo de las fuentes del sello), §3.2 |
| 0.6 | `packages/rules`: esqueleto por módulos de §4.5, regla de pureza (Biome `noRestrictedImports`/`noRestrictedGlobals` + script que prohíbe `Date.now`, `Math.random` y `new Date()` sin argumentos), PRNG con semilla (`hash → sfc32`) y `balance.ts` con las constantes del Anexo B, todo con tests | ⬜ Listo | 0.1 | §4.5 · Anexo B · Anexo G |

### Sistema de diseño

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 0.7 | Layout del sello: isla de navegación flotante (medidas de `Header.css`), logo *OTP.* fijo a −10° enlazado a `otherpeople.es`, pie compartido, rótulos verticales laterales, banda de marquee, rejilla roja y viñeta del hero; titular «BEAT / BATTLE» (macizo + contorno rojo con halo). Nombre de marca por defecto: «Beat Battle by Other People» | 🔒 Bloqueado | 0.4, 0.5, 0.10 | §3.1, §3.8.3 · `RF-OTP-01` |
| 0.8 | Componentes base con todos sus estados (reposo, hover, foco, pulsado, cargando, deshabilitado, éxito, error): botón CTA, contorno, icono; chip; tarjeta con inclinación 3D; tesela de dato; rótulo de sección; fila de entrada (sin audio); modal de cristal; aviso; barra de XP; esqueleto; cuenta atrás (visual) | 🔒 Bloqueado | 0.4, 0.5 | §3.3 · Anexo E |
| 0.9 | Galería `/dev/galeria` (solo en desarrollo) con tokens, tipografía, componentes y cada estado, en calidad normal y con «reducir movimiento» | 🔒 Bloqueado | 0.8 | `RD-VIS-03`, `RD-MOT-03` |
| 0.10 | Router y layouts de todas las rutas de §2.18 como páginas vacías con su título; 404 provisional; proveedores (Query) | ⬜ Listo | 0.1 | §2.18 |
| 0.11 | i18n mínimo: `t()` con `Intl.PluralRules`, `es.json`, formato de fechas en `Europe/Madrid` | ⬜ Listo | 0.1 | §4.7.8 |

### Plataforma

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 0.12 | `vercel.json` base: build, salida, reescrituras de `/api`, cabeceras de seguridad y CSP de §4.13 (sin desplegar) | ⬜ Listo | 0.1 | `RNF-SEC-01` |
| 0.13 | Playwright + axe: humo de la home y de la galería, auditoría de accesibilidad en CI | 🔒 Bloqueado | 0.2, 0.9 | §4.16 · `RNF-A11Y-02` |
| 0.14 | `tools/shot` portado de Orchard (`shot.mjs`, `bench.mjs`) + capturas de referencia de `otherpeople.es` (home, beats, ficha) para la «prueba del sello» | ⬜ Listo | 0.1 | `RD-VIS-02` |
| 0.15 | README inicial al estilo de SampleCurator (problema, por qué, cómo arrancarlo; sin checklist ni badges inventados) | ⬜ Listo | 0.1 | Memoria de estilo de README |

### Bases del servidor y de los datos

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 0.16 | Servidor base: configuración validada con Zod (`config/env.ts`), `Clock` inyectable (cabecera `x-bb-test-now` solo con `BB_TEST_CLOCK=1`; el arranque falla si coincide con `NODE_ENV=production`), `AppError` con catálogo de códigos y sobre `{ data } \| { error }`, plugin de seguridad (comprobación de `Origin` y solo JSON en escrituras, cuerpo ≤ 64 kB, cabeceras), registro sin PII, patrón de módulo (`routes`, `service`, `repo`, `schema`) con el módulo `health`, `buildApp()` probado con `inject` | ⬜ Listo | 0.1 | §4.10, §4.12, §4.13 · `RNF-SEC-01`, `RNF-SEC-05` |
| 0.17 | Datos: Drizzle + libSQL (fichero en local, memoria en tests), `drizzle-kit` y migraciones aplicadas al arrancar, helper `createTestDb()`, ids uuid v7, ayudante de `batch`, tabla `app_rate_limit` y `rateLimit()` genérico con tests (base de `RNF-SEC-02`) | 🔒 Bloqueado | 0.16 | §4.11, §4.13 |
| 0.18 | Contratos compartidos: `packages/shared` con el sobre de respuesta en Zod, catálogo de códigos de error y esquema de `health`; cliente de API tipado en `apps/web/src/net` sobre TanStack Query | 🔒 Bloqueado | 0.16 | §4.7.2 |
| 0.19 | Servicios locales: `docker-compose.yml` con Mailpit, `apps/server/.env.example` con todas las variables de §4.15 comentadas, `pnpm dev:all` (web + API) | ⬜ Listo | 0.1 | §4.15, §4.19.1 |

---

## Entregable

Un monorepo que compila, pasa la CI y sirve una galería con el sistema de diseño de BeatBattle,
indistinguible de una sección de la web del sello con la capa de juego apagada, y una API mínima con
todas las bases transversales probadas.

## Criterio de aceptación

1. `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build` y `pnpm e2e` en verde en local y en CI.
2. La galería muestra todos los componentes de §3.3 con sus 8 estados y la variante sin movimiento.
3. Comparación A/B con las capturas del sello (0.14): isla, tipografía, rojo, tarjetas y lista
   coinciden en medidas y color (revisión visual registrada con capturas en
   `docs/planning/evidence/f0/`).
4. axe sin errores en la home y la galería.
5. Ningún color literal fuera de los tokens (el lint falla si se introduce uno).
6. La API responde `GET /api/health` con el sobre, aplica las comprobaciones de seguridad y migra la
   BD al arrancar; el reloj de prueba no se puede activar en producción.
7. Todos los ids de la tabla de cobertura verificados.

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-02 | — | Plan creado. 0.3 hecha junto con la planificación. |
| 2026-10-02 | 0.1 | Scaffold del monorepo hecho y verificado. Desbloquea 0.2, 0.4–0.6, 0.10–0.12, 0.14–0.16 y 0.19. |
| 2026-10-02 | — | Se añaden 0.16–0.19 (bases del servidor, datos, contratos y servicios locales) y la tabla de cobertura. Empieza la fase en la rama `feat/f0-fundaciones`. |

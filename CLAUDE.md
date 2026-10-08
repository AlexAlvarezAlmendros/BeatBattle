# BeatBattle — instrucciones para Claude Code

Competición semanal de beats: cada lunes cae un sample, los productores suben su *flip* y la
comunidad vota de 1 a 5 estrellas; el domingo se sella la semana y se revela el podio. Vive junto a
la web de **Other People Records** (`otherpeople.es`, repo `ReactOtpWeb`): sus colores y su logo, y
el mismo sistema de audio (Cloudinary), pero **cuentas propias** con Better Auth. Se presenta como el
menú de una recreativa de lucha (dirección de arte «Arena», guía §3) y lleva una capa de juego: XP,
niveles, logros, temporadas, ceremonias, efectos de sonido por código y sorpresas.

- **Especificación (SDD):** `docs/guia-maestra.md`. Es la fuente de verdad. Requisitos con id
  (`RF-*`, `RNF-*`, `RD-*`) y criterio de aceptación.
- **Planificación:** `docs/planning/ROADMAP.md` + `docs/planning/plans/NN-*.md`. Usa la skill
  **`beatbattle-plan`** al empezar cualquier petición de desarrollo.

## Estructura

```
apps/web         Vite + React 19 + React Router 7 + Zustand + TanStack Query + Motion
                 + R3F/drei (Escenario: canvas único) + Web Audio/Tone.js
apps/server      Fastify + Better Auth + Drizzle/libSQL + Cloudinary + ffmpeg + nodemailer/Gmail (cola outbox)
api/             funciones de Vercel (index.ts = Fastify, share.ts, og.tsx)
packages/rules   reglas puras y deterministas: fases, puntuación, clasificación, XP, logros, temporadas
packages/audio   análisis de BPM/tonalidad (portado del sello), onda, sonoridad, teoría, efectos como datos
packages/covers  portadas generativas (cliente y servidor)
packages/shared  esquemas Zod de API, tipos, tokens en TS
packages/emails  plantillas React Email
tools/shot       capturas y bancos (de Orchard) · tools/seed  datos de prueba
```

## Comandos

```bash
pnpm install
pnpm dev                 # web en http://localhost:5173 (Vite reenvía /api)
pnpm dev:all             # web + API (apps/server en :3000)
pnpm check               # Biome + lint de tokens + pureza de packages/rules; pnpm fix aplica arreglos de Biome
pnpm typecheck           # TypeScript en todos los paquetes
pnpm test                # Vitest en todos los paquetes
pnpm e2e                 # Playwright (almacenamiento falso, reloj de prueba, Mailer en memoria)
pnpm emails:dev          # visor de plantillas de email (React Email)
pnpm mail:dev            # Mailpit en local sin Docker (SMTP 1025, bandeja en :8025)
node tools/shot/shot.mjs <url> <png> [--eval=expr]   # captura con la GPU real
node tools/shot/bench.mjs <url> [segundos]           # FPS y peor fotograma
node tools/shot/ab.mjs [--otp-live]                  # A/B de la antigua prueba del sello (histórico, docs/planning/evidence/f0/ab)
```

## Reglas

- **Spec first:** si el comportamiento cambia, se cambia antes la guía (sección + registro de
  cambios) en el mismo commit. Cada test que cubre un requisito lleva su id en el nombre
  (`it('RF-VOTE-03: …')`).
- **Juego limpio antes que espectáculo** (guía §1.3): nada visual ni sonoro da ventaja a una entrada;
  ninguna media, recuento ni posición antes del sellado; voto ciego sin fugas (API, URLs de audio,
  imágenes OG); el XP nunca pesa en la clasificación.
- **`packages/rules` es puro:** sin DOM, React, three, `fetch`, BD ni Cloudinary; sin `Date.now()` ni
  `Math.random()` (el instante entra como argumento; PRNG con semilla). Constantes de juego solo en
  `balance.ts`.
- **Audio:** nunca pasa por la API. El servidor firma la subida, fija `public_id` (sin id de
  usuario), verifica con la Admin API y mide sonoridad y onda. Los metadatos de integridad del
  cliente no se aceptan.
- **Tiempo:** instantes UTC en ms; fronteras calculadas en `Europe/Madrid` al programar la semana;
  reloj inyectable (`x-bb-test-now` solo con `BB_TEST_CLOCK=1`, nunca en producción).
- **Diseño:** colores, medidas (chaflanes incluidos), duraciones y curvas solo desde tokens; la única
  excepción son los tiempos internos de las ceremonias, que viven en su línea de tiempo (guía §3.6).
  Del sello solo se usan la paleta y el logo como firma, visible en todas las pantallas
  (`RF-OTP-01`); ninguna pantalla imita la composición de `otherpeople.es` (isla, hero en
  contorno, marquee, orbes, cristal, Montserrat). Las pantallas son menús de juego de lucha que se
  recorren con teclado (§3, `RD-VIS-02`); las maquetas aprobadas están en
  `docs/planning/evidence/f0/arena/`. Toda animación tiene variante sin movimiento; todo sonido,
  equivalente visual; nada destella más de 3 veces por segundo. Las portadas generativas se pintan
  por CPU (contexto 2D con `willReadFrequently: true`, guía §3.4.5): por GPU no pasan `RD-VIS-04`.
- **Email:** todo email entra por `email_outbox` en el mismo `batch` que el hecho que lo provoca, con
  clave de idempotencia y su familia (servicio, aviso, marketing). Marketing solo con consentimiento
  registrado; baja en un clic; sin píxeles de seguimiento; ningún email revela datos sin sellar.
  Transporte: nodemailer + Gmail (cuenta propia de BeatBattle, TLS verificado, cupo diario con
  reserva de servicio). En local se usa Mailpit; en tests, el `Mailer` en memoria. Nunca se envían emails a personas reales
  sin confirmación.
- **Sonido:** efectos generados por código (`SfxDef`), afinados en la tonalidad de la semana; ningún
  sonido antes de la primera interacción.
- **UI y audio se verifican en el navegador** (capturas con `tools/shot` y escucha), no solo
  compilando. Lo no ejecutado se reporta como «escrito, sin verificar».
- Identificadores en inglés; textos de UI por claves i18n en castellano; documentación en castellano.
- **Commits y PRs sin atribución a la IA.** Rama por tarea (`feat/4.3-subida-por-trozos`) y PR a
  `main` que revisa el usuario; no se mezclan PRs ni se despliega, ni se crean recursos en la nube
  (Vercel, Turso, Cloudinary, DNS, OAuth) sin su confirmación.
- Cambios en la web del sello (`ReactOtpWeb`): rama y PR propias en ese repo desde un
  `git worktree` sobre `origin/main` (su árbol de trabajo suele estar sucio).

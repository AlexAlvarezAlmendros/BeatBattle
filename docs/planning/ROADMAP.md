# BeatBattle — Roadmap del proyecto

> Última actualización: 2026-10-02

Competición semanal de beats a partir de un sample, con la estética de **Other People Records** y
alma de videojuego: cada lunes cae un sample, los productores suben su *flip* y la comunidad vota
de 1 a 5 estrellas. El domingo se sella la semana y se revela el podio con una ceremonia.

Documentación: [guía maestra](../guia-maestra.md) (especificación SDD con requisitos `RF-*`,
`RNF-*` y `RD-*`).

## Estrategia

**Riesgo primero.** Antes de construir lo caro se validan con un *spike* (Fase 1, GO/NO-GO):

1. **La sensación de juego**: Escenario WebGL, partículas y efectos de sonido con latencia baja en
   un móvil normal.
2. **El audio en la nube**: subida firmada por trozos a Cloudinary, entrega firmada de un derivado
   MP3, analizador de Web Audio sobre un audio de otro origen y medición de sonoridad con ffmpeg en
   Vercel.

Las fases 0 y 1 van en paralelo tras el scaffold (0.1). Después se construye siguiendo el
recorrido del usuario: cuenta → sample → subir → votar → resultados.

**MVP (beta cerrada) = fases 0–6.** Lanzamiento público = fases 0–10.

## Fases

| # | Fase | Estado | Plan | Hito |
|---|------|--------|------|------|
| 0 | Fundaciones | ✅ Hecho (2026-10-02; CI de GitHub en verde en la PR #1) | [00-fundaciones.md](plans/00-fundaciones.md) | CI verde; la galería muestra tokens y componentes con la estética del sello; prueba del sello sin diferencias sin justificar salvo el Silk (1.1) |
| 1 | Spike de sensación y audio | ⬜ Lista (1.1, 1.4 y 1.9 se pueden empezar) | [01-spike-sensacion-audio.md](plans/01-spike-sensacion-audio.md) | 60 fps escritorio / ≥ 45 Android medio; efectos < 30 ms; analizador sobre Cloudinary; ffmpeg < 8 s (**GO/NO-GO**) |
| 2 | Cuentas y base de email | 🔒 Bloqueada (F0, GO de F1) | — (se crea al llegar) | E2E: registro → verificación → Google → perfil → borrar cuenta; cola de email, preferencias, consentimientos y bajas |
| 3 | Semanas y samples | 🔒 Bloqueada (F2) | — | 3 semanas programadas; cambio de semana en la frontera con reloj simulado; email del drop (también sin cuenta) |
| 4 | Participar | 🔒 Bloqueada (F3) | — | WAV de 60 MB por trozos con BPM, tonalidad y sonoridad medida; recibo por email |
| 5 | Escuchar y votar | 🔒 Bloqueada (F4) | — | Todas las reglas `RF-VOTE-*` en verde; Modo Jurado con teclado; recordatorio y llamada al jurado |
| 6 | Cierre, resultados y ceremonia | 🔒 Bloqueada (F5) | — | Sellado determinista, ceremonia, re-sellado idéntico; Lunes de batalla por email |
| — | **Beta cerrada** | 🔒 | — | 15–25 productores, 3 semanas reales |
| 7 | Capa de juego | 🔒 Bloqueada (beta) | — | XP, niveles, rachas, logros, temporadas y carta con lanyard |
| 8 | Sorpresas y pulido audiovisual | 🔒 Bloqueada (F7) | — | Anexo F completo con variantes accesibles; kit de la semana |
| 9 | Integración con Other People y email marketing | 🔒 Bloqueada (beta) | — | PR en `ReactOtpWeb` con widget y menú; campaña real a un segmento con consentimiento; alta en la newsletter del sello |
| 10 | Moderación, legal y lanzamiento | 🔒 Bloqueada (F7–F9) | — | Legal publicado; auditorías sin hallazgos altos; presupuestos cumplidos |

## Foco actual

**Fase 0 cerrada** (PR #1 a `main`, pendiente de revisión). **Siguiente: Fase 1** (spike GO/NO-GO):
1.1 Silk y Escenario, 1.4 motor de audio y 1.9 port del análisis se pueden empezar ya. Antes de 1.7 y
1.8 (recursos en la nube) hay que cerrar la decisión de la cuenta de Cloudinary.

## Grafo de dependencias

```
0.1 scaffold ─┬─► F0 fundaciones ─────────────┐
              └─► F1 spike (GO/NO-GO) ────GO──┴─► F2 cuentas ─► F3 semanas ─► F4 participar ─► F5 votar ─► F6 resultados
                                                                                                          │
                                       BETA CERRADA ◄─────────────────────────────────────────────────────┘
                                            │
                     F7 capa de juego ◄─────┼─────► F9 integración OTP y email marketing
                            │               │
                     F8 sorpresas           └─────► F10 moderación, legal y lanzamiento
```

## Leyenda de estados

| Icono | Significado |
|-------|-------------|
| ⬜ Listo / Pendiente | Sin bloqueos, se puede empezar |
| 🔄 En curso | Se está trabajando ahora |
| ✅ Hecho | Completado **y verificado** |
| 🔒 Bloqueado | Espera a otra tarea o fase |
| ❌ Cancelado | Fuera de alcance |

## Decisiones tomadas

- 2026-10-02 — **Metodología SDD**: la guía maestra es la especificación y manda. Cada requisito
  tiene id (`RF-*`, `RNF-*`, `RD-*`) con criterio de aceptación; los planes citan ids y secciones;
  los tests llevan el id en el nombre; una desviación se corrige primero en la guía (con registro
  de cambios) y en el mismo commit que el código.
- 2026-10-02 — **Stack**: el de Orchard (pnpm, TypeScript estricto, Vite, three.js con GLSL propio,
  React y Zustand, Zod, Web Audio y Tone.js, Fastify, libSQL/Turso y Drizzle, Vitest, fast-check,
  Playwright, Biome, Vercel `fra1`) + **React Three Fiber y drei** (canvas único con vistas ancladas
  al DOM; el Silk y el Lanyard del sello ya son R3F) + **TanStack Query** + **Motion** + **React
  Router 7**. Guía §4.1–4.2.
- 2026-10-02 — **Better Auth** para las cuentas (petición del usuario), independientes de Other
  People: cookies solo del host, sin `crossSubDomainCookies`. Nota: **Orchard no usa Better Auth**
  (la descartó porque no pedía email y usa sesiones propias con Argon2id); aquí el email es
  necesario y Better Auth encaja. Plugins `username`, `admin` y `haveIBeenPwned`; Google y Discord.
  Guía §4.9.
- 2026-10-02 — **Audio en Cloudinary, con el mismo sistema que el sello** (subida firmada directa,
  `resource_type: video`, URL de descarga firmada con `fl_attachment`), mejorado: subida por trozos,
  recursos `authenticated` entregados solo con URL firmada del derivado MP3 a 192 kb/s, verificación
  con la Admin API y `public_id` sin id de usuario (voto ciego). Guía §4.8.
- 2026-10-02 — **Modelo de semana**: drop el lunes 00:00 (Madrid), envíos hasta el domingo 20:00 y
  votos hasta las 23:59:59, sellado perezoso e idempotente. Guía §2.1.
- 2026-10-02 — **Integridad del voto**: voto ciego por defecto con alias de batalla, umbral de
  escucha `min(45 s, 50 %)` con recibo en servidor, ninguna media ni recuento público antes del
  sellado, orden «Ronda justa», igualación de sonoridad a −14 LUFS que solo atenúa, media bayesiana
  con `C = 5` y podio con ≥ 3 votos. Guía §1.3, §2.6–2.8.
- 2026-10-02 — **Capa de juego cosmética**: el XP, los niveles y los logros nunca influyen en la
  clasificación ni en el peso de un voto (`RF-GAME-10`).
- 2026-10-02 — **Efectos de sonido generados por código** (patrón de Orchard) y afinados en la
  tonalidad del sample de la semana; excepción: el kit de la semana usa trocitos del propio sample.
  Guía §3.7.
- 2026-10-02 — **Medallas de vinilo**: 1.º oro, 2.º platino, 3.º diamante (orden invertido a
  propósito, guía §3.2).
- 2026-10-02 — **Emails en tres familias** (servicio, avisos de la batalla, marketing con
  consentimiento), con recibo de entrada que incluye el informe técnico de la medición, Lunes de
  batalla combinado, alerta de drop sin cuenta con doble confirmación, horas de silencio, tope de 3
  por semana, baja en un clic (RFC 8058), sin píxeles de seguimiento y campañas desde nuestro panel.
  Cada fase entrega sus propios emails (F2 base y cuenta, F3 drop, F4 recibo, F5 recordatorios, F6
  resultados, F7 progreso, F9 marketing). Guía §2.12, §3.8.12 y §4.19.
- 2026-10-02 — **Email con nodemailer + Gmail** (decisión del usuario, el mismo sistema que el sello),
  con cuenta propia de BeatBattle, TLS verificado (sin el `rejectUnauthorized: false` del sello),
  remitente coherente con la cuenta, 1 mensaje por segundo, cupo diario en ventana móvil de 24 h con
  el 25 % reservado para servicio y aplazamiento por prioridad, y rebotes leídos por IMAP. Todo
  detrás de la interfaz `Mailer` y de la cola *outbox*. Guía §4.19 (v0.3).
- 2026-10-02 — **Hito de la Fase 0 sin el Silk**: la prueba del sello (`RD-VIS-02`) se da por buena en la
  Fase 0 sin diferencias sin justificar salvo el fondo, porque el Silk en WebGL es la tarea 1.1 (canvas
  único del Escenario). Se repite la A/B con el Silk en la 1.12, junto con las propuestas del jurado
  (guía §7). Evidencia en `docs/planning/evidence/f0/ab/`.
- 2026-10-02 — **Estructura de `apps/web/src`** por recurso (`features/<recurso>`), con el marco y las
  páginas sin recurso en `app/` y el sistema de diseño en `ui/` (guía v0.5 §4.4).
- 2026-10-02 — **Motor de BPM y tonalidad**: se porta a TS el de `ReactOtpWeb` con su batería de
  validación como oráculo. Guía §4.6.

## Decisiones abiertas

Cada una tiene un valor por defecto que la guía ya asume (§7).

| Decisión | Por defecto | Se cierra en | Notas |
|---|---|---|---|
| Cuenta de Cloudinary | Propia de BeatBattle (mismo sistema que el sello) | Antes de 1.6 | Compartir la del sello arriesga su cuota y las descargas de su tienda |
| Dominio | `battle.otherpeople.es` | Antes de F2 | Afecta a OAuth, cookies y CORS del widget |
| Cuenta de Gmail para enviar | Cuenta propia de BeatBattle (no la del sello); dirección de `otherpeople.es` si está en Google Workspace | Antes de F2 | Con Gmail normal, el Lunes de batalla llega el mismo día a ~330 personas; el resto, el martes (guía §4.17) |
| Newsletter del sello desde BeatBattle | Casilla opcional en el registro | F9 | Necesita que la API de newsletter del sello acepte `source` |
| Proveedores sociales | Google y Discord | F2 | — |
| Premios | Sin premio material; visibilidad y Elección del sello | Antes de la beta | Con premios, revisar bases y fiscalidad |
| Origen y licencia de los samples | Del sello o de sus productores, con licencia escrita | Antes de F3 | — |
| Nombre de marca | «Beat Battle by Other People» | F0 (0.7) | Logo y textos |
| Modelo de semana | Envíos y votos a la vez | Tras la beta | Revisar con datos de participación |
| Fecha de lanzamiento | Primera semana completa tras F10 | F10 | — |
| Dependabot | Activarlo en la Fase 10 | F10 | Abre PRs en GitHub: necesita confirmación |

## Registro de avance

| Fecha | Fase | Notas |
|-------|------|-------|
| 2026-10-02 | F0 | **Cerrada.** CI de GitHub en verde en la PR #1 (la primera ejecución destapó una dependencia sin declarar, ya arreglada). |
| 2026-10-02 | F0 | Fase 0 implementada en tres olas de agentes en paralelo con revisión independiente, jurado de la prueba del sello y revisión adversarial; guía v0.4 y v0.5 con las desviaciones. Pendiente: primera CI en GitHub. |
| 2026-10-02 | — | Guía maestra v0.3: email con nodemailer + Gmail (decisión del usuario). |
| 2026-10-02 | — | Guía maestra v0.2: sistema de emails (recibos, avisos y marketing) y fases ajustadas. |
| 2026-10-02 | — | Guía maestra v0.1, roadmap, planes 00 y 01, `CLAUDE.md`, hooks y skill `beatbattle-plan`. Repo local vacío con remoto en GitHub sin commits. |

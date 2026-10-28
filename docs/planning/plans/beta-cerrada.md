# Plan — Beta cerrada

> Fase: entre la 6 y la 7 | Estado: 🔄 En curso | Iniciado: 2026-10-15 | Cerrado: —
> Hito del roadmap: 15–25 productores invitados juegan 3 semanas reales en `battle.otherpeople.es`: sale online y se
> anuncia el domingo 15 de noviembre de 2026, y se juega del lunes 16 al domingo 6 de diciembre.

El MVP (fases 0–6) está completo. La beta lo pone en producción con productores del entorno del sello. Riesgo
principal: lo que solo se ve desplegado (Vercel, Turso, Cloudinary de producción, Gmail, OAuth), y que haya
poca participación las primeras semanas (guía §6, riesgos).

---

## Dependencia con otras fases

- **Requiere:** F0–F6 cerradas (la F2 y la F3 tienen su hito cumplido; esperan comprobaciones del usuario: Discord
  real 2.22, IMAP real 2.11, cierre 2.26 y la conformidad 3.21).
- **Habilita:** F7 (capa de juego), F9 (integración con Other People) y F10 (moderación, legal y lanzamiento).

## Calendario

Decisión del usuario del 2026-10-28: la beta **sale online y se anuncia el domingo 15 de noviembre de 2026** y la
primera ronda empieza el **lunes 16** a las 00:00 (Madrid). Sustituye al lunes 19 de octubre, que pasó sin semanas
programadas. Fechas objetivo, hacia atrás desde el anuncio:

| Hasta | Qué | Tareas |
|---|---|---|
| Domingo 1 nov | `MAIL_DAILY_LIMIT` a 450, desplegar `main` (producción sirve la #99: sin el Gmail ni el arreglo del editor de samples de la #103), prueba de humo con un email real a una dirección del usuario y validadores | B.5, B.6 |
| Lunes 9 nov | Samples del sello con su licencia, subidos, y las tres semanas programadas (las que empiezan el 16, el 23 y el 30 de noviembre) | B.7 |
| Jueves 12 nov | Lista de 15–25 productores, texto de la invitación y canal para comentarios | B.1, B.8 |
| Domingo 15 nov | Online y anuncio: invitaciones enviadas (con la confirmación del usuario); comprobación final (salud, tick y la semana del 16 como próxima en `/api/weeks/current`) | B.8 |
| Lunes 16 nov, 00:00 | Primera ronda: cae el sample | B.9 |
| Domingos 22 y 29 nov y 6 dic | Sellado de cada semana (votos hasta las 23:59:59); resultados y Lunes de batalla al día siguiente | B.9 |
| Semana del 7 dic | Acta de la beta y cierre | B.10 |

## Cobertura de la especificación

| Id | Tarea(s) | Verificación |
|----|----------|--------------|
| `RNF-PRIV-05` | B.2, B.3 | `/legal/privacidad` publicada (borrador revisado por el usuario) |
| `RF-SHARE-01` | B.6 | validador de previsualización con una URL pública (`/e/:id`) |
| `RF-SHARE-05` | B.6 | validador de datos estructurados con una URL pública |

Lo demás de la beta no añade requisitos: pone en producción los de F0–F6 y los mira con usuarios.

---

## Tareas

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| B.1 | ⚠️ Decisiones de antes de la beta: premios (por defecto, sin premio material), el menú en los móviles de 781–840 px de alto (acta de la 0.28), fecha de la primera semana y la lista de 15–25 productores | 🔄 En curso (2026-10-15: sin premio material y el menú móvil como está. 2026-10-28: online y anuncio el **domingo 15 de noviembre de 2026** y primera ronda el **lunes 16**, en lugar del 19 de octubre. Faltan los productores) | — | ROADMAP «Decisiones abiertas» |
| B.2 | Textos legales en `docs/legal/` (privacidad, términos, cookies y bases del Anexo A) y su página `/legal/:doc` en lugar de la provisional; los datos del sello (razón social, NIF, domicilio, email de contacto) como huecos a rellenar | ✅ Hecho | — | §4.14, Anexo A · `RNF-PRIV-05` · Hecho: `docs/legal/{privacidad,terminos,cookies,bases}.md` y `/legal/:doc` con el índice y el texto (`app/legal/markdown.tsx`, 4 tests); mirada en 1440 y 390. Pasa a la B.3 (revisión del usuario y datos del sello). |
| B.3 | ⚠️ Revisión de los textos por el usuario y los datos del sello | ✅ Hecho | B.2 | Antes del lanzamiento público, revisión con criterio legal (F10) · Hecho (2026-10-15; el usuario delega la redacción): los datos que el sello ya publica en `otherpeople.es` (NIF, domicilio, contacto), premios sin premio material, transferencias fuera de la UE y los datos del prestador en los términos; ningún `[[…]]` (guía v0.6.84) |
| B.4 | Guía de despliegue (`docs/deploy/beta.md`): recursos, variables, orden y comprobaciones; `pnpm preflight`, que valida las variables de producción sin red | ✅ Hecho | — | §4.15 · Hecho: `docs/deploy/beta.md` y `pnpm --filter @beatbattle/server preflight` (`config/preflight.ts`, 3 tests). |
| B.5 | ⚠️ Recursos: proyecto de Vercel (`fra1`), Turso (UE), Cloudinary (prefijo `beatbattle`), dominio `battle.otherpeople.es`, Gmail del Workspace del sello (§4.19.1, contraseña de aplicación), OAuth de Google y Discord con las URL de producción, secretos y la variable `BB_TICK_URL` del flujo de GitHub | 🔄 En curso | B.4 | Nada se crea sin confirmación (CLAUDE.md) · Hecho (2026-10-15, con el visto bueno del usuario): el proyecto `beatbattle` de Vercel (equipo `alexalvarezalmendros-projects`, enlazado a GitHub, `fra1`, Node 22) con las construcciones en pausa (*Ignored Build Step* `exit 0`) y las variables de producción que no dependen de nadie (URL pública, proxy, prefijo de Cloudinary, remitente, cupo y los cuatro secretos nuevos, *sensitive*). Copia local en `apps/server/.env.production` (fuera del repo). Después (2026-10-15): Turso (la integración de Vercel; `DATABASE_URL` y `DATABASE_AUTH_TOKEN` solo en producción, conexión comprobada) y `MAIL_REPLY_TO`; Cloudinary con el secreto rotado, comprobado con su `ping` y en la copia local. Después (2026-10-16): Cloudinary, OAuth y el dominio (el usuario; la subida de un sample y la entrada con Google y Discord funcionan en producción) y el tick de GitHub (`BB_TICK_URL` y `BB_CRON_SECRET`, con el visto bueno del usuario; lanzado a mano, responde sin errores). Después (2026-10-28): Gmail en Vercel (`GMAIL_USER`, `GMAIL_APP_PASSWORD` y `EMAIL_FROM_ADDRESS`, `justsomeotherpeople@gmail.com`, guía v0.6.89; los puso el usuario). Falta: `MAIL_DAILY_LIMIT` a 450 (sigue en 1900) |
| B.6 | ⚠️ Preview y producción: desplegar, prueba de humo (salud, registro, subida real, voto, sellado de una semana de prueba, Lunes de batalla a una lista blanca), validadores (`RF-SHARE-01`, `RF-SHARE-05`) y lo escrito sin verificar (reescrituras de las páginas compartibles, `includeFiles` de las fuentes y del `index.html`) | 🔒 B.5 | B.5 | Producción sirve la PR #99 (2026-10-15): los despliegues de la #100 a la #103 se cancelaron por el *Ignored Build Step*, y la #103 arregla el editor de samples; las variables nuevas entran con el siguiente despliegue |
| B.7 | ⚠️ Calendario real: samples del sello con su licencia y 3 semanas programadas | 🔒 B.5 | B.5 | |
| B.8 | ⚠️ Invitaciones (emails reales: con confirmación del usuario) y canal para comentarios | 🔒 B.6 | B.6, B.7 | |
| B.9 | Durante la beta: seguimiento semanal (errores, cupo de Gmail, cola de email, sellado y Lunes de batalla), copia semanal de Turso (§4.15) y un acta por semana | 🔒 B.8 | B.8 | |
| B.10 | Cierre: datos de participación, decisiones «tras la beta» (modelo de semana) y paso a F7, F9 y F10 | 🔒 B.9 | B.9 | |

---

## Entregable

BeatBattle en producción con tres semanas jugadas por productores reales y un acta de lo aprendido.

## Criterio de aceptación

1. Política de privacidad, términos, cookies y bases publicados y revisados por el usuario.
2. Producción desplegada con la prueba de humo en verde y los validadores de `RF-SHARE-01` y `RF-SHARE-05`.
3. Tres semanas reales selladas con sus Lunes de batalla enviados.
4. Acta de la beta con las decisiones que se dejaron para después.

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-28 | B.1, B.5, B.6 | Nueva fecha (decisión del usuario): online y anuncio el domingo 15 de noviembre y primera ronda el lunes 16; el 19 de octubre pasó sin semanas (producción no tiene ninguna: `/api/weeks/current` y `/api/weeks` vacíos). Sección «Calendario». Gmail en Vercel (el usuario); falta el cupo a 450. Producción sirve la #99: hay que desplegar `main`. |
| 2026-10-16 | B.7 | Arreglo en el editor de samples (guía v0.6.90): con el audio y la portada elegidos seguidos, cada subida pedía su propio id y el sample no se podía crear. Era el fallo intermitente de `weeks.spec.ts` en la CI. |
| 2026-10-16 | B.5, B.6, B.7 | Tick de GitHub en marcha. Producción sana: salud con la BD arriba, sin errores de la función en 24 h, `robots.txt` y `sitemap.xml` bien. El tick avisa de que el lunes 19 aún no tiene semana. Gmail: la cuenta del sello (guía v0.6.89). |
| 2026-10-15 | B.1, B.6 | La beta empieza el lunes 19 de octubre. `admin:grant` (guía v0.6.87) y el usuario ya es admin en producción (su cuenta de Google; queda en `audit_log`). |
| 2026-10-15 | B.6 | El usuario entra en producción con Google y Discord, pero no puede salir: no había «Cerrar sesión» en ninguna pantalla. `RF-AUTH-11` (guía v0.6.86): en Ajustes → Cuenta y en la fila de «Esta sesión»; tests de Testing Library y E2E, mirado en 1440 y 390. |
| 2026-10-15 | B.6 | El primer despliegue (lo lanzó el usuario) caía entero: faltaba el `hb.wasm` de satori en la función. `includeFiles` con `hb.wasm` y ffmpeg, y `pnpm build` comprueba la función como la monta Vercel (guía v0.6.85). |
| 2026-10-15 | B.3, B.5 | Textos legales completos con los datos publicados del sello (guía v0.6.84); `preflight` comprueba el cupo con una cuenta `@gmail.com`. Turso y `MAIL_REPLY_TO` en Vercel; Cloudinary comprobado. |
| 2026-10-15 | B.1, B.5 | Decisiones del usuario: sin premio material y el menú de los móviles de 781–840 px como está. Proyecto de Vercel creado con sus variables de producción (sin construir todavía). |
| 2026-10-15 | B.2, B.4 | Textos legales (borradores con huecos para los datos del sello) y su página; guía de despliegue y `preflight` (guía v0.6.83). |
| 2026-10-15 | — | Plan creado al cerrar la F6. B.2 y B.4 se pueden hacer ya; el resto espera al usuario. |

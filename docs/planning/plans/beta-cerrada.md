# Plan — Beta cerrada

> Fase: entre la 6 y la 7 | Estado: 🔄 En curso | Iniciado: 2026-10-15 | Cerrado: —
> Hito del roadmap: 15–25 productores invitados juegan 3 semanas reales en `battle.otherpeople.es`.

El MVP (fases 0–6) está completo. La beta lo pone en producción con productores del entorno del sello. Riesgo
principal: lo que solo se ve desplegado (Vercel, Turso, Cloudinary de producción, Gmail, OAuth), y que haya
poca participación las primeras semanas (guía §6, riesgos).

---

## Dependencia con otras fases

- **Requiere:** F0–F6 cerradas (la F2 y la F3 tienen su hito cumplido; esperan comprobaciones del usuario: Discord
  real 2.22, IMAP real 2.11, cierre 2.26 y la conformidad 3.21).
- **Habilita:** F7 (capa de juego), F9 (integración con Other People) y F10 (moderación, legal y lanzamiento).

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
| B.1 | ⚠️ Decisiones de antes de la beta: premios (por defecto, sin premio material), el menú en los móviles de 781–840 px de alto (acta de la 0.28), fecha de la primera semana y la lista de 15–25 productores | 🔄 En curso (2026-10-15: sin premio material y el menú móvil como está; faltan la fecha y los productores) | — | ROADMAP «Decisiones abiertas» |
| B.2 | Textos legales en `docs/legal/` (privacidad, términos, cookies y bases del Anexo A) y su página `/legal/:doc` en lugar de la provisional; los datos del sello (razón social, NIF, domicilio, email de contacto) como huecos a rellenar | ✅ Hecho | — | §4.14, Anexo A · `RNF-PRIV-05` · Hecho: `docs/legal/{privacidad,terminos,cookies,bases}.md` y `/legal/:doc` con el índice y el texto (`app/legal/markdown.tsx`, 4 tests); mirada en 1440 y 390. Pasa a la B.3 (revisión del usuario y datos del sello). |
| B.3 | ⚠️ Revisión de los textos por el usuario y los datos del sello | 🔒 Usuario | B.2 | Antes del lanzamiento público, revisión con criterio legal (F10) |
| B.4 | Guía de despliegue (`docs/deploy/beta.md`): recursos, variables, orden y comprobaciones; `pnpm preflight`, que valida las variables de producción sin red | ✅ Hecho | — | §4.15 · Hecho: `docs/deploy/beta.md` y `pnpm --filter @beatbattle/server preflight` (`config/preflight.ts`, 3 tests). |
| B.5 | ⚠️ Recursos: proyecto de Vercel (`fra1`), Turso (UE), Cloudinary (prefijo `beatbattle`), dominio `battle.otherpeople.es`, Gmail propia de BeatBattle (contraseña de aplicación), OAuth de Google y Discord con las URL de producción, secretos y la variable `BB_TICK_URL` del flujo de GitHub | 🔄 En curso | B.4 | Nada se crea sin confirmación (CLAUDE.md) · Hecho (2026-10-15, con el visto bueno del usuario): el proyecto `beatbattle` de Vercel (equipo `alexalvarezalmendros-projects`, enlazado a GitHub, `fra1`, Node 22) con las construcciones en pausa (*Ignored Build Step* `exit 0`) y las variables de producción que no dependen de nadie (URL pública, proxy, prefijo de Cloudinary, remitente, cupo y los cuatro secretos nuevos, *sensitive*). Copia local en `apps/server/.env.production` (fuera del repo). Falta: Turso, Gmail, `MAIL_REPLY_TO`, Cloudinary (tras rotar el secreto del spike), OAuth, dominio y las variables de GitHub |
| B.6 | ⚠️ Preview y producción: desplegar, prueba de humo (salud, registro, subida real, voto, sellado de una semana de prueba, Lunes de batalla a una lista blanca), validadores (`RF-SHARE-01`, `RF-SHARE-05`) y lo escrito sin verificar (reescrituras de las páginas compartibles, `includeFiles` de las fuentes y del `index.html`) | 🔒 B.5 | B.5 | |
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
| 2026-10-15 | B.1, B.5 | Decisiones del usuario: sin premio material y el menú de los móviles de 781–840 px como está. Proyecto de Vercel creado con sus variables de producción (sin construir todavía). |
| 2026-10-15 | B.2, B.4 | Textos legales (borradores con huecos para los datos del sello) y su página; guía de despliegue y `preflight` (guía v0.6.83). |
| 2026-10-15 | — | Plan creado al cerrar la F6. B.2 y B.4 se pueden hacer ya; el resto espera al usuario. |

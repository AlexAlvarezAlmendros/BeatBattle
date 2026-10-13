# Emails de la Fase 5 (tarea 5.12)

Capturas a 600 px (escritorio) y 390 px (móvil) de los avisos de la batalla, con sus fixtures, generadas con
`packages/emails/scripts/gallery.tsx` y `tools/shot/emails.mjs` contra `pnpm dev:all` en local (2026-10-13).
Junto a cada par, el texto plano.

| Tipo | Asunto del fixture | Qué se ve |
|---|---|---|
| `battle.reminder` | «Te quedan ~26 h para subir tu flip» | Horas que quedan, el sample, cuenta atrás de envíos y «Subir mi flip» |
| `battle.jury_call` | «Te quedan 12 beats por escuchar» | Entradas por puntuar, cuenta atrás de **votos** (`<semana>.votes.gif`) y «Al jurado» |
| `battle.first_votes` | «Tu beat ya suena: 5 votos» | Votos y escuchas, sin media ni posición, y «Compartir mi beat» |

La cuenta atrás sale a ceros porque la BD local no tiene la semana 42: la ruta da la imagen de ceros a una
semana que no existe, como en la galería del drop (F3). En los tests del servidor
(`apps/server/test/battleNotices.test.ts`) los tres avisos se encolan y se envían de verdad con el `Mailer` en
memoria, y el contrato `RF-NOTIF-13` se comprueba sobre lo enviado.

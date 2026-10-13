# Evidencias de la Fase 6

## Tarjeta de resultado (tarea 6.10)

`tarjeta/`: la tarjeta personal del Lunes de batalla (`GET /api/og/result/:slug/:userId?sig=`), pintada con
`apps/server/src/media/resultCard.ts` (satori 0.33.5 + resvg 2.6.2, fuentes del juego en `woff` estático):
1.º, 2.º con la clasificación corregida, 3.º con un título largo (dos líneas y puntos suspensivos), 7.º y sin
clasificar. 1200 × 630; en el email va a 512 px y ningún texto baja de 14 px (30 px en la imagen). Unos 190 ms
por tarjeta en caliente (la primera, ~420 ms, carga las fuentes).

## Emails del lunes (tarea 6.9)

`emails/`: capturas a 600 y 390 px, con el texto plano, de `battle.monday` (resultado personal + drop),
`battle.monday.subscriber` (alerta sin cuenta: el podio, sin parte personal, e invitación a crear cuenta),
`battle.results` y `battle.results.empty` (semana desierta). Generadas con `packages/emails/scripts/gallery.tsx`
y `tools/shot/emails.mjs` (la tarjeta, servida desde `card.png`) el 2026-10-13. La cuenta atrás sale a ceros
porque la semana del ejemplo no existe en la BD local.

El reparto (combinado, separado, espera de 2 h al sellado, prioridad y el contrato de voto ciego) se prueba con
el `tick` y el `Mailer` en memoria en `apps/server/test/monday.test.ts`.

## Imágenes OG (tarea 6.11)

`og/`: semana abierta y en votación (portada generativa con la semilla de la semana y la cuenta atrás
congelada), entrada en voto ciego («Escúchala y vota», sin autoría ni cifras) y sellada (alias tachado,
productor, medalla y puntuación), resultados (podio) y perfil (solo semanas selladas). Pintadas con
`apps/server/src/media/ogImages.ts`; la portada, por CPU con `svgCanvas.ts` y su calibración (2–4 pasadas,
dentro del 0,1 % de la referencia). Entre 70 ms (sin portada) y 520 ms (la primera, con fuentes y calibración).

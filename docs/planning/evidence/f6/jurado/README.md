# Jurado visual de la Fase 6 (tarea 6.22)

Tres lentes (marca, juego y uso) sobre la página de resultados, la ceremonia, el archivo, la ficha sellada, la
oferta de la home, los emails del lunes, las imágenes OG y las tarjetas para stories. Capturas contra
`seedBattle … sealed` con `tools/shot/results-f6.mjs` (resultados en 1440, 1366, 1024, 390 y 320, sin movimiento
y en contraste alto; fotogramas de la ceremonia en 1440 y 390, con y sin movimiento; la tarjeta descargada) y
`tools/shot/shot.mjs` (archivo, ficha y home en 1440 y 390), 2026-10-13. Los emails, las imágenes OG y la
tarjeta de resultado están en `../emails`, `../og` y `../tarjeta`.

## Corregido durante el jurado

| Id | Lente | Hallazgo | Arreglo |
|---|---|---|---|
| J1 | Uso | Con «Ver la ceremonia» y «Tarjeta para stories», «TU RESULTADO» se partía en dos filas y quedaba a medias bajo la barra a 1440 × 900 | Los dos botones van en la línea de la semana (como «R Repetir la ceremonia» de la maqueta 04); la barra vuelve a sus dos botones y el podio es algo más compacto. Cabe entero a 1440 × 900 |
| J2 | Uso | Probado: «TU RESULTADO» pegado al pie para que se vea con poco alto | Rechazado: a 1366 × 657 tapaba el podio y chocaba con la barra de dos filas. Se queda en su sitio y la pantalla se desplaza (§3.8.14) |
| J3 | Marca | En contraste alto, la peana del 1.º seguía roja y el suelo de trama (lienzo) no se adaptaba | Sin focos ni suelo y las peanas con contorno `CanvasText` (6.15) |
| J4 | Juego | La firma «OTP.» de la tarjeta para stories chocaba con el enlace | Firma a la altura de las cifras; el enlace, recortado letra a letra (6.14) |
| J5 | Juego | El foco de la ceremonia no se veía (quedaba detrás del velo) | El puesto en escena aísla su contexto de apilado (6.17) |
| J6 | Marca | Las placas de la ceremonia y la cinta «RESULTADO CORREGIDO» de la tarjeta partían en dos líneas | Textos más cortos (6.10, 6.11) |

## Abierto

| Id | Gravedad | Hallazgo | Nota |
|---|---|---|---|
| B1 | Baja | A 1366 × 657 y 1024 × 768, «TU RESULTADO» queda bajo el pliegue | Se llega desplazando o con T (clasificación); permitido en las pantallas de contenido (§3.8.14) |
| ~~B2~~ | — | Los seis efectos `cer.*`, sin escuchar | **Cerrado** (2026-10-15): el usuario los ha escuchado y dan el visto bueno |
| B3 | Baja | En el archivo, en escritorio, los botones de escuchar del podio quedan lejos de su fila | Revisar con la rejilla de «selección de escenario» si llega |
| ~~B4~~ | — | La ceremonia era 2D (DOM) | **Cerrado** (tarea 6.17b, decisión del usuario: «la ceremonia tiene que ser 3D»): podio, focos, portadas, sello, medallas y corona en el Escenario; fotogramas `ceremonia-*` de 1440 y 390 (con y sin movimiento) rehechos. 60 fps y 39 llamadas de dibujo en el momento del campeón, también con la calidad baja |

## Lentes

- **Marca:** paleta estricta (negro, rojo, blanco, granate); firma *OTP.* en todas (la barra, la pegatina de la
  ceremonia, la de las imágenes); nada de la lista de §3.1. Medallas en la paleta, sin dorado (decisión de la F6).
- **Juego:** placa del HUD con el sello «SELLADA», podio con escena y peanas, anunciador «¡SELLADO!» y
  «¡CAMPEÓN!», teclas a la vista (← → podio, Intro, T, X, R, Esc). Nunca «K.O.» ni «gana a…».
- **Uso:** sin cuña en los resultados, así que ningún texto cae sobre la diagonal ni la trama (`RD-VIS-05`); los
  nombres llevan su fondo; móvil apilado; sin movimiento, fundidos; contraste alto legible; axe sin violaciones
  en la página de resultados (E2E de la 6.21).

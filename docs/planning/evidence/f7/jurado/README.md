# Jurado visual de la Fase 7 (tarea 7.35)

Tres lentes (marca, juego y uso) sobre la capa de juego: el HUD con XP y teselas, el «+5 XP» en vuelo, los avisos de
logro y de subida de nivel, la carta (anverso, reverso y variantes; 3D con su pase y plana) y sus otros sitios
(bienvenida y Ajustes → Perfil), el perfil, el salón de la fama, la temporada (cerrada y en curso), la ceremonia del
campeón de temporada, los emails `game.progress` y `season.wrap`, las tarjetas para *stories* y la imagen OG del perfil.
Contra `main` (f5773ab, con la 7.34: `StageCanvas` y la caja nueva de la carta), 2026-11-03, guía v0.6.147 → v0.6.148.

**Cómo.** API con `seedBattle.ts … season` (la T3 de 2026 cerrada con su campeona, `prod01`; cuatro semanas selladas de
la T4 y la de este lunes abierta) en el puerto 3701 y la web en el 5774. Chrome del sistema con la GPU (ANGLE sobre
Vulkan) y `--disable-lcd-text`:

- `tools/shot/jury-f7.mjs` (nuevo): HUD (en el menú), banco de recompensas (`/dev/recompensas`: «+5 XP» al nacer y en
  vuelo, subida de nivel, tres placas y su cola, legendario), los avisos que trae `me` al cargar, la carta del banco
  (`/dev/carta`), la bienvenida y Ajustes → Perfil, el perfil (campeona con pase, roja, estándar, jurado y el propio con
  el cursor en los logros), el salón, la temporada, las OG del perfil y las *stories* del banco. En 1440 × 900,
  1366 × 657, 1024 × 768, 390 × 844 y 320 × 568 táctiles y, en escritorio, sin movimiento, en contraste alto, con la
  calidad apagada y en modo serio. En táctil, la página se recorre desplazándola (`-p2`, `-p3`…): la captura de página
  entera de Chrome deja la barra de controles fija a media página y no es lo que se ve.
- `tools/shot/pase-f7.mjs` (el pase: reposo, arrastre, holo, reverso, foco, las cinco planas, el detalle y el móvil),
  `tools/shot/season-ceremony-f7.mjs` (ahora también a 1024 × 768, 320 × 568, 360 × 640 y 375 × 667),
  `tools/shot/flow-f7-compartir.mjs` (perfil propio, D y «Altavoz») y `tools/shot/emails.mjs` (galería de emails a 600 y
  390 px, con las cartas de ejemplo de `apps/server/src/scripts/emailWaveforms.ts`).

**Miradas:** las 233 capturas de esta carpeta (y las intermedias de cada arreglo, que no se guardan), abiertas una a
una o en hojas de contacto a media escala, con recortes a escala real para la letra pequeña. Por superficie: HUD 9 ·
recompensas 45 · avisos al cargar 2 · carta del banco 13 · bienvenida y Ajustes → Perfil 10 · perfil 40 (el propio, 8)
· pase 14 · salón 18 · temporada 27 · ceremonia del campeón 31 · emails 10 · *stories* 5 · OG del perfil 5 · `antes-*`
4 (el estado previo a un arreglo). Las idénticas píxel a píxel (la carta del banco con la calidad apagada y en modo
serio es la de siempre: no lleva Escenario ni movimiento) no se guardan.

## Corregido durante el jurado

| Id | Lente | Hallazgo | Arreglo |
|---|---|---|---|
| J1 | Uso | **`season.wrap`, la carta del trimestre ilegible** (hallazgo conocido, confirmado): era la imagen OG apaisada (1200 × 630) a 512 px, y en el móvil, a ≈ 306 px: la letra de la carta bajaba a 3–6 px (`antes-season.wrap-390.png`, `antes-season.wrap-600.png`) | La **carta sola**, en vertical (`GET /api/og/profile/:username/card.png`, 608 × 828, el mismo anverso que la OG), a 376 px como mucho y centrada: a 390 px su letra más pequeña queda en ~11 px y el resto en 12–27 (`season.wrap-390.png`, `season.wrap.champion-600.png`). Guía §2.12.7, §4.10, §4.19.5, `RF-NOTIF-12` y Anexo H (v0.6.148); tests `RF-NOTIF-15` (emails y servidor) y `RF-SHARE-02` |
| J2 | Uso | **Los nombres con punto no tenían página compartible ni imagen** (destapado al hacer J1: `kairo.wav` es un nombre válido, `RF-AUTH-06`): el id de la URL era `[\w-]`, así que `/p/kairo.wav` salía con 404 y sin metadatos, y su imagen OG y la carta de su `season.wrap`, con 404 (una imagen rota en el email) | El id admite el punto (`[\w.-]`) en las páginas compartibles y en las imágenes OG. Tests `RF-SHARE-01` y `RF-SHARE-02` con «kai.ro», que fallan sin el arreglo |
| J3 | Juego | **Salón: los récords no iban en columnas**: cada fila tenía su rejilla y el nombre se movía según lo ancha que fuera su cifra (`antes-salon-records-1440x900.png`); una tabla de récords de recreativa va alineada | Las columnas son de la lista y cada fila las toma con `subgrid` (`salon-1440x900.png`, `salon-1024x768.png`). En el móvil cada fila sigue con la suya y, hasta 360 px, la cifra va bajo el nombre: al lado de «10 victorias», «PROD01» partía en «PRO / D01» (`salon-p2-320x568-tactil.png`). Guía §3.8.14 |
| J4 | Uso | **La carta plana estrecha se desbordaba** (efecto de la caja nueva de la 7.34, que ya no crece con lo de dentro): por debajo de ~300 px el cuerpo no cabía en su mitad y el pie y la pegatina pisaban el marco (bienvenida y Ajustes → Perfil a 1024 × 768; el perfil a 320, por poco) y, en la ceremonia del campeón a 360 × 640 y 375 × 667, el pie de la carta pisaba «¡ERES EL CAMPEÓN…!» | Cede el retrato (de su 50 % hasta un 25 % de la carta) y el cuerpo nunca se sale; a 352 px, la carta de siempre (el retrato, 54 %). Medido en el banco de 150 a 352 px: sin desbordarse desde 200 px (`bienvenida-1024x768.png`, `ajustes-perfil-1024x768.png`, `7.27-campeona-cifras-360x640-touch.png`). Guía §3.4.4 |
| J5 | Uso | **Placa de logro a 320 px**: el XP a la derecha le quitaba ~70 px al texto y el rótulo partía en tres líneas, una empezando por «·» («LOGRO / DESBLOQUEADO / · COMÚN»; `antes-recompensas-logros-320x568-tactil.png`) | Hasta 360 px el XP va bajo el texto y el punto va pegado al rótulo: «LOGRO DESBLOQUEADO ·» y la rareza debajo, el nombre en una línea (`recompensas-logros-320x568-tactil.png`, `recompensas-legendario-320x568-tactil.png`). Guía §3.8.8 |
| J6 | Marca | En la galería de emails, la `season.wrap` de la campeona enseñaba la carta holo de otra cuenta, sin corona, bajo «Tu carta ya lleva la corona» (las tres variantes compartían `profile-card.png`) | Herramienta, no app: cada ejemplo tiene su carta en su variante (`card-<nombre>.png`: holo, campeón y estándar) y `emails.mjs` la sirve por nombre |

## Abierto

| Id | Gravedad | Hallazgo | Nota |
|---|---|---|---|
| A1 | **Alta** | **La ceremonia del campeón en un móvil de poco alto.** En una columna (§3.8.15), la carta se queda con el alto que dejan la placa, el anunciador, las cifras y «Saltar»: 137 px de ancho a 320 × 568, 226 a 360 × 640 y 247 a 375 × 667 (los dos últimos, móviles corrientes). A esos anchos su texto a 12 px no cabe: a 320 la carta se desmonta y su pie pisa las cifras (`7.27-campeona-cifras-320x568-touch.png`); a 360 y 375, con J4 ya no pisa nada, pero los rótulos se cortan («VICTORI…», «CAMPEÓN DE TE…»), el retrato se aplasta bajo su etiqueta y el pie y la pegatina se salen por la derecha (`7.27-campeona-cifras-360x640-touch.png`, `…-375x667-touch.png`). Con **ex aequo**, en cualquier móvil (dos cartas en una fila, ~150 px cada una) | **Decisión de diseño** (la composición de §3.8.15 frente a `RD-VIS-05`): la carta necesita ~280 px y, con su texto a 12 px, la ceremonia entera no cabe en 568–667 px de alto. Opciones: **(a)** en ventana baja y vertical, la carta como dibujo, escalada desde 280 px (su letra baja de 12 px, como en una imagen), y el nombre del campeón también en la línea de las cifras, para que no se pierda (hoy, quien no es campeón solo lo lee en la carta); **(b)** sin carta en esas ventanas: placa, anunciador, nombre y cifras; **(c)** la capa se desplaza y solo «Saltar» la cierra (hoy un toque la cierra). Recomendación: **(a)**, que es la que menos cambia la ceremonia. Hasta que se decida, la 7.36 no puede cerrar la fase (criterio 7: ningún hallazgo alto abierto) |
| A2 | Baja | Los avisos tapan lo que hay debajo mientras duran: en el móvil, la placa de nivel y «¡NIVEL 8!» van sobre el título de la pantalla («¡NIVEL 8! …ENSAS»), y entre placa y placa asoma un trozo de lo de debajo (`recompensas-nivel-390x844-tactil.png`, `pendientes-al-cargar-1440x900.png`) | Duran 4 s, no bloquean y no paran el ratón (§3.8.8: «ninguna placa tapa un control más de lo que dura»). Un velo detrás sería una pieza nueva; se deja |
| A3 | Baja | Las tarjetas para *stories* (las tres; también las de la F6): el rótulo de arriba (~170 px) y la placa «ENTRA EN LA BATALLA» con el enlace (~1730–1830 px) caen en las franjas que tapan las interfaces de *stories* (~250 px arriba y ~340 abajo); en «Mi carta de productor» queda además un hueco vacío entre la carta y la placa (`stories-*.png`) | La guía no pide margen seguro. Propuesta: 250 px arriba y 340 abajo en las tres, con la carta más grande en el hueco. Para decidir (o para la F10) |
| A4 | Baja | Contraste alto: la trama de la arena (el lienzo) sigue roja sobre el blanco del sistema detrás del menú, el perfil, el salón y la temporada (`hud-menu-contraste-1440x900.png`, `perfil-campeona-contraste-1440x900.png`) | Ningún texto va encima: los paneles pasan a `Canvas`. Es de antes de la F7 (en la ceremonia de resultados se quitó, J3 de la F6). Para la auditoría de accesibilidad de la F10 |

## Lentes

- **Marca.** Paleta estricta en todas: la carta y sus cuatro variantes (estándar, roja, holo acotada a rojo, blanco y
  granate, y campeón con lámina roja y corona: **sin dorado**), la cinta del pase con «OTP.», el HUD, los avisos (la
  rareza también en palabra), los emails (épico en granate con borde rojo, legendario en rojo de botón) y las OG. La
  firma *OTP.* en todas: barra de controles, pie y reverso de la carta, cinta del pase, esquina de la ceremonia, cabecera
  de los emails; en las OG y las *stories*, «OTP.» en display rojo, como en la F6. Nada de §3.1: ni cristal, ni píldoras,
  ni marquee, ni orbes, ni Montserrat; el pase no se lee como el `Lanyard` del sello (decisión del usuario, cerrada).
- **Juego.** Menú de recreativa en todas: el cursor es el foco (en los logros del perfil, en la tira del salón, en la
  tabla de la temporada), las teclas a la vista en la barra (`[C] GIRAR CARTA`, `[D] PARA STORIES`, `[←][→] GANADORES`,
  `[↑][↓] ELEGIR`) y en las piezas («Girar carta [C]», «Ver los 36 logros [L]», «Volver al menú [Esc]»). Anunciador de
  una a tres palabras: «¡NIVEL 8!», «¡LOGRO LEGENDARIO!», «¡CAMPEÓN DE TEMPORADA!»; ningún texto de §3.9 («K.O.»,
  «YOU WIN», «GANA A…»…). El HUD lleva el medidor segmentado con «XP 5.200 · NV 10 · 5.950» y las teselas «TEMPORADA T4 ·
  14 PTS · 9.º» y «RACHA ×7»; en el móvil táctil, plegado (sin cifras ni teselas, §3.4.1).
- **Uso.** Texto ≥ 12 px en la web (la carta, tras J4, también estrecha; la placa, tras J5, a 320) y nunca sobre trama:
  las placas, el «+5 XP» (en su placa negra), la carta y los paneles son opacos, y la ceremonia va sobre velo opaco. A
  390 y 320 todo se lee y se llega desplazando (pantallas de contenido, §3.8.14); lo que queda bajo el pliegue a
  1366 × 657 y 1024 × 768 (la carta grande del perfil, la tira del salón) se alcanza igual. Contraste alto legible (la
  carta con el marco del sistema, sin lámina ni trama). Sin movimiento, la carta plana y fundidos; con la calidad
  apagada, en modo serio y sin WebGL, la carta plana (sin pase) y, en modo serio, sin anunciador ni estampa. Ninguna
  pantalla se rompe salvo A1.

## Notas

- **Datos de la siembra**: las cuentas se crean con el reloj de verdad, así que el perfil dice «En la batalla desde
  noviembre de 2026» y la carta «Desde 11/2026» junto a logros de julio. Es de `seedSeason`, no de la app.
- El banco de recompensas lanza el «+5 XP» desde un botón suelto entre otros: allí nace pegado al botón de al lado; en
  las pantallas de verdad nace junto a las estrellas o al combo (7.19), que no tienen vecinos a su derecha.
- La 7.34 dio por buena la caja nueva de la carta con capturas idénticas a 352 px; la diferencia sale por debajo de
  ~300 px (J4). La carta 3D del pase no cambia: su textura la pinta `cardCanvas`, no el HTML.

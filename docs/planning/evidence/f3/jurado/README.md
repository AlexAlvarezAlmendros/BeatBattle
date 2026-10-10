# Acta del jurado visual de la Fase 3 (tarea 3.21)

> **Fecha:** 2026-10-10 · **Rama:** `feat/3.20-e2e-jurado` · **Guía:** v0.6.42 → **v0.6.47** ·
> **Requisito:** `RD-VIS-02` (e) sobre las pantallas nuevas de la fase:
> - la home viva (menú con la semana real, pantalla de título, calendario vacío y carga);
> - la ficha del drop `/semana/:slug` y el modal de las bases;
> - la revelación del drop;
> - la alerta sin cuenta (`/alerta`) y su formulario en «Cómo se juega»;
> - el panel de admin (calendario y editor de samples y chops);
> - los emails de la fase.
>
> **Resultado:**
> - **Marca:** ✅ al tercer pase.
> - **Accesibilidad:** ✅ al tercer pase.
> - **Juego:** ✅ al sexto pase **con la excepción de la n.º 1**, que está **pendiente de la conformidad del usuario**. Sin esa conformidad, la lente queda ❌ solo por esa.
>
> Todas las demás altas y medias están corregidas y verificadas. Las bajas que siguen abiertas llevan su motivo.

## Cómo se juzgó

- **Jurado:** tres jurados independientes, uno por lente: marca, juego y accesibilidad. Cada lente numera sus
  hallazgos por su cuenta, así que en las tablas van con su prefijo: **J** (juego), **M** (marca) y **A** (accesibilidad).
- **Primer pase:** 37 capturas de `tools/shot/jury-f3.mjs`.
  - Tamaños reales: 1440 × 900, 1366 × 657, 1024 × 768, 390 × 844 táctil y 320 × 568 táctil.
  - Además: contraste alto (`forced-colors`) y «reducir movimiento».
  - Entorno: la API en modo test con el seed de semanas (`seed:weeks`), el almacenamiento falso (`BB_FAKE_STORAGE`) y el buzón en memoria.
  - El admin se capturó con una cuenta a la que se dio el rol en la base de datos de prueba.
- **Pases siguientes:** comprobaron los arreglos con capturas nuevas.
  - Desde el segundo, Chrome va con `--disable-lcd-text`, para que el suavizado del texto no cuente como color fuera de la paleta (M12).
  - El seed lleva un título de 49 caracteres («Una tarde de lluvia en la plaza del sol de Gràcia») y, desde el tercero, la tonalidad «Fa sostenido menor».
- **Sexto pase, solo la lente de juego:**
  - la tira de la revelación a 500, 1300, 2300, 3000, 3600, 4400 y 5500 ms;
  - el menú mientras carga la semana, con `/api/weeks/current` retrasada 3 s;
  - el menú con el título largo a 1440 × 900 y a 1280 × 720.
- **Emails:** se juzgaron con la galería (`../emails/`).

Las capturas de esta carpeta son las del último pase.

## Veredictos

| Lente | 1.er pase | 2.º pase | 3.er pase | 4.º pase | 5.º pase | 6.º pase |
|---|---|---|---|---|---|---|
| **Marca** (paleta, firma, «Lo que nunca se imita», granate, §1.3) | ❌ 1 · 4 · 7 | ❌ (dos medias nuevas: el signo ♯ y el título de la revelación) | ✅ | — | — | — |
| **Juego** (maquetas, menú de recreativa) | ❌ 2 · 11 · 8 | ❌ (J1 y seis medias, tres nuevas con el título largo) | ❌ (J31 alta y J32 media, con la tonalidad larga) | ❌ (J34, regresión alta del arreglo de J31) | ❌ (J37 alta, J38 y J39 medias) | ✅ con la excepción de la n.º 1 (pendiente de la conformidad del usuario; sin ella, ❌ solo por esa) |
| **Accesibilidad** (WCAG 2.2 AA, `RD-VIS-05`, teclado) | ❌ 3 · 7 · 10 | ❌ (dos medias nuevas: A21 y A22) | ✅ | — | — | — |

- Las cifras son hallazgos altos · medios · bajos.
- «—»: esa lente ya había pasado y no se repitió. Los pases 4 a 6 de juego solo tocaron la tarjeta del menú, la revelación y la carga.

**Granate en el último pase** (criterio de las actas de la F0 y la F2: píxeles con r entre 25 y 110,
g < 0,45·r y b < 0,6·r, en la primera ventana; techo 24,5 % a 1440). Medido sobre las capturas de esta carpeta:

| Pantalla | 1440 | Otros tamaños |
|---|---|---|
| Menú | 21,7 % (maqueta: 21,6 %) | 20,3 % a 1366 · 17,7 % a 1024 · 10,7 % a 390 · 9,7 % a 320 |
| Menú con el título largo | 21,0 % | — |
| Menú cargando | 22,1 % | 9,6 % a 390 |
| Calendario vacío | 22,2 % | 10,9 % a 390 |
| Ficha | 21,4 % | 9,3 % a 390 (23,2 % a 320 en el 3.er pase de marca, dentro del techo) |
| Cómo se juega | 18,1 % | — |
| Título / alerta / bases | 2,1 % / 0,5 % / 6,5 % | — |
| Revelación (a mitad / sin movimiento) | 1,4 % / 0,5 % | — |
| Admin (calendario / chops) | 0,1 % / 7,3 % | — |

- Antes del arreglo de M2, el calendario del admin daba 28,2 % a 1440 y 30,2 % a 1024.
- Desde el segundo pase, todas las capturas normales tienen 0,000 % de píxeles fuera de la paleta. Las de contraste alto usan los colores del sistema y no cuentan.

## Hallazgos y lo que se hizo

### Altas y medias

| # | Hallazgo (lente · gravedad) | Qué se hizo | Verificación |
|---|---|---|---|
| J1 | El menú no cabe a 1024 × 768: la tarjeta crece, la barra se despega y sus teclas, el crédito y la pausa quedan fuera de la primera vista (juego · alta) | **No se corrige en esta fase: es una excepción** (ver «Excepción», abajo) | `menu-1024` |
| J2 | Con el calendario vacío, a 390 × 844 el formulario «Avísame» alargaba la tarjeta y la placa 06 quedaba bajo la barra (juego · alta) | Formulario compacto en una fila (`DropAlertForm compact`), con el rótulo para el lector (`labelHidden`) y el ejemplo «Tu email». En los teléfonos bajos se pliega el título del aviso | `vacio-390`; E2E de encaje |
| J3 | Con la semana abierta, el cursor 1P empezaba en Jurado (juego · media) | `MainMenu`: el cursor sigue a la primera opción disponible hasta que la persona lo mueve | `menu-1440`. Que empiece en Jurado mientras carga y pase a Jugar al llegar los datos es lo acordado aquí, no un hallazgo |
| J4 · A13 | «Licencia de uso» parecía un rótulo con un hueco vacío (juego · media) | La licencia es una sección con su `h2` y su texto | `ficha-1440` |
| J5 | La ficha no se apretaba con la ventana baja: «Volver al menú» quedaba bajo la barra a 1366 × 657 (juego · media) | Acciones en una fila (descarga `lg` y «Ver la revelación otra vez» `md`) y separaciones menores con la ventana baja | `ficha-1366` (4.º pase) |
| J6 | En móvil, el vinilo de la ficha llenaba la primera vista (juego · media) | El vinilo queda a ~55 % del ancho | `ficha-390` |
| J7 | La aguja era una barra suelta (juego · media) | Brazo con pivote y cabeza | `revelacion-tira-1440` |
| J8 · M3 | El anunciador y el título de la revelación caían sobre el HUD, las placas y la tarjeta (juego y marca · media) | Velo opaco y la pila de la revelación centrada (§3.8.2, v0.6.46) | `revelacion-*` |
| J9 · M1 | La revelación se quedaba sin firma: el vinilo tapaba la pegatina del lockup y «Saltar» pisaba la barra (marca · alta, juego · media) | Pie propio con la pegatina *OTP.* (`OtpSlapImage size="bar"`) y «Saltar» dentro del medianil, como en la ceremonia (§3.1) | `revelacion-1024`, `revelacion-390`, `revelacion-tira-1440` |
| J10 | Sin movimiento salía la capa quieta, contra lo que decía §3.8.2 (juego · media) | La capa entera funde con los datos ya fijos, y la guía lo dice así (v0.6.46) | `revelacion-sin-movimiento-1440` |
| J11 | El vinilo cae al centro y no «en su sitio del menú» (juego · media) | Se cambió la guía: el vinilo cae al centro (§3.8.2, v0.6.46) | — |
| J12 | El modal de las bases parecía un formulario web: lista «1. 2. 3.» y botones en escalera (juego · media) | Filas 01–05 con el índice en Oxanium rojo. `Modal` con la variante `wide` (40 rem) y el pie en una fila: «Ahora no [Esc]» y «Aceptar y descargar [Intro]» | `bases-1440`, `bases-390` |
| J13 | El editor de chops no era denso (juego · media) | Tabla con la cabecera una vez, campos estrechos, filas bajas y cifras con coma | `admin-chops-invalido-1440` |
| J14 · A10 | La tabla del calendario se cortaba a 390 sin pista, y las tablas no tenían nombre (juego · media, accesibilidad · media) | `caption`, contenedor desplazable y enfocable con su nombre, y `Status` con `role="status"`. La señal visual del desplazamiento sigue abierta (baja) | `admin-1440` (3.er pase de accesibilidad) |
| J22 | Con el título largo, el cartel de la pantalla de título iba en 5 líneas y tapaba la galleta del disco (juego · media) | Título del cartel con `useFitText` (mínimo de 22 px, sin partir). Con una tonalidad larga, la galleta lleva solo el BPM | `titulo-1440` |
| J23 · M14 · A26 | El título largo de la revelación iba en 4 líneas y la sombra dura pisaba la línea siguiente (juego y marca · media) | Interlineado de 1em + 4 px, bloque más ancho y `useFitText` con un mínimo de 32 px | `revelacion-1024`, `revelacion-390` |
| J24 | La tabla del calendario desbordaba a 1024 con un sample largo (juego · media) | Los títulos de sample parten (`.wrap`) | `admin-1440` |
| J31 · M17 | Con «Fa sostenido menor», los chips de la tarjeta móvil partían y 06 Ajustes quedaba bajo la barra a 390 (juego · alta) | En móvil, con una tonalidad larga (`data-long-key`) cede el chip de la duración, y con un título largo la tarjeta aprieta sus filas | `menu-390`; E2E de encaje con `/dev/menu?largo` |
| J32 · M18 · A29 | En la revelación a 390, el chip de la tonalidad tocaba «Saltar» (juego · media) | Más separación entre la pila y el pie en móvil | `revelacion-390` (4.º pase) |
| J34 | Regresión del arreglo de J31: el título del escenario bajaba a 16 px también en escritorio (juego · alta) | El mínimo de 16 px solo en móvil. En escritorio, display en dos líneas equilibradas (`text-wrap: balance`) con aire para la sombra | `menu-1440` |
| J37 | La revelación volvía a empezar a mitad y no llegaba a estampar el título (juego · alta, regresión). Causa: la home vuelve a pedir la semana al montar y cada respuesta trae otra URL firmada del sample, de la que dependía la línea de tiempo | `DropReveal` fija sus datos al montar y se monta con `key` por semana (§3.8.2, v0.6.47) | Test «RF-DROP-11: sigue hasta el final aunque la home vuelva a pedir la semana (otra URL firmada) a mitad»; `revelacion-tira-1440`: el anunciador sale a 1,3 s y a 4,4 s BPM y tonalidad están fijos |
| J38 | A 1440 × 900, con el título en dos líneas, la tarjeta crecía 17 px y su chaflán quedaba bajo la barra (juego · media) | En escritorio, el título baja hasta 24 px antes de partir, y con dos líneas la tarjeta aprieta sus filas (§3.8.3, v0.6.47) | E2E «la tarjeta con un título largo acaba donde la corta, sobre la barra» (1440 × 900 y 1920 × 1080); `?largo` también en la prueba de la línea discontinua de las ventanas bajas; `menu-largo-1440`, `menu-largo-1280` |
| J39 | Al cargar, el menú enseñaba un momento el calendario vacío («En el horno») aunque hubiera semana (juego · media) | `MenuModel.loading`: tarjeta en esqueleto con `aria-busy` y «Cargando la semana…», y Jugar «Cargando…». «En el horno» solo sale cuando la respuesta dice que no hay semana (§3.8.3, v0.6.47) | Test «§3.3: mientras llega la semana, la tarjeta en esqueleto y Jugar «Cargando…», no el calendario vacío»; `menu-cargando-1440`, `menu-cargando-390` |
| M2 | El granate del admin pasaba del techo: 28,2 % y 30,2 % (marca · media) | Filas de hueco sobre el panel, con la marca y el rótulo «HUECO» en rojo | 0,1 % (tabla de arriba); `admin-1440` |
| M4 · J17 | Los chips de la revelación iban fuera del sistema (marca · media) | `DataChip` grande, con chaflán y la unidad como rótulo | `revelacion-tira-1440` |
| M5 | Rayos en el admin sin ninguna pieza delante (marca · media) | `/admin` con `rays: false` | `admin-1440` |
| M13 | El signo ♯ salía de una fuente de reserva (marca · media) | Tonalidades en palabras («Do sostenido»…) y un test de i18n que rechaza ♯ y ♭ | `menu-1440`, `revelacion-390` |
| A1 | Los campos de los chops no se podían editar con el teclado (`toFixed` en cada tecla, «NaN») (accesibilidad · alta) | Borrador por campo y conversión al salir o con Intro, con coma decimal | E2E del hito (el admin guarda los 8 chops); `admin-chops-invalido-1440` |
| A2 · A11 | La revelación era un diálogo sin trampa de foco: Tab y las flechas llegaban al menú y el foco caía en `<body>` (accesibilidad · alta) | `inert` en `#root`; flechas, Tab, Inicio y Fin consumidos; el foco vuelve a donde estaba; `aria-describedby` con el título, el BPM y la tonalidad | Test «modal: lo de detrás queda inerte…» |
| A3 | La ficha tenía bucles (vinilo y reloj) sin «Pausar las animaciones» (accesibilidad · alta, WCAG 2.2.2) | `loops: true` en la ruta `/semana/:slug` | `ficha-1440` |
| A4 · A16 | El input de fichero era una parada de foco invisible y los botones se llamaban igual (accesibilidad · media) | `tabIndex={-1}` en el input, `aria-labelledby` con el hueco y el progreso anunciado por cuartos | 2.º pase de accesibilidad |
| A5 | Los 16 campos de chop no decían de qué chop eran (accesibilidad · media) | `fieldset` con `legend` «Chop N» | `admin-chops-invalido-1440` |
| A6 | Los «Quitar» se llamaban igual, el foco caía en `<body>` y programar no avisaba (accesibilidad · media) | «de la semana #N» para el lector, `th scope="row"`, foco al título del calendario y `Done` al programar | 2.º pase de accesibilidad |
| A7 | «Descarga en marcha» salía como error (accesibilidad · media) | `Done`, con `ui.success` | `../ficha/descarga-1440.png` |
| A8 · A23 | Si el MP3 no cargaba, no se decía (accesibilidad · media) | Error en la onda de la ficha. En la home móvil, un texto con `role="alert"` bajo el play | 3.er pase de accesibilidad |
| A9 | El play cambiaba de nombre y llevaba `aria-pressed` a la vez (accesibilidad · media) | Nombre fijo con `aria-pressed` | 2.º pase de accesibilidad |
| A21 | El ejemplo del campo compacto estaba a 3,99:1 (accesibilidad · media) | `--bb-text-3`, 7,29:1, con el ejemplo «Tu email» | `vacio-1440`, `vacio-390` |
| A22 | Un chop inválido se marcaba solo con color (accesibilidad · media) | Borde blanco de 3 px y «!», el motivo bajo su fila enlazado con `aria-describedby`, un aviso con la lista de chops que fallan y el foco al primero | `admin-chops-invalido-1440` |

### Bajas corregidas

| # | Hallazgo | Verificación |
|---|---|---|
| J18 · M6 | Display de 6 palabras y «próximo drop» repetido en el vacío: ahora «En el horno», con la fecha o «Pronto» en el rótulo | `vacio-1440` |
| J20 · M10 | «2026-W41» partido por el guion a 320 | 2.º pase |
| J21 | El ▶ de un chop desplazado | Se resolvió al rehacer la tabla |
| J26 | Chips de la tragaperras demasiado pequeños | `revelacion-tira-1440` |
| J27 · M16 · A27 | La aguja no se veía con contraste alto: ahora va en `CanvasText` | `revelacion-contraste-1440` |
| J28 · M15 | Etiquetas de chop partidas | 3.er pase |
| J29 · J33 | Cabeceras de los chops partidas, y después desalineadas: ahora van sobre sus columnas | 4.º pase |
| J30 | Ejemplo del campo cortado a 320 | 3.er pase |
| J40 | Mientras cargaba, el esqueleto no tenía el alto de la tarjeta real: a 390 medía unos 210 px frente a 160, y 06 Ajustes quedaba bajo la barra. Al llegar los datos, el logo bajaba unos 40 px a 1440 y volvía a subir. **Corregido tras el sexto pase**: el esqueleto copia las filas de cada composición | `menu-cargando-*` recapturadas |
| M8 | Fuentes de la tabla del admin: rótulos en Chakra Petch y cifras en Oxanium | 2.º pase de marca |
| M12 | Capturas con suavizado LCD: `--disable-lcd-text` en `jury-f3.mjs` | 0,000 % fuera de la paleta |
| M19 | Chops: la ayuda con coma y los campos con punto; plural de «Revisa los chops»; rótulos pegados a 390 | Cifras con coma (J13), plural (A31) y cabeceras separadas (J33) |
| A12 | Sin movimiento, el texto quedaba sobre el menú mientras el velo fundía: ahora funde toda la capa | 2.º pase |
| A15 | El chop elegido solo cambiaba de fondo: ahora lleva borde blanco (`Highlight` en contraste alto), y su play, `aria-pressed` | 2.º pase |
| A17 · A24 | La fecha del próximo drop desaparecía en el móvil táctil y a 360 × 640 | 3.er pase |
| A25 | Espacio no saltaba la revelación | Espacio salta, como Intro y Esc |

## Bajas abiertas

| # | Hallazgo | Motivo |
|---|---|---|
| J14 (en parte) | Nada indica que la tabla del calendario se desplace en horizontal a 390 | El admin es una pantalla de una sola persona y de escritorio. La región ya es enfocable, tiene nombre y se desplaza con el teclado. Propuesta: revisar la señal visual con el panel de moderación de la Fase 10 |
| J15 | Las filas con «Quitar» son más altas que las de hueco, y las de hueco no ofrecen «Programar» | Ritmo de una tabla interna, sin efecto en el juego. El formulario de programar está justo debajo |
| J16 · M9 | La placa del HUD de la ficha dice «ESCENARIO · SEMANA», sin el número, mientras la cabeza de móvil dice «SEMANA 1 · ESCENARIO» | La placa sale del `handle` de la ruta, que es estático. Para poner el número hay que llevarle los datos del loader. Propuesta: revisarla en la Fase 4, que vuelve a tocar la ficha con la subida |
| J19 | «0 EN LIZA» en móvil y «0 en la batalla» en escritorio | En móvil, la forma corta hace falta para que quepa la fila de chips (J31) |
| J25 | En la cabeza de móvil de la ficha, el título largo va en 3–4 líneas y el tiempo baja a su propia línea | La ficha se desplaza en móvil por diseño, y el título entero es el dato. Con títulos normales, 1–2 líneas |
| J35 | En móvil, el título largo de la tarjeta baja a ~16 px y se lee como texto corrido | Lo acepta la propia lente como compromiso de encaje con 49 caracteres: lo primero es que quepan las seis placas a 390 × 844 |
| J36 | A 390, la columna del ▶ del editor de chops toca el borde derecho del panel | Detalle de una pantalla interna que no tapa nada. Propuesta: revisarlo con el panel de moderación de la Fase 10 |
| M7 | En móvil, el `Modal` común de la F0 tapa la barra con la firma | Es el `Modal` de la F0, compartido por toda la web. Se revisa con el `Modal` en la Fase 10 |
| A14 | La onda de la ficha funciona como deslizador, pero en reposo está a 1,74:1 (1.4.11) | Lo compensan el rojo de lo reproducido y el texto del tiempo. Es el token `--bb-wave-idle` de la F0: cambiarlo afecta a todas las ondas |
| A18 | En `/alerta`, con `autoFocus` en «Confirmar mi alerta», el lector salta el resumen | La página tiene una sola acción y el resumen va en el título. Propuesta: se revisa con la tanda de accesibilidad de la Fase 10 |
| A19 | En `/alerta` se ven dos anillos a la vez: el del botón principal y el de reposo de «Volver al menú» | Es el estilo de reposo del botón secundario de la F0. Propuesta: se revisa con los botones en la Fase 10 |
| A20 (en parte) | Faltan capturas de: el foco del deslizador y de las tablas, el zoom al 200 y al 400 % y el modal de las bases en contraste alto | La revelación en contraste alto ya está (`revelacion-contraste-1440`). Propuesta: el resto queda para la auditoría de la Fase 10 |
| A28 | En escritorio, cada tabla del admin añade una parada de Tab aunque no desborde | Se acepta así: el contenedor enfocable es lo que permite desplazar la tabla con el teclado cuando desborda |
| A29 | En la revelación a 390, el anillo de «Saltar» tapaba la esquina del chip de la tonalidad | Es el mismo problema que J32, que la lente de juego dio por cerrado en el 4.º pase. La de accesibilidad no lo ha vuelto a mirar |
| A30 | Los «typos» de los chops iban por chop y no por campo, y `replace` reescribía todos los borradores | Después del 3.er pase, los «typos» van por campo (`${index}-start` y `${index}-end`). La lente no lo ha vuelto a mirar |
| A31 | «Revisa los chops 1» con un solo chop | Corregido después del 3.er pase, con las formas `invalidList_one` e `invalidList_other`. La lente no lo ha vuelto a mirar |
| A32 | El aviso de guardar repetía la regla genérica | Después del 3.er pase, el aviso dice «el motivo está bajo su fila». La lente no lo ha vuelto a mirar |

## Excepción: J1, el menú a 1024 × 768 (PENDIENTE DE CONFORMIDAD DEL USUARIO)

**Qué pasa** (`menu-1024`):
- A 1024 × 768 el menú principal no cabe sin desplazar: la tarjeta de la semana y el panel de ayuda acaban
  bajo la línea discontinua de la barra.
- La barra se despega: solo se ve la firma, y quedan fuera de la primera vista las teclas, «Inserta tu beat · Crédito» y la pausa.
- Con datos reales (chips largos, título largo) la tarjeta crece todavía más que con los de la maqueta.

**Por qué es una excepción:**
- El desborde viene de la composición intermedia de la Fase 0. A 1024 × 768, la barra con la crónica en su fila
  y las teclas en otra mide más que la de la maqueta.
- Esta fase no lo ha empeorado. Con el título largo, la tarjeta acaba donde con el corto.
- Se probaron arreglos en esta fase y se revirtieron: rompían otras composiciones que ya estaban verificadas.
- Arreglarlo es rehacer la composición de 721–1199 px para la ventana baja, con sus E2E de encaje. No cabe en esta fase.

**Propuesta:** dejar J1 como alta abierta, con una tarea propia: «encaje del menú a 1024 × 768 con datos reales»,
con 1024 × 768 y `/dev/menu?largo` en los E2E de encaje del menú.

**Estado:** la lente de juego da el ✅ **solo con esta excepción aceptada**. Falta la conformidad del usuario.
Hasta que llegue, la lente de juego queda ❌ por J1 y la tarea 3.21 no se puede cerrar.

## Capturas

| Fichero | Qué enseña |
|---|---|
| `menu-1440`, `menu-1024`, `menu-390` | Menú con la semana real (título largo y «Fa sostenido menor») |
| `menu-largo-1440`, `menu-largo-1280` | `/dev/menu?largo`: la tarjeta acaba sobre la barra (J38) |
| `menu-cargando-1440`, `menu-cargando-390` | Mientras llega la semana (J39 y J40) |
| `vacio-1440`, `vacio-390` | Calendario vacío con el formulario compacto |
| `titulo-1440` | Pantalla de título con el título largo |
| `ficha-1440`, `ficha-390` | Ficha del drop |
| `bases-1440`, `bases-390` | Modal de las bases |
| `revelacion-tira-1440` | La revelación a 500, 1300, 2300, 3000, 3600, 4400 y 5500 ms (J37) |
| `revelacion-1024`, `revelacion-390`, `revelacion-sin-movimiento-1440` | Revelación a 3,3 s y sin movimiento |
| `alerta-390`, `como-funciona-1440` | La alerta sin cuenta |
| `admin-1440`, `admin-chops-invalido-1440` | Calendario y editor de chops con un chop inválido |
| `menu-contraste-1440`, `ficha-contraste-1440`, `revelacion-contraste-1440` | Contraste alto |

Las capturas anteriores de cada pantalla están en `../home`, `../ficha`, `../revelacion` y `../admin`. Las de los emails, en `../emails`.

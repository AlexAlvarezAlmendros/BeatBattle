# Acta del jurado visual de la Fase 2 (tarea 2.25)

> **Fecha:** 2026-10-09 · **Rama:** `feat/2.24-e2e-hito` · **Guía:** v0.6.37 → **v0.6.38** ·
> **Requisito:** `RD-VIS-02` (e) sobre las pantallas nuevas de la fase: autenticación (entrar, registro,
> verificar, recuperar), bienvenida, perfil público, Ajustes (Cuenta, Perfil, Emails, Sesiones, Privacidad),
> la baja de emails y la galería de emails.
>
> **Resultado:** marca ✅, juego ✅ y accesibilidad ✅ al tercer pase. Todas las altas y medias están
> corregidas y verificadas. Las bajas que quedan abiertas tienen su motivo.

## Cómo se juzgó

- **Jurado:** tres jurados independientes, uno por lente: marca, juego y accesibilidad.
- **Primer pase:** 64 capturas de las 12 pantallas en los tamaños reales (1440 × 900, 1366 × 657,
  1024 × 768, 390 × 844 táctil y 320 × 568 táctil), más contraste alto y sin movimiento. Se hicieron con
  la API en modo test y el buzón en memoria.
- **Pases siguientes:** el segundo y el tercero comprobaron los arreglos con capturas nuevas.
- **Casos añadidos en el tercer pase:**
  - una cuenta con un nombre de 19 caracteres («Productora.Nocturna»);
  - capturas de ventana con la página desplazada, para ver el `sticky`.
- **Galería de emails:** se volvió a capturar después del cambio de la cabecera.

Las capturas de esta carpeta son las del último pase. `antes-*` son del primero, para comparar.

## Veredictos

| Lente | 1.er pase | 2.º pase | 3.er pase |
|---|---|---|---|
| **Marca** (paleta, firma, «Lo que nunca se imita», granate, §1.3) | ✅ 0 · 4 · 6 | ❌ (la ranura cortaba la pegatina OTP) | ✅ tras el ancho del emblema |
| **Juego** (maquetas, menú de recreativa) | ❌ 3 · 8 · 6 | ❌ (registro y baja a 1024) | ✅ tras la cabeza de móvil con el nombre largo |
| **Accesibilidad** (WCAG 2.2 AA, `RD-VIS-05`, teclado) | ❌ 2 · 4 · 6 | ✅ | ✅ |

Las cifras son hallazgos altos · medios · bajos.

**Granate en el último pase** (criterio del acta de la Fase 0, sobre la primera ventana; techo 24,5 % a 1440):

| Pantalla | Granate a 1440 |
|---|---|
| Ajustes → Cuenta | 16,1 % |
| Ajustes → Emails | 16,5 % (21,9 % a 1024) |
| Ajustes → Sesiones | 16,7 % |
| Ajustes → Privacidad | 16,3 % |
| Ajustes → Perfil | 21,7 % |
| Perfil público | 24,2 % |
| Bienvenida | 1,5 % |
| Baja | 0,6 % |

Antes del arreglo del emblema, Perfil daba 28,7 %.

## Hallazgos y lo que se hizo

| # | Hallazgo (lente · gravedad) | Qué se hizo | Verificación |
|---|---|---|---|
| 1 | Botones que no partían de línea y se salían de su marco a 320, 390 y 1024: Google/Discord, «Cambiar contraseña», «Descargar mis datos» (juego y accesibilidad · alta) | `Button`: en móvil, y a todo lo ancho en cualquier ventana, la etiqueta parte en dos líneas dentro del marco. Al `fieldset` de los botones sociales se le quitan la caja y el ancho mínimo | E2E nuevo `reflow.spec.ts` a 320 y 390 (entrar, registro, recuperar y las cinco secciones de Ajustes con sesión); `registro-320x568-tactil`, `registro-1024x768` |
| 2 | La fila «campo + Ver» era más ancha que el panel (accesibilidad · alta) | `.field` con una columna que encoge e `.input` con `width: 0` | `reflow.spec.ts`; `ajustes-cuenta-320x568-tactil` |
| 3 | En los paneles largos, el emblema de Opciones quedaba fuera de la vista: centrado contra el panel y con un 28,7 % de granate en Perfil (juego · alta, marca · media) | `ScreenPage` con `pieceAlign="start"`: la pieza va arriba, alineada con el panel, y en `sticky`. En móvil no hay emblema (la cabeza ya nombra la sección). El título se ajusta a una línea (`useFitText`) en una rejilla que no crece | `desplazada-ajustes-perfil-1440x900`, `ajustes-privacidad-1440x900` (400 px, como el resto); granate en rango |
| 4 | Con un nombre de 19–20 caracteres, la carta lo partía a mitad de palabra y aplastaba el retrato (juego · alta, marca · baja) | Nombre de la carta, del panel del perfil, de la cabeza de móvil (`titleMinFontPx`) y del HUD ajustado a una línea con `useFitText`, en rejillas `minmax(0, 1fr)`. Retrato con alto mínimo | `nombre-largo-perfil-1440`, `nombre-largo-perfil-320`, `nombre-largo-bienvenida-390` |
| 5 | La baja a 1024 se quedaba con un panel de 320 px al ponerle el logo (juego · alta, 2.º pase) | Diseño de título: el panel no baja de 26 rem y en ventanas medianas cede el logo | `baja-1024x768`, `registro-1024x768`, `recuperar-1024x768` |
| 6 | La baja tenía rayos sin ninguna pieza delante y no llevaba logo (marca y juego · media) | Logo con su lockup como pieza (`TitlePiece`, ahora común con la autenticación) | `baja-1440x900` |
| 7 | Emails sin la cuña granate de §3.8.12 y con la pegatina suelta (marca · media y baja) | Cabecera en una sola imagen (`header@2x.png`, `email-images.mjs`, colores de los tokens): cuña, diagonal roja y blanca, y logo con la pegatina en lockup | `../emails/*.png` |
| 8 | Foto del HUD desplazada, tapando el borde y sin trama (marca · media) | `[data-duotone]` común (grises, rojo multiplicado y trama de puntos de las piezas), recortado con el chaflán interior del marco; en el HUD, la carta y Ajustes | Código (`ui/Duotone/duotone.css`); la foto real se comprobó en la 2.19 |
| 9 | Estados vacíos del perfil «en obras» (juego · media) | Posiciones: la rejilla vacía con su eje 1.º/8.º/15.º. Logros: 12 huecos en silueta «???» (4 por fila en móvil), en la columna ancha bajo el historial (así la página cabe a 1440 × 900 y «Volver al menú» no queda medio tapado por la barra, que axe marcaba) | `p-kairo.wav-1440x900`, `-390x844-tactil` |
| 10 | Estadísticas de la carta descuadradas, pie partido, sello sin «NV» (juego · media) | Tres columnas iguales con filete, cifra centrada y rótulo debajo; pie en una línea; «NV» en el sello | Todas las cartas |
| 11 | «MEJOR PUESTO» pisaba el borde de su tesela a 1366 y 1440 (juego · media) | Seis teselas por fila solo desde 1600 px | `p-kairo.wav-1440x900` |
| 12 | Bienvenida con dos botones al menú; la ranura recortaba la carta y la pegatina, y la carta salía descentrada en móvil (juego · media, marca · media) | Sin «Volver al menú». La ranura recorta solo por debajo de su filete y va centrada | `bienvenida-1440x900`, `bienvenida-390x844-tactil` |
| 13 | Avisos como una nube de chips rojos: nueve rellenos a la vez se leían como nueve cursores (juego · media, marca · baja) | `FilterChip variant="plate"`: placa a todo el ancho con «SÍ \| NO» a la derecha; encendida, solo la casilla «SÍ» va en rojo. Dos columnas en Ajustes desde 1100 px y una en el registro. «Cerrar las demás sesiones», también en placa | `ajustes-emails-1440x900`, `registro-320x568-tactil` |
| 14 | Ajustes → Perfil se veía como un formulario web: rótulo repetido, enlaces en una columna, acciones sueltas y un emblema genérico (juego · media) | La pieza es la carta en vista previa. El grupo se llama «Nombre». Enlaces en dos columnas. «Guardar» y «Ver mi perfil» en una fila | `ajustes-perfil-1440x900` frente a `antes-ajustes-perfil-1440x900` |
| 15 | Errores de validación local sin mover el foco (accesibilidad · media) | `focusFirstInvalid` en entrar, registro, recuperar, Cuenta y Privacidad | Tests de `PrivacySettings` |
| 16 | Botones deshabilitados sin motivo, e Intro sin efecto en el campo de confirmación (accesibilidad · media); deshabilitado en rojo apagado (marca · baja) | Borrar la cuenta va siempre activo, con el error en el campo y un aviso de papel «no se puede deshacer». «Cambiar nombre» lleva `disabledReason`. El deshabilitado es neutro en todas las variantes | `ajustes-privacidad-1440x900`, `ajustes-perfil-1440x900` |
| 17 | Foco perdido tras la acción, y `Done` montado ya lleno en una región viva (accesibilidad · media) | `Done` recibe el foco al aparecer; la baja enfoca su mensaje, sin región viva | Tests de `PrivacySettings` y `UnsubscribePage`; E2E del hito |
| 18 | Ayudas de grupo sin asociar, «se abre en otra pestaña» sin decir, «SÍ» de las placas sin `Highlight` en contraste alto, eje de la gráfica bajo la rejilla, «???» a 4,27:1 (accesibilidad · baja) | `aria-describedby` en los `fieldset` (también en el registro); texto `sr-only`; regla de `forced-colors`; eje sobre el panel; «???» en `--bb-text-3` | `*-contraste.png`, `p-kairo.wav-*` |

## Bajas que quedan abiertas, con su motivo

- **Pestañas de Opciones en móvil, en varias líneas.** §3.3 «Pestañas en móvil» lo decidió así en la 0.28,
  para no esconder secciones.
- **La barra de controles pasa a dos filas a 1024.** Es del marco y no ha cambiado en esta fase.
- **«Volver al menú» en cada panel**, en escritorio. Lo pide §3.8.14. `05-perfil` no lo lleva, pero
  ninguna pantalla lo ha quitado todavía.
- **El primer logro de la bienvenida sin medalla en silueta.** Las medallas llegan con la capa de juego
  (Fase 7).
- **La carta del perfil público, centrada en vertical** (a 1024 × 768 empieza bajo el pliegue). Es una
  pantalla de contenido y no se toca hasta la carta 3D (Fase 7).
- **La ayuda de la baja en una región viva**, que se anuncia en cada ↑/↓. Es aceptable y queda para la
  revisión de accesibilidad de la Fase 10.
- **«Todo lo no esencial» parte en dos líneas a 1024 y «Solo estos» no.** Es la etiqueta del `MenuPlate`,
  que ya se ajusta con su propia regla.
- **El emblema mantiene su alto aunque su contenido vaya arriba.** Es el presupuesto de granate de
  §3.8.14: sin él, la cuña de Privacidad llegaba al 24,8 %.

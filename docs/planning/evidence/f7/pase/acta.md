# Tarea 7.23 · El pase de torneo: acta del jurado y banco

2026-11-03 · rama `feat/7.23-pase-de-torneo` · guía v0.6.140 · datos de `seedBattle.ts … season` (`/p/prod01`, campeona;
`/p/prod02`, holo) · Chrome del sistema con la GPU real (ANGLE sobre Vulkan, AMD Radeon RENOIR) · `tools/shot/pase-f7.mjs`.

**Decisión abierta «Pase de la carta»** (ROADMAP): se ha hecho el valor por defecto, la cinta propia con física. La
cierra el usuario mirando estas capturas; la alternativa es un expositor giratorio.

## Capturas

| Para decidir | Fichero |
|---|---|
| La carta colgada, en reposo (campeona) | `pase-1440x900-reposo.png` |
| Arrastrada con el ratón (sujeta, sin soltar) | `pase-1440x900-arrastre.png` |
| Holo en reposo | `pase-1440x900-holo.png` |
| El detalle del pase a 2× (remache, cinta, pinza) | `pase-detalle-2x.png` |
| Girada con C (reverso con el QR) | `pase-1440x900-reverso.png` |
| La 3D y la plana en el mismo hueco (el relevo, a 2×) | `pase-relevo-3d-y-plana-2x.png` |
| Plana: calidad apagada · «reducir movimiento» · sin WebGL · contraste alto · modo serio | `pase-1440x900-plana-*.png` |
| Foco en la pieza («Girar carta», con la carta 3D encima de la plana) | `pase-1440x900-foco.png` |
| Móvil 390 × 844 táctil: lo que sale (plana) | `pase-390x844-tactil-plana.png` |
| Móvil con `bb:pass` = `on`: cómo quedaría colgada y arrastrada con el dedo | `pase-390x844-tactil-forzado-*.png` |

## Jurado de tres lentes (`RD-VIS-02`)

- **Marca.** Solo la paleta: cinta roja con el filete granate y «OTP.» en blanco; metal en grises de blanco a negro;
  sombra dura negra. La firma, en la cinta, en el pie de la carta y en la barra de controles. **No se lee como el
  `Lanyard` del sello** (`ReactOtpWeb`, `components/Lanyard`, el de ReactBits que usa `/contacto`; mirado en su código,
  porque en la captura sin ventana no se monta): aquel es una sola tira
  (`meshline`) que baja desde fuera de la pantalla por cuatro cuerpos con cuerda y una rótula esférica, con la carta y
  su mosquetón de un GLB en material físico con *clearcoat* y un entorno de *Lightformers*; la carta gira en 3D. El
  pase es corto y vive dentro de la columna de la pieza: un remache hexagonal, la cinta en Λ (dos tramos de la misma
  cinta), una pinza ancha con chaflanes que muerde el canto de la carta, todo plano y sin luces; la física es un
  péndulo de cadena en el plano y la carta cuelga a −3° por el ojal descentrado. Aun así, «una carta colgada de una
  cinta» es la idea del sello: por eso la decisión sigue abierta.
- **Juego.** La carta es la de la 7.22 y la tarjeta para *stories* (un solo modelo y un solo pintor, `cardCanvas`); se
  agarra y se suelta como una pieza física, C la gira con su muelle, y en reposo no pide fotogramas. El relevo con la
  plana no salta (mismo hueco, ancho y giro): las diferencias son las del lienzo por CPU frente al HTML (la lámina y el
  monograma), las mismas de las *stories*.
- **Accesibilidad.** La plana sigue en el árbol accesible, transparente bajo la 3D; el foco y C funcionan igual (la
  vista del pase es `aria-hidden`). Sin WebGL, con «reducir movimiento», con la calidad apagada o baja, en modo serio,
  en contraste alto y en una columna, la carta plana, sin hueco del pase y sin pedir su trozo (E2E `pass.spec.ts`).
  **En el móvil**, la carta es plana: con el pase, la diagonal de la arena (que va por encima del lienzo) cruza la
  carta (`pase-390x844-tactil-forzado-reposo.png`) y la carta a todo el ancho le quitaría a la página el desplazamiento
  con el dedo. Si se quiere el pase en el móvil, hace falta otra composición del perfil en una columna.

## Banco (`RNF-PERF-03`, `tools/shot/bench.mjs`)

Build de producción (`vite preview`), 1440 × 900, calidad alta, 10 s; la carta girándose con C cada 250 ms (anima
sin parar: giro, vaivén y cinta), después de un primer giro de calentamiento. Carga de la máquina, 1,1–1,4 (la holo, repetida a 5,0 → 2,8: lo mismo).

| Caso | fps | p99 | peor | llamadas de dibujo |
|---|---|---|---|---|
| dpr 1, `/p/prod01` (campeona) | 60 | 16,8 ms | 16,8 ms | 18,5 de media, 38 como mucho |
| dpr 2, `/p/prod01` | 60 | 16,8 ms | 16,8 ms | 18,6 de media, 38 como mucho |
| dpr 2, `/p/prod02` (holo, con su lámina) | 60 | 16,8 ms | 16,8 ms | 18,5 de media, 38 como mucho |
| Quieta (dpr 1) | 60 | 16,8 ms | 16,8 ms | 0 (no pinta) |
| Servidor de desarrollo, el Escenario pintando | 58,3 fps del Escenario | — | 16,8 ms | — |

**El primer giro** tropieza una vez (cuatro tareas largas de 50–74 ms): la carta plana monta su QR y la página tarda
~60 ms en cada maquetación (la fuerzan las medidas de la vista anclada, `getBoundingClientRect`). Sin el pase pasa lo
mismo (dos tareas de ~60 ms con la calidad apagada): es de la maquetación del perfil, no del pintor (anverso por capas
3 ms, reverso 9 ms a 640 px). Queda para la 7.34.

## Trozos (`vite build`, §4.17)

| Trozo | gzip | Presupuesto |
|---|---|---|
| Escenario | 253,45 kB (252,56 sin la 7.23) | < 250 kB: **ya se pasaba sin la 7.23**; la 7.23 suma 0,9 kB (el `lazy` del pase y `suspend` de `suspend-react`, que R3F y Rapier comparten) |
| Pase (`PassView`, con Rapier y su WASM) | 856,4 kB (Rapier, 2,2 MB sin comprimir; `@react-three/rapier`, 22 kB; el pase, 17 kB) | sin presupuesto propio: solo en el perfil a dos columnas, después de la primera pintura (`RNF-PERF-04`, E2E) |
| `cardCanvas` (el pintor, compartido con las *stories*) | 4,1 kB | — |

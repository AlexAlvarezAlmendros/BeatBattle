# Plan 06 — Cierre, resultados y ceremonia

> Fase: 6 de 10 | Estado: 🔄 En curso | Iniciado: 2026-10-13 | Cerrado: —
> Hito del roadmap: una semana simulada se sella, la ceremonia se reproduce, re-sellar da el mismo snapshot y
> sale el Lunes de batalla.

Deja resuelto **el final de cada semana**: la clasificación con la media bayesiana y sus desempates, el
sellado determinista que la congela (y el re-sellado explícito que la corrige), la página de resultados con el
podio, la ceremonia de revelación, el archivo y el **Lunes de batalla** por email; y además que todo lo que se
comparte (metadatos, imágenes OG, sitemap) tenga la cara del juego sin romper el voto ciego. Con esta fase se
completa el MVP (F0–F6) para la beta cerrada.

**Riesgos principales:**

- **Determinismo del sellado** (`RF-RES-02`, `RF-RES-04`). La clasificación tiene que ser una función pura,
  total y estable de los votos válidos: el mismo conjunto en cualquier orden da el mismo snapshot, y re-sellar
  sin cambios da lo mismo. Se prueba con propiedades (fast-check) en `packages/rules`.
- **La revelación** (`RF-RES-07`, `RF-SHARE-04`). Antes del sellado nada de autoría ni cifras; en el instante
  del sellado, todo a la vez y en todas partes (API, imágenes OG, metadatos, emails). Una caché que sirva una
  imagen de antes o de después a destiempo es una fuga.
- **El Lunes de batalla** (`RF-NOTIF-07`). Une el resultado de la semana que acaba y el drop de la que empieza
  en un solo email, con la espera de hasta 2 h al sellado. Es el email más grande y el que más gente recibe.
- **La ceremonia** (§3.8.6). Coreografía de ~25 s sincronizada con el audio del momento más enérgico de cada
  beat, saltable, repetible y con su variante sin movimiento. La pieza más «de juego» del MVP.

---

## Decisiones de partida

- **Sin dorado** (decisión del usuario, 2026-10-13). Las medallas del podio y la semana dorada van en la paleta
  del sello (§3.2 «Medallas», §3.4.3): oro rojo con corona negra, platino blanco, diamante granate.
- **XP, oído de oro y temporada, en la Fase 7** (§2.10, §2.9). La página de resultados y «Tu resultado» llevan
  posición, puntuación, votos y puntos de temporada (se guardan en `result` al sellar, con `seasonPoints`, que
  ya existe); el reparto de XP, el oído de oro, el campeón de temporada (`RF-ARC-05`) y el salón de la fama
  (`RF-ARC-02`) llegan con la capa de juego. Como en las fases anteriores, `xp_event` es idempotente y la F7
  puede repartir el XP de las semanas ya selladas.
- **La Elección del sello, en la Fase 9** (`RF-OTP-04`, §2.16). La página de resultados reserva su sitio, pero
  marcarla es del panel de la integración con el sello.
- **Descalificar, lo mínimo para re-sellar** (`RF-RES-06`). La moderación completa (cola, motivos por email,
  anulación de votos) es de la Fase 10 (`RF-MOD-*`). Aquí entra la acción de admin de descalificar una entrada
  con su motivo y su auditoría, que es lo que obliga a re-sellar.
- **Despliegue, en la Fase 10.** `api/share` y `api/og` se escriben y prueban en local contra la build; su
  primera salida a Vercel es la del lanzamiento (§4.15). Nada de esta fase crea recursos en la nube.
- **Imágenes con satori y resvg** (§4.1, ya en el stack): las OG y la tarjeta de resultado del email se pintan
  en servidor con la tipografía y la paleta del juego.

## Dependencia con otras fases

- **Requiere:**
  - de la Fase 5: votos con su recibo, `ip_signal`, el contrato de voto ciego, la ficha y el reproductor global;
  - de la Fase 4: entradas medidas con su momento más enérgico (`hot_start_ms`) y la portada generativa;
  - de la Fase 3: fronteras de la semana, sellado perezoso con *lease* (sin clasificación) y `battle.drop`;
  - de la Fase 2: cuentas, bloqueo (`admin`), cola de email con prioridades, tope semanal y preferencias
    (formato del lunes: combinado o separado).
- **Habilita:** la beta cerrada (MVP = F0–F6) y, tras ella, las Fases 7, 9 y 10.

## Cobertura de la especificación

| Id | Tarea(s) | Verificación |
|----|----------|--------------|
| `RF-RES-01` | 6.1 | Anexo G: A 3,8333, B 4,4000, C 4,0000 con `m = 3,6` y `C = 5` |
| `RF-RES-02` | 6.1 | propiedades: la clasificación es pura, total y estable; ex aequo 1, 1, 3 |
| `RF-RES-03` | 6.1, 6.4 | una entrada con 2 votos de 5 no entra en el podio |
| `RF-RES-04` | 6.1, 6.4 | barajar los votos no cambia el snapshot (fast-check y servidor) |
| `RF-RES-05` | 6.4 | bloquear a un votante antes del sellado elimina su efecto; anulados y retiradas fuera |
| `RF-RES-06` | 6.5, 6.15 | descalificar tras sellar y re-sellar → revisión 2, auditoría y aviso visible |
| `RF-RES-07` | 6.6 | tras el sellado, la API pública devuelve el productor de cada entrada |
| `RF-RES-08` | 6.15, 6.21 | E2E con la semana sellada: podio, tabla, «Tu resultado» (el XP, en la F7) |
| `RF-RES-09` | 6.8, 6.17, 6.19 | ofrecida una vez por usuario y semana, Esc la salta, «Ver la ceremonia» la repite |
| `RF-RES-10` | 6.4, 6.15 | semana sin entradas: snapshot vacío y «Semana desierta» |
| `RF-PLAY-08` | 6.16 | ficha de una semana sellada con posición, puntuación, votos e histograma |
| `RF-ARC-01` | 6.7, 6.18 | con 60 semanas, la página 2 empieza en la 21.ª más reciente |
| `RF-NOTIF-07` | 6.9 | reloj simulado: combinado, separado y la espera de 2 h (con y sin sellado a tiempo) |
| `RF-NOTIF-14` | 6.10 | la tarjeta de resultado sin firma → 403 (la cuenta atrás, hecha en la F3) |
| `RF-NOTIF-13` | 6.9 | ningún email del lunes revela datos de la semana que empieza ni de una sin sellar |
| `RF-SHARE-01` | 6.12 | metadatos OG y Twitter en `/e/:id`, `/semana/:slug`, `/resultados` y `/p/:username` |
| `RF-SHARE-02` | 6.11 | la segunda petición sale de la caché (`Cache-Control` inmutable por versión) |
| `RF-SHARE-03` | 6.14 | descarga de un PNG de 1080 × 1920 |
| `RF-SHARE-04` | 6.11, 6.12 | la imagen OG y los metadatos de una entrada sin sellar no llevan al productor |
| `RF-SHARE-05` | 6.13 | `sitemap.xml` y JSON-LD (`MusicRecording`, `Event`) validados |
| `RF-ARC-02..05` | — | **Fase 7** (salón de la fama y temporadas) |
| `RF-OTP-04` | — | **Fase 9** (Elección del sello) |
| `RD-VIS-02` | 6.22 | jurado visual de tres lentes |

---

## Tareas

### Reglas

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 6.1 | `packages/rules`: `rank(entradas, votos)` con la bayesiana de la semana, desempates (votos → mediana → cincos), ex aequo, podio con ≥ 3 votos, «sin clasificar» al final por orden de subida y los puntos de temporada de cada posición | ✅ Hecho | — | §2.8, §4.5, Anexo G · `RF-RES-01..04` · propiedades con fast-check · **Hecho:** `ranking.ts` con 6 tests en `test/ranking.test.ts` (el caso del Anexo G exacto, podio con ≥ 3 votos, desempates y ex aequo 1, 1, 3, sin clasificar por orden de subida, propiedades de pureza, totalidad y estabilidad, semana sin votos). Guía v0.6.72 |

### Servidor

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 6.2 | Tabla `result` y su migración; esquemas Zod de resultados, archivo y ficha sellada en `@beatbattle/shared` | ✅ Hecho | — | §4.11 · Hecho: tabla y migración `0007_resultados`; esquemas `results.ts`. |
| 6.3 | Acción de admin: descalificar una entrada con motivo y auditoría (`POST /api/admin/entries/:id/disqualify`) | ✅ Hecho | 6.2 | §2.13, §2.14 · lo mínimo para `RF-RES-06`; la moderación completa, en la F10 · Hecho: 204 con auditoría `entry.disqualify`; 403 sin admin (test). |
| 6.4 | El sellado clasifica: votos válidos (sin bloqueados, anulados ni de entradas retiradas o descalificadas), `rank` y snapshot en `result` con la revisión 1, en el mismo paso perezoso e idempotente con *lease*; semana desierta | ✅ Hecho | 6.1, 6.2 | §2.8, §4.12 · `RF-RES-03..05`, `RF-RES-10` · test de concurrencia (dos sellados a la vez) · Hecho: `snapshotStatements` en el `batch` del sellado; tests de válidos, concurrencia y semana desierta. |
| 6.5 | Re-sellado explícito (`POST /api/admin/weeks/:slug/reseal`): revisión nueva, auditoría y aviso público | ✅ Hecho | 6.3, 6.4 | §2.8 · `RF-RES-06` · Hecho: revisión nueva condicionada, auditoría `week.reseal`, `correctedAt`; sin cambios, las mismas filas. |
| 6.6 | `GET /api/weeks/:slug/results` (404 sin sellar), con «tu resultado» y el aviso de corrección; la ficha y la lista de una semana sellada, con su posición, puntuación, votos e histograma | ✅ Hecho | 6.4 | §2.8, §4.10 · `RF-RES-07`, `RF-PLAY-08` · contrato: sin sellar, nada · Hecho: 404 sin sellar; `result` en la ficha y la lista; `mine`. |
| 6.7 | `GET /api/weeks?cursor=`: el archivo de semanas selladas, paginado, con su sample, número de entradas y podio | ✅ Hecho | 6.4 | §2.9 · `RF-ARC-01` · Hecho: 20 por página, cursor `startsAt`; test con 60 semanas. |
| 6.8 | La ceremonia vista: `seen_flag` `ceremony` por usuario y semana (`POST /api/me/seen`) y la semana sellada sin ver en `GET /api/weeks/current` | ✅ Hecho | 6.4 | §2.8 · `RF-RES-09` · Hecho: `seen_flag` `ceremony` y `current.sealed.ceremonySeen`. |

### Emails

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 6.9 | **Lunes de batalla**: `battle.monday` (resultado personal o podio + el drop con su cuenta atrás) por defecto y `battle.results` y `battle.drop` por separado si se elige; espera de hasta 2 h al sellado; prioridad de envío; contrato de voto ciego y capturas | ✅ Hecho | 6.4, 6.10 | §2.12.2, §3.8.12, Anexo H · `RF-NOTIF-07`, `RF-NOTIF-13` · Hecho: `results/monday.ts` en el `tick`; plantillas `battle.monday` y `battle.results`; 4 tests con el reloj (combinado, separado, espera de 2 h, sellado tardío dentro de plazo), prioridad 10–13 y contrato de voto ciego; capturas en `evidence/f6/emails`. |
| 6.10 | Tarjeta de resultado personal: `GET /api/og/result/:slug/:userId?sig=` (satori y resvg), firmada; sin firma, 403 | ✅ Hecho | 6.4 | §4.19.5 · `RF-NOTIF-14` · Hecho: `media/resultCard.ts` y `results/cardRoute.ts`; test 403/404/200; capturas en `evidence/f6/tarjeta`. El despliegue con las fuentes (`includeFiles`), escrito, sin verificar hasta la F10. |

### Compartir y SEO

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 6.11 | Imágenes OG (`api/og`): semana, entrada, resultados y perfil, con la dirección de arte del juego, caché inmutable por versión y voto ciego | ✅ Hecho | 6.6 | §2.15, §4.15 · `RF-SHARE-02`, `RF-SHARE-04` · Hecho: en Fastify (`share/og.ts`, `media/ogImages.ts`, `media/svgCanvas.ts`); 4 tests; capturas en `evidence/f6/og`. |
| 6.12 | `api/share`: inyecta título, descripción, Open Graph, Twitter, canonical y JSON-LD en `index.html` para las rutas compartibles (y el 301 del nombre cambiado del perfil) | ✅ Hecho | 6.11 | §4.7.7 · `RF-SHARE-01`, `RF-SHARE-04` · Hecho: en Fastify (`share/routes.ts`, `share/meta.ts`) con reescrituras en `vercel.json`; 6 tests. El paso por Vercel (URL original, `includeFiles`), escrito, sin verificar hasta la F10. |
| 6.13 | `sitemap.xml` (semanas selladas y perfiles), `robots.txt` y datos estructurados (`MusicRecording`, `Event`) | ⬜ Listo | 6.12 | §2.15 · `RF-SHARE-05` |
| 6.14 | Tarjetas de stories (1080 × 1920) en el navegador: «Estoy en la batalla #N» y «He quedado N.º», con Web Share (ficheros) o descarga | ⬜ Listo | 6.15 | §2.15 · `RF-SHARE-03` |

### Cliente

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 6.15 | Página de resultados: placa «RESULTADOS OFICIALES», podio con escena (peanas, focos, medallas en la paleta, sello arrancado, alias tachado y productor), «TU RESULTADO», tabla con histogramas, aviso de re-sellado y semana desierta | ⬜ Listo | 6.6 | §3.8.6, §3.4.3 · `RF-RES-06`, `RF-RES-08`, `RF-RES-10` |
| 6.16 | La ficha de una semana sellada: posición, puntuación, votos e histograma de 5 barras, y el productor | ⬜ Listo | 6.6 | §2.6 · `RF-PLAY-08` |
| 6.17 | Ceremonia (~25 s): luces fuera, del 10.º al 4.º, 3.º–2.º–1.º con foco, medalla, sello arrancado y el momento más enérgico de cada beat sincronizado con el reloj de audio, «¡CAMPEÓN!», tu resultado; saltable con Esc, repetible, sin movimiento por fundidos y efectos `cer.*` | ⬜ Listo | 6.15 | §3.8.6, §3.6, Anexos D y E · `RF-RES-09` · destellos por `flash.request()` |
| 6.18 | Archivo `/semanas`: semanas selladas paginadas con su sample, entradas y podio, escuchables | ⬜ Listo | 6.7 | §2.9 · `RF-ARC-01` |
| 6.19 | La home ofrece la ceremonia la primera vez tras el sellado y el menú enlaza la última semana sellada | ⬜ Listo | 6.8, 6.17 | §2.8, §3.8.3 · `RF-RES-09` |

### Verificación y cierre

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 6.20 | Datos de prueba: una semana sellada con su clasificación (en `seedBattle` y en los fixtures de E2E) | ⬜ Listo | 6.4 | para la 6.21 y las capturas de la 6.22 |
| 6.21 | E2E del hito: una semana simulada se vota, se cierra y se sella; los resultados y la ceremonia (y saltarla); re-sellar sin cambios da el mismo snapshot y, tras descalificar, la revisión 2 con su aviso; sale el Lunes de batalla | ⬜ Listo | 6.9, 6.15, 6.17, 6.18, 6.19, 6.20 | §5 · hito |
| 6.22 | Jurado visual de tres lentes: resultados, ceremonia (fotogramas), archivo, ficha sellada, emails del lunes, imágenes OG y tarjetas de stories | ⬜ Listo | 6.21 | `RD-VIS-02` |
| 6.23 | Cierre de la fase: criterio de aceptación, cobertura de ids y CI en verde | ⬜ Listo | 6.22 | — |

---

## Entregable

Al cerrar una semana, su clasificación queda sellada e inmutable (o corregida con un re-sellado que se ve). La
página de resultados enseña el podio con la autoría revelada, la tabla completa y tu resultado; la ceremonia se
ofrece una vez y se puede repetir; el archivo guarda todas las semanas; el lunes llega un solo email con tu
resultado y el sample nuevo; y lo que se comparte enseña la cara del juego sin adelantar nada.

## Criterio de aceptación

1. Todos los ids de la tabla de cobertura verificados (salvo los aplazados con su fase).
2. E2E del hito en verde: sellado, resultados, ceremonia, re-sellado y Lunes de batalla.
3. Determinismo: el sellado es una función pura de los votos válidos (propiedades) y re-sellar sin cambios da
   el mismo snapshot (servidor).
4. Contrato de voto ciego: antes del sellado, ni la API, ni las imágenes OG, ni los metadatos, ni los emails
   revelan autoría ni cifras; después, la autoría sale en todos.
5. Jurado visual de tres lentes sin hallazgos altos ni medios abiertos.
6. `pnpm check`, `typecheck`, `test`, `build` y `e2e` en verde en la CI.

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-13 | 6.12 | Metadatos de las páginas compartibles en la app de Fastify, sin `api/share.ts` (guía v0.6.76). |
| 2026-10-13 | 6.11 | Imágenes OG en la app de Fastify, sin `api/og.tsx` (guía v0.6.75). Portadas por CPU con un contexto 2D que dibuja en SVG y mide con resvg: la calibración converge al 0,1 % de la referencia. |
| 2026-10-13 | 6.9, 6.10 | Lunes de batalla y tarjeta de resultado (guía v0.6.74). satori fijado en 0.33.5: la 0.34–0.56 salieron todas el mismo día. |
| 2026-10-13 | 6.2–6.8 | Servidor de resultados: snapshot al sellar, descalificar y re-sellar, `/results`, archivo y ceremonia vista; 9 tests en `results.test.ts` (guía v0.6.73). |
| 2026-10-13 | 6.1 | `rank` en `packages/rules` con propiedades (guía v0.6.72). |
| 2026-10-13 | — | Plan creado (23 tareas). Sin dorado (decisión del usuario). XP, oído de oro y temporadas, en la F7; Elección del sello, en la F9; moderación completa y despliegue, en la F10. |

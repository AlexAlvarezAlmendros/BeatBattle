import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  SpotLight,
} from 'three'

/**
 * El catálogo de piezas de three que el Escenario pinta como elementos de JSX (`<mesh>`, `<group>`…; guía §4.17, tarea
 * 7.34). El `Canvas` de React Three Fiber registra **el espacio de nombres entero** de three (`extend(THREE)`), y así
 * ningún empaquetador puede quitar nada: el trozo del Escenario se llevaba three casi entero (cargadores, curvas,
 * animación, ayudas…). `StageCanvas` registra solo esto y three se queda en lo que se usa (de 253,5 a 208,2 kB gz).
 *
 * Cada elemento en minúscula de las piezas del Escenario (y el `<group>` que pinta la `View` de drei) tiene que estar
 * aquí; `catalogue.test.ts` lo comprueba leyendo el código. `<primitive>` es de R3F y no hace falta.
 */
export const STAGE_CATALOGUE = {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  SpotLight,
}

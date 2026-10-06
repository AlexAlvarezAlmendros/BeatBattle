// Partículas del Escenario (guía §3.5 capa 2, tarea 1.3): chispas y confeti. Cada partícula sabe dónde nace,
// hacia dónde sale y cuánto vive; el movimiento es el de `particleAt()` (`stage/particles/model.ts`), así que
// la CPU solo escribe al nacer una ráfaga. En px CSS con el origen arriba a la izquierda, como el DOM.
precision highp float;

attribute vec3 position;   // Origen (px CSS); z sin uso.
attribute vec3 aMotion;    // Salida (dx, dy) y caída (px CSS).
attribute vec2 aTime;      // Nacimiento y vida (s).
attribute vec4 aLook;      // Color sRGB y opacidad autorizada (≤ 0,4, limitador de destellos).
attribute vec3 aShape;     // Lado (px CSS), tipo (0 chispa, 1 confeti) y vueltas por segundo.

uniform vec2 uSize;        // Lienzo en px CSS.
uniform float uScale;      // Píxeles del búfer por px CSS.
uniform float uTime;       // Reloj del Escenario (s).

varying vec4 vLook;
varying float vKind;
varying float vAngle;
varying float vFade;

void main() {
  float age = uTime - aTime.x;
  float t = age / max(aTime.y, 1e-3);
  if (aTime.y <= 0.0 || t < 0.0 || t > 1.0) {
    // Sin nacer o ya muerta: fuera del lienzo y sin tamaño.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float reach = 1.0 - pow(1.0 - t, 3.0);
  vec2 p = position.xy + aMotion.xy * reach + vec2(0.0, aMotion.z * t * t);
  gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
  // El confeti gira dentro de su punto: el punto mide la diagonal del cuadrado.
  gl_PointSize = aShape.x * uScale * (aShape.y > 0.5 ? 1.4142 : 1.0);
  vLook = aLook;
  vKind = aShape.y;
  vAngle = aShape.z * age * 6.2831853;
  vFade = aShape.y > 0.5 ? 1.0 - t * t * t : pow(1.0 - t, 1.5);
}

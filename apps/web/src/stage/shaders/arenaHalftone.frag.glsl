// Trama de la cuña de la arena (guía §3.5 capa 0, tarea 1.1). Es `halftoneReach()` y `wedgeSide()` de
// `stage/arenaMath.ts` (probados contra el generador estático `halftoneDots`): mismos puntos que la trama
// estática, recortados por la diagonal que el CSS pone y la arena mide. Sin colores literales: la tinta
// llega como uniforme desde los tokens.
precision highp float;

uniform vec2 uSize;        // Lienzo en px CSS (la ventana).
uniform vec2 uScale;       // Píxeles del búfer por px CSS (dpr del Escenario).
uniform float uCell;       // Celda de la rejilla (px CSS).
uniform float uAngle;      // Giro de la rejilla (radianes).
uniform float uMax;        // Radio máximo / celda.
uniform float uMin;        // Radio mínimo / celda.
uniform float uDotScale;   // Escala del tamaño de punto (1; la reactividad al audio, 1.6, la mueve ≤ 15 %).
uniform int uShape;        // 0 menuWedge · 1 menuWedgeMobile · 2 interiorWedge (`SHAPE_INDEX`).
uniform vec3 uInk;         // Tinta en sRGB (token `--bb-red`).
uniform vec2 uEdgeA;       // Diagonal: dos puntos (px CSS, y hacia abajo)…
uniform vec2 uEdgeB;
uniform vec2 uInside;      // … y uno dentro de la cuña.

const float MIN_VISIBLE_RADIUS = 0.35;

float shapeAt(vec2 uv) {
  float u = uv.x;
  float v = uv.y;
  if (uShape == 0) {
    return pow(max(0.0, u * 1.05 + v * 0.45 - 0.95) / 0.55, 1.3) * (1.0 - clamp((v - 0.78) / 0.14, 0.0, 1.0));
  }
  if (uShape == 1) {
    return pow(max(0.0, v * 1.2 + u * 0.25 - 0.95) / 0.5, 1.3);
  }
  return pow(max(0.0, (1.0 - u) * 0.9 + v * 0.55 - 0.95) / 0.5, 1.3);
}

float halftoneReach(vec2 p) {
  float c = cos(uAngle);
  float s = sin(uAngle);
  vec2 center = uSize * 0.5;
  float reach = length(uSize) * 0.5 + uCell;
  vec2 d = p - center;
  vec2 q = vec2(d.x * c + d.y * s, -d.x * s + d.y * c);
  vec2 k0 = floor((q + reach) / uCell + 0.5);
  float best = -1e6;
  for (int dk = -1; dk <= 1; dk++) {
    for (int dl = -1; dl <= 1; dl++) {
      vec2 g = -reach + (k0 + vec2(float(dk), float(dl))) * uCell;
      vec2 pt = center + vec2(g.x * c - g.y * s, g.x * s + g.y * c);
      if (pt.x < -uCell || pt.y < -uCell || pt.x > uSize.x + uCell || pt.y > uSize.y + uCell) continue;
      float r = uCell * (uMin + (uMax - uMin) * clamp(shapeAt(pt / uSize), 0.0, 1.0));
      if (r < MIN_VISIBLE_RADIUS) continue;
      best = max(best, r * uDotScale - length(q - g));
    }
  }
  return best;
}

float wedgeSide(vec2 p) {
  vec2 e = uEdgeB - uEdgeA;
  float len = max(length(e), 1e-3);
  float inside = e.x * (uInside.y - uEdgeA.y) - e.y * (uInside.x - uEdgeA.x);
  float here = e.x * (p.y - uEdgeA.y) - e.y * (p.x - uEdgeA.x);
  return sign(inside) * here / len;
}

void main() {
  // px CSS con el origen arriba a la izquierda, como el CSS y el generador estático.
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uScale.y - gl_FragCoord.y) / uScale;
  float px = 1.0 / max(uScale.x, 1e-3);
  float dots = clamp(halftoneReach(p) / px + 0.5, 0.0, 1.0);
  float wedge = clamp(wedgeSide(p) / px + 0.5, 0.0, 1.0);
  float alpha = dots * wedge;
  // Alfa premultiplicado (el lienzo de WebGL compone así sobre la cuña granate).
  gl_FragColor = vec4(uInk * alpha, alpha);
}

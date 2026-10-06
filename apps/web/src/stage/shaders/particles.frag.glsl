// Partículas del Escenario (§3.5 capa 2): la chispa es un punto redondo de borde suave; el confeti, un
// cuadrado que gira y se voltea. Alfa premultiplicado, como compone el lienzo.
precision highp float;

varying vec4 vLook;
varying float vKind;
varying float vAngle;
varying float vFade;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float shape;
  if (vKind < 0.5) {
    shape = clamp((1.0 - length(c)) * 2.0, 0.0, 1.0);
  } else {
    float cs = cos(vAngle);
    float sn = sin(vAngle);
    // Girado y escalado para que el cuadrado quepa en el punto; el volteo lo aplasta en vertical.
    vec2 q = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * 1.4142;
    q.y /= max(0.25, abs(cos(vAngle * 0.7)));
    shape = step(max(abs(q.x), abs(q.y)), 1.0);
  }
  float alpha = shape * vLook.a * vFade;
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(vLook.rgb * alpha, alpha);
}

// Un rectángulo que cubre el lienzo entero (los pases a pantalla completa de la capa 0, §3.5).
attribute vec3 position;

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}

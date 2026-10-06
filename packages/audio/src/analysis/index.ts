/**
 * Motor de análisis de BPM y tonalidad (`@beatbattle/audio/analysis`; guía §4.6, `RF-ENT-06`, tarea
 * 1.9): port a TypeScript del motor del sello. Entrada aparte del paquete para que el cliente no cargue el
 * DSP hasta que haga falta (va en el worker).
 */
export * from './engine'
export * from './key'
export * from './musicTheory'
export * from './tempo'

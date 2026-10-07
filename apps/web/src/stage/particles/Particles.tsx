import { createRng } from '@beatbattle/rules'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, type Points, RawShaderMaterial } from 'three'
import { setAnimating, stageTime } from '../activity'
import type { Quality } from '../quality'
import { type StageBurst, takeBursts, useStageRuntime } from '../runtime'
import fragmentShader from '../shaders/particles.frag.glsl?raw'
import vertexShader from '../shaders/particles.vert.glsl?raw'
import { burstCount, burstRadius, PARTICLE_BUDGET, spawnBurst } from './model'

/** Contadores para las pruebas y el banco (solo en desarrollo). */
export interface ParticleStats {
  bursts: number
  alive: number
}

/**
 * Capa 2 del Escenario (guía §3.5, §4.17; tarea 1.3): un único `Points` con un anillo de tantas
 * partículas como permite la calidad (4.000 en alta, 1.500 en media). Cada ráfaga, ya autorizada por el
 * limitador de destellos (`stageBurst`), escribe sus partículas en el anillo; si no caben, pisan a las más
 * viejas, así que nunca hay más vivas que el presupuesto. Se mueven en el *shader*: una llamada de dibujo.
 */
export function Particles({ quality, stats }: { quality: Quality; stats: ParticleStats | null }) {
  const invalidate = useThree((state) => state.invalidate)
  const capacity = PARTICLE_BUDGET[quality]
  const ring = useMemo(() => {
    const geometry = new BufferGeometry()
    const attribute = (name: string, size: number) => {
      const buffer = new BufferAttribute(new Float32Array(capacity * size), size)
      geometry.setAttribute(name, buffer)
      return buffer
    }
    const buffers = {
      position: attribute('position', 3),
      motion: attribute('aMotion', 3),
      time: attribute('aTime', 2),
      look: attribute('aLook', 4),
      shape: attribute('aShape', 3),
    }
    const uniforms = { uSize: { value: [1, 1] }, uScale: { value: 1 }, uTime: { value: 0 } }
    const material = new RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    })
    return { geometry, material, uniforms, buffers }
  }, [capacity])
  const points = useRef<Points>(null)
  const cursor = useRef(0)
  const lives = useRef<{ end: number; count: number }[]>([])
  const serial = useRef(0)

  useEffect(
    () => () => {
      ring.geometry.dispose()
      ring.material.dispose()
      setAnimating('particles', false)
    },
    [ring],
  )

  useEffect(() => {
    const write = (burst: StageBurst) => {
      const { buffers } = ring
      const width = window.innerWidth
      const height = window.innerHeight
      const count = burstCount(burst.kind, quality, burst.count)
      if (count === 0) return
      const random = createRng(`burst-${serial.current++}`)
      const particles = spawnBurst(
        {
          kind: burst.kind,
          x: burst.x,
          y: burst.y,
          count,
          radius: burstRadius(burst.grant.area, width, height),
          alpha: burst.grant.opacity,
        },
        () => random.next(),
      )
      const born = stageTime()
      let end = born
      for (const particle of particles) {
        const i = cursor.current
        cursor.current = (cursor.current + 1) % capacity
        buffers.position.setXYZ(i, particle.x, particle.y, 0)
        buffers.motion.setXYZ(i, particle.dx, particle.dy, particle.fall)
        buffers.time.setXY(i, born, particle.life)
        buffers.look.setXYZW(i, particle.rgb[0], particle.rgb[1], particle.rgb[2], particle.alpha)
        buffers.shape.setXYZ(i, particle.size, particle.kind, particle.spin)
        end = Math.max(end, born + particle.life)
      }
      for (const buffer of Object.values(buffers)) buffer.needsUpdate = true
      lives.current.push({ end, count })
      if (stats) stats.bursts++
      setAnimating('particles', true)
      invalidate()
    }
    const drain = () => {
      for (const burst of takeBursts()) write(burst)
    }
    drain()
    return useStageRuntime.subscribe((state, previous) => {
      if (state.bursts !== previous.bursts && state.bursts.length > 0) drain()
    })
  }, [ring, quality, capacity, invalidate, stats])

  useFrame((state) => {
    const now = stageTime()
    const { uniforms } = ring
    const canvas = state.gl.domElement
    uniforms.uSize.value = [state.size.width || 1, state.size.height || 1]
    uniforms.uScale.value = canvas.width / (state.size.width || 1)
    uniforms.uTime.value = now
    lives.current = lives.current.filter((life) => life.end > now)
    const alive = Math.min(
      capacity,
      lives.current.reduce((sum, life) => sum + life.count, 0),
    )
    if (stats) stats.alive = alive
    if (alive === 0) setAnimating('particles', false)
  })

  return (
    <points
      ref={points}
      geometry={ring.geometry}
      material={ring.material}
      frustumCulled={false}
      renderOrder={1}
    />
  )
}

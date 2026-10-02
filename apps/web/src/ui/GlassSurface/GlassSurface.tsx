import {
  type ComponentPropsWithRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react'
import { useGlassCapability } from '../glass'
import { displacementMapFor } from './displacementMap'
import './GlassSurface.css'

/** Canal de color que lee el `feDisplacementMap`. */
type Channel = 'R' | 'G' | 'B' | 'A'

interface GlassOwnProps<T extends ElementType> {
  /** Etiqueta o componente que se pinta (`header`, `section`, `Link`…): conserva la semántica. */
  as?: T
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** Fondo del cristal, como valor CSS de un token. Por defecto, `var(--bb-glass-card)`. */
  tint?: string
  /**
   * Desenfoque real del fondo, como valor CSS de un token (`var(--bb-glass-blur-card)`). Distinto de
   * `blur`, que desenfoca el mapa de desplazamiento (la refracción, no el fondo). Por defecto, ninguno.
   */
  backdropBlur?: string
  saturation?: number
  /** Grosor del borde que refracta, como fracción del lado menor. */
  borderWidth?: number
  brightness?: number
  opacity?: number
  blur?: number
  /** Suavizado del resultado (`stdDeviation` del `feGaussianBlur` final). */
  displace?: number
  distortionScale?: number
  redOffset?: number
  greenOffset?: number
  blueOffset?: number
  xChannel?: Channel
  yChannel?: Channel
  mixBlendMode?: string
  chromaticAberration?: boolean
}

export type GlassSurfaceProps<T extends ElementType = 'div'> = GlassOwnProps<T> &
  Omit<ComponentPropsWithRef<T>, keyof GlassOwnProps<T>>

/**
 * Espera tras el último cambio de tamaño antes de rehacer el mapa: al redimensionar la ventana o girar
 * una tableta llegan decenas de avisos del `ResizeObserver` y basta con el del final.
 */
export const MAP_RESIZE_DEBOUNCE_MS = 150

/** Matrices que aíslan un canal tras desplazarlo (aberración cromática). */
const CHANNEL_MATRIX = {
  red: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  green: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  blue: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
} as const

/**
 * Superficie de cristal con refracción real (guía §3.1 y §3.3), portada de `GlassSurface` del sello
 * (`ReactOtpWeb/frontend/src/components/GlassSurface`, a su vez de ReactBits).
 *
 * - Con capacidad (`useGlassCapability`): fondo `tint` + `backdrop-filter` con un filtro SVG de
 *   desplazamiento propio de la pieza, saturación y desenfoque. Marca la pieza con
 *   `data-glass="on"` y la clase `bb-glass`.
 * - Sin ella (equipo modesto, «reducir movimiento» o «reducir transparencia», Safari/Firefox, sin
 *   `backdrop-filter`): pinta la etiqueta tal cual, sin tocar nada, y manda el CSS propio de la pieza
 *   (la isla, por ejemplo, se ve con `--bb-glass` + `blur(8px)`).
 * - Los hijos siguen siendo hijos directos (sin envoltorio), para no romper el CSS de cada pieza.
 * - El radio del mapa se lee del `border-radius` calculado de la pieza: el radio vive en su CSS.
 */
export function GlassSurface<T extends ElementType = 'div'>(props: GlassSurfaceProps<T>) {
  const {
    as,
    className,
    style,
    children,
    tint,
    backdropBlur,
    saturation = 1,
    borderWidth = 0.07,
    brightness = 50,
    opacity = 0.91,
    blur = 11,
    displace = 0.5,
    distortionScale = -180,
    redOffset = 0,
    greenOffset = 10,
    blueOffset = 20,
    xChannel = 'R',
    yChannel = 'G',
    mixBlendMode = 'difference',
    chromaticAberration = false,
    ...rest
  } = props
  const { ref: forwardedRef, ...domProps } = rest as { ref?: Ref<Element> } & Record<string, unknown>
  const Tag: ElementType = as ?? 'div'
  const glass = useGlassCapability()

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const filterId = `bb-glass-filter-${uid}`

  const containerRef = useRef<Element | null>(null)
  const feImageRef = useRef<SVGFEImageElement>(null)

  const setRef = useCallback(
    (node: Element | null) => {
      containerRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) (forwardedRef as { current: Element | null }).current = node
    },
    [forwardedRef],
  )

  const updateMap = useCallback(() => {
    const node = containerRef.current
    const image = feImageRef.current
    if (!node || !image) return
    const rect = node.getBoundingClientRect()
    const width = rect.width || 400
    const height = rect.height || 200
    const radius = Number.parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0
    // De la caché, por tamaño redondeado: el mismo mapa es la misma cadena y no se vuelve a escribir.
    const href = displacementMapFor({
      width,
      height,
      radius,
      borderWidth,
      brightness,
      opacity,
      blur,
      mixBlendMode,
    })
    if (image.getAttribute('href') !== href) image.setAttribute('href', href)
  }, [borderWidth, brightness, opacity, blur, mixBlendMode])

  useEffect(() => {
    if (!glass) return
    updateMap()
    const node = containerRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(updateMap, MAP_RESIZE_DEBOUNCE_MS)
    })
    observer.observe(node)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [glass, updateMap])

  const glassStyle = glass
    ? ({
        ...style,
        '--bb-glass-filter': `url(#${filterId})`,
        '--bb-glass-saturation': String(saturation),
        ...(tint !== undefined && { '--bb-glass-tint': tint }),
        ...(backdropBlur !== undefined && { '--bb-glass-backdrop-blur': backdropBlur }),
      } as CSSProperties)
    : style

  const displacement = (offset: number) => ({
    scale: distortionScale + offset,
    xChannelSelector: xChannel,
    yChannelSelector: yChannel,
  })

  // Una sola estructura con y sin cristal: el filtro va en la posición 0 (o `null`) y los hijos siempre
  // en la 1. Así, si la capacidad cambia en caliente («reducir movimiento», «reducir transparencia»),
  // React no vuelve a montar los hijos y se conservan su estado y el foco.
  return (
    <Tag
      ref={setRef}
      className={glass ? (className ? `bb-glass ${className}` : 'bb-glass') : className}
      style={glassStyle}
      data-glass={glass ? 'on' : undefined}
      {...domProps}
    >
      {glass ? (
        <svg
          className="bb-glass__filter"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
              <feImage
                ref={feImageRef}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
              />
              {chromaticAberration ? (
                <>
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    result="dispRed"
                    {...displacement(redOffset)}
                  />
                  <feColorMatrix in="dispRed" type="matrix" values={CHANNEL_MATRIX.red} result="red" />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    result="dispGreen"
                    {...displacement(greenOffset)}
                  />
                  <feColorMatrix in="dispGreen" type="matrix" values={CHANNEL_MATRIX.green} result="green" />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    result="dispBlue"
                    {...displacement(blueOffset)}
                  />
                  <feColorMatrix in="dispBlue" type="matrix" values={CHANNEL_MATRIX.blue} result="blue" />
                  <feBlend in="red" in2="green" mode="screen" result="rg" />
                  <feBlend in="rg" in2="blue" mode="screen" result="output" />
                </>
              ) : (
                // Sin aberración, un solo mapa con el desplazamiento intermedio de los tres canales.
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  result="output"
                  {...displacement(greenOffset)}
                />
              )}
              <feGaussianBlur in="output" stdDeviation={displace} />
            </filter>
          </defs>
        </svg>
      ) : null}
      {children}
    </Tag>
  )
}

/**
 * «Chrome en Linux» a partir del *user agent* (los avisos de seguridad y Ajustes → Sesiones, §2.3): lo
 * justo para reconocer el dispositivo, sin guardar ni enseñar la cadena entera.
 */
export function describeUserAgent(ua: string | null | undefined): string | undefined {
  if (!ua) return undefined
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : undefined
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : undefined
  if (browser && os) return `${browser} en ${os}`
  return browser ?? os
}

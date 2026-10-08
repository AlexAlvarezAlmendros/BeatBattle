import list from './data/disposable-domains.json'

const DOMAINS = new Set(list.domains)

/**
 * ¿Es de un dominio de email desechable (`RF-AUTH-09`)? Mira el dominio y sus padres
 * (`x.mailinator.com` también lo es). La lista es la comunitaria `disposable-email-domains` (CC0), en
 * `data/disposable-domains.json` (`node tools/data/disposable-domains.mjs` la actualiza).
 */
export function isDisposableEmail(address: string): boolean {
  const domain = address.trim().toLowerCase().split('@')[1]
  if (!domain) return false
  const labels = domain.split('.')
  for (let i = 0; i < labels.length - 1; i++) if (DOMAINS.has(labels.slice(i).join('.'))) return true
  return false
}

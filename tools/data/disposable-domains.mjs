#!/usr/bin/env node
/**
 * Lista de dominios de email desechables (`RF-AUTH-09`, guía §2.3, tarea 2.4), como datos: la descarga de
 * la lista comunitaria `disposable-email-domains` (dominio público, CC0 1.0) y la deja en
 * `apps/server/src/auth/data/disposable-domains.json` con su origen, el commit y la fecha. Se commitea: la
 * build no descarga nada. Para actualizarla:
 *
 *   node tools/data/disposable-domains.mjs
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'disposable-email-domains/disposable-email-domains'
const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/server/src/auth/data/disposable-domains.json',
)

const commit = await (await fetch(`https://api.github.com/repos/${REPO}/commits/main`)).json()
const sha = commit.sha
const text = await (
  await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/disposable_email_blocklist.conf`)
).text()
const domains = [
  ...new Set(
    text
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith('#')),
  ),
].sort()
if (domains.length < 1000)
  throw new Error(`La lista parece incompleta (${domains.length} dominios): no se escribe`)
await writeFile(
  OUT,
  `${JSON.stringify(
    {
      $comment: 'Generado por tools/data/disposable-domains.mjs: no se edita a mano.',
      source: `https://github.com/${REPO}`,
      license: 'CC0-1.0',
      commit: sha,
      fetchedAt: commit.commit.committer.date,
      domains,
    },
    null,
    0,
  )}\n`,
)
console.log(`${domains.length} dominios (${sha.slice(0, 12)})`)

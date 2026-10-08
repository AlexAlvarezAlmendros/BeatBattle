#!/usr/bin/env node
/**
 * Mailpit en local sin Docker (guía §4.19.1, tarea 2.2): la bandeja donde caen los emails de desarrollo.
 * Descarga la versión fijada del binario oficial (github.com/axllent/mailpit) la primera vez, comprueba su
 * SHA-256, lo deja en `tools/mailpit/.bin/` (ignorada por git) y lo arranca:
 *
 *   pnpm mail:dev            SMTP en 127.0.0.1:1025 y bandeja en http://localhost:8025
 *
 * La API envía ahí con `SMTP_URL=smtp://127.0.0.1:1025` (`apps/server/.env`): ningún email sale de la
 * máquina. Los puertos se cambian con MAILPIT_SMTP_PORT y MAILPIT_WEB_PORT, como en `docker-compose.yml`
 * (que sigue valiendo para quien tenga Docker). Para cambiar de versión: actualizar VERSION y las sumas
 * (`sha256sum` de cada `.tar.gz` de la versión nueva).
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = 'v1.31.4'
/** SHA-256 de cada archivo de la versión fijada (medidos al fijarla). */
const SHA256 = {
  'linux-amd64': '30942c4605c2ca8b9f759b1bb4e3ab6a12bdfdf66e5c94644ec2c75ac41e88e7',
  'linux-arm64': '010a346a8b9d454f6fa22d4fd2dbd5bf5eb7104688412b9c130d0ba33a3579c4',
  'darwin-amd64': '9ff1d1b249ccb884ca48a6fca01f69f9db88b07692dd98e115294778a0b20f54',
  'darwin-arm64': '26afeae329874fa6154dd83bd2e0f307e5df858054145dc7e98ec1aa426a8381',
}

const here = path.dirname(fileURLToPath(import.meta.url))
const binDir = path.join(here, '.bin', VERSION)
const binary = path.join(binDir, 'mailpit')

function platform() {
  const os = { linux: 'linux', darwin: 'darwin' }[process.platform]
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch]
  const key = os && arch ? `${os}-${arch}` : null
  if (!key || !SHA256[key]) {
    console.error(
      `Mailpit sin Docker solo está fijado para Linux y macOS (x64 y arm64); aquí: ${process.platform}-${process.arch}.\n` +
        'Usa `docker compose up -d` o descarga el binario de https://github.com/axllent/mailpit/releases.',
    )
    process.exit(1)
  }
  return key
}

async function install(key) {
  const url = `https://github.com/axllent/mailpit/releases/download/${VERSION}/mailpit-${key}.tar.gz`
  console.log(`Descargando Mailpit ${VERSION} (${key})…`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`No se pudo descargar ${url}: ${response.status}`)
  const archive = Buffer.from(await response.arrayBuffer())
  const sum = createHash('sha256').update(archive).digest('hex')
  if (sum !== SHA256[key]) {
    throw new Error(
      `La suma SHA-256 no coincide (${sum}): no se instala. ¿Ha cambiado el archivo de la versión?`,
    )
  }
  await mkdir(binDir, { recursive: true })
  const tarball = path.join(binDir, 'mailpit.tar.gz')
  await writeFile(tarball, archive)
  execFileSync('tar', ['-xzf', tarball, '-C', binDir, 'mailpit'])
  await rm(tarball)
  await chmod(binary, 0o755)
}

const key = platform()
// La suma se comprueba al instalar; después se usa el binario de la carpeta de su versión.
if (!existsSync(binary)) await install(key)

const smtp = process.env.MAILPIT_SMTP_PORT ?? '1025'
const web = process.env.MAILPIT_WEB_PORT ?? '8025'
console.log(`Mailpit ${VERSION}: SMTP en 127.0.0.1:${smtp} · bandeja en http://localhost:${web}`)
const child = spawn(binary, ['--smtp', `127.0.0.1:${smtp}`, '--listen', `127.0.0.1:${web}`], {
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code) => process.exit(code ?? 0))

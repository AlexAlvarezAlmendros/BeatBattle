// Prueba de humo de la función tal como la monta Vercel (`pnpm build`, guía §4.15): copia a una carpeta
// temporal solo lo que la función lleva de verdad (la traza de `@vercel/nft`, el trazador de Vercel, más el
// `includeFiles` de `vercel.json`) y arranca ahí `dist/vercel.mjs` en otro proceso. Si el artefacto necesita
// en tiempo de ejecución un fichero que la traza no ve (el `hb.wasm` de harfbuzzjs que carga satori al
// importarse, el binario de ffmpeg-static), falla aquí y no en producción con FUNCTION_INVOCATION_FAILED.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  globSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeFileTrace } from '@vercel/nft'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const { fileList } = await nodeFileTrace([join(root, 'apps/server/dist/vercel.mjs')], { base: root })
const { functions } = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
const included = functions['api/index.ts'].includeFiles
  .replace(/^\{|\}$/g, '')
  .split(',')
  .flatMap((pattern) => globSync(pattern, { cwd: root }))

// Ficheros que la API carga en tiempo de ejecución y que tienen que viajar con la función.
for (const required of [/harfbuzzjs\/hb\.wasm$/, /ffmpeg-static\/ffmpeg$/, /^apps\/server\/drizzle\//])
  assert.ok(
    [...fileList, ...included].some((file) => required.test(file)),
    `la función no lleva ${required} (añádelo a includeFiles en vercel.json)`,
  )

const out = mkdtempSync(join(tmpdir(), 'bb-vercel-'))
try {
  for (const file of new Set([...fileList, ...included])) {
    const source = join(root, file)
    const target = join(out, file)
    mkdirSync(dirname(target), { recursive: true })
    const stat = lstatSync(source)
    if (stat.isSymbolicLink()) symlinkSync(readlinkSync(source), target)
    else if (stat.isFile()) cpSync(source, target)
  }
  writeFileSync(
    join(out, 'smoke.mjs'),
    `import { createServer } from 'node:http'
const { default: handler } = await import('./apps/server/dist/vercel.mjs')
const server = createServer(handler)
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const response = await fetch(\`http://127.0.0.1:\${server.address().port}/api/health\`)
console.log(JSON.stringify({ status: response.status, body: await response.json() }))
server.close()
`,
  )
  // Lo mínimo para arrancar como en Vercel, con las migraciones que viajan en includeFiles (cwd = /var/task).
  const output = execFileSync(process.execPath, ['smoke.mjs'], {
    cwd: out,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      BB_PUBLIC_URL: 'https://battle.example',
      DATABASE_URL: ':memory:',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET: 'humo-de-vercel-secreto-de-prueba-de-32-caracteres',
    },
    timeout: 60_000,
  })
  const { status, body } = JSON.parse(output.trim().split('\n').at(-1))
  assert.equal(status, 200, `GET /api/health → ${status} ${JSON.stringify(body)}`)
  assert.equal(body.data?.db, 'up')
  console.log(
    `smoke-vercel: la función con ${fileList.size} ficheros trazados y ${included.length} incluidos arranca y /api/health responde 200`,
  )
} finally {
  rmSync(out, { recursive: true, force: true })
}

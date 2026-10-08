/**
 * Galería de emails (guía §4.19.4, `RF-NOTIF-03`): renderiza cada plantilla con sus datos de ejemplo y
 * deja el HTML en una carpeta, con un índice, para mirarlo en el navegador o capturarlo
 * (`node tools/shot/emails.mjs`). Las imágenes cuelgan de la web en local (`pnpm dev`).
 *
 *   pnpm --filter @beatbattle/emails exec tsx scripts/gallery.tsx <carpeta> [http://localhost:5173]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { renderEmail, TEMPLATES, type TemplateKind } from '../src'

const [out = 'galeria-emails', publicUrl = 'http://localhost:5173'] = process.argv.slice(2)
await mkdir(out, { recursive: true })
const kinds = Object.keys(TEMPLATES) as TemplateKind[]
for (const kind of kinds) {
  const template = TEMPLATES[kind]
  // biome-ignore lint/suspicious/noExplicitAny: cada plantilla con su propio fixture
  const email = await renderEmail(template as any, template.fixture, { publicUrl, family: 'service' })
  await writeFile(path.join(out, `${kind}.html`), email.html)
  await writeFile(
    path.join(out, `${kind}.txt`),
    `Asunto: ${email.subject}\nPreheader: ${email.preheader}\n\n${email.text}`,
  )
  console.log(`${kind}: «${email.subject}» (${email.subject.length} caracteres)`)
}
await writeFile(
  path.join(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Galería de emails</title><ul>${kinds
    .map((kind) => `<li><a href="${kind}.html">${kind}</a> · <a href="${kind}.txt">texto plano</a></li>`)
    .join('')}</ul>`,
)

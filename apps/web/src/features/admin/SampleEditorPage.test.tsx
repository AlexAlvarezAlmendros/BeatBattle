import type { AdminSample, SampleUploadPart } from '@beatbattle/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { createSample, signSampleUpload, updateSample, uploadSigned } from '../../net/admin'
import { SampleForm } from './SampleEditorPage'

vi.mock('../../net/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../net/admin')>()),
  signSampleUpload: vi.fn(),
  uploadSigned: vi.fn(async () => undefined),
  createSample: vi.fn(async () => ({ id: 's_uno' })),
  updateSample: vi.fn(async () => ({})),
}))

const sign = vi.mocked(signSampleUpload)

/** Un sample ya creado, como lo da `GET /api/admin/samples/:id`. */
const existing = (patch: Partial<AdminSample> = {}): AdminSample => ({
  id: 's_uno',
  title: 'Lluvia en Gràcia',
  credits: 'Other People Records',
  origin: null,
  licenseText: 'Uso libre para la batalla.',
  bpm: 92,
  musicalKey: 'Dm',
  genreHint: null,
  durationMs: 6000,
  bytes: 1000,
  format: 'wav',
  loudnessLufs: -10,
  peaks: btoa(String.fromCharCode(...new Uint8Array(2000))),
  chops: [],
  hasStems: false,
  coverUrl: null,
  streamUrl: '/stream',
  weeks: [],
  createdAt: 0,
  ...patch,
})

function fillSheet() {
  fireEvent.change(screen.getByLabelText(t('admin.sample.titleField')), { target: { value: 'Lluvia' } })
  fireEvent.change(screen.getByLabelText(t('admin.sample.credits')), { target: { value: 'OTP' } })
  fireEvent.change(screen.getByLabelText(t('admin.sample.license')), { target: { value: 'Libre' } })
  fireEvent.change(screen.getByLabelText(t('admin.sample.bpm')), { target: { value: '92' } })
  fireEvent.change(screen.getByLabelText(t('admin.sample.key')), { target: { value: 'Dm' } })
}

/** Una firma que el test resuelve cuando quiere, para cruzar dos subidas. */
function deferredSign() {
  let resolve: (id: string) => void = () => {}
  const promise = new Promise<string>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const signed = (part: SampleUploadPart, sampleId: string) => ({
  sampleId,
  upload: {
    uploadUrl: 'https://upload.test',
    publicId: `beatbattle-dev/samples/${sampleId}/${part}`,
    fields: {},
  },
})

afterEach(() => vi.clearAllMocks())

describe('SampleForm (§2.14)', () => {
  it('RF-ADM-01: con el audio aún firmándose, la portada espera su id y no pide otro', async () => {
    const first = deferredSign()
    sign.mockImplementation(async (part, sampleId) =>
      sampleId ? signed(part, sampleId) : signed(part, await first.promise),
    )
    const { container } = renderInRouter(<SampleForm sample={null} />, '/admin/samples/nuevo')
    const input = (part: SampleUploadPart) =>
      container.querySelector(`input[data-part="${part}"]`) as HTMLInputElement
    const file = (name: string) => new File(['x'], name)

    fireEvent.change(input('original'), { target: { files: [file('drop.wav')] } })
    fireEvent.change(input('cover'), { target: { files: [file('cover.png')] } })
    first.resolve('s_uno')

    await waitFor(() => expect(uploadSigned).toHaveBeenCalledTimes(2))
    expect(sign).toHaveBeenCalledTimes(2)
    expect(sign).toHaveBeenNthCalledWith(1, 'original')
    expect(sign).toHaveBeenNthCalledWith(2, 'cover', 's_uno')
    // Los dos con «Subido» (cada uno lo dice en su estado visible y en su anuncio para lectores de pantalla).
    expect(await screen.findAllByText(t('admin.sample.uploaded'))).toHaveLength(4)
  })

  it('RF-ADM-01: si la primera firma falla, la siguiente subida pide un id nuevo', async () => {
    sign
      .mockRejectedValueOnce(new Error('red'))
      .mockImplementation(async (part, sampleId) => signed(part, sampleId ?? 's_dos'))
    const { container } = renderInRouter(<SampleForm sample={null} />, '/admin/samples/nuevo')
    const original = container.querySelector('input[data-part="original"]') as HTMLInputElement

    fireEvent.change(original, { target: { files: [new File(['x'], 'drop.wav')] } })
    await waitFor(() => expect(sign).toHaveBeenCalledTimes(1))
    fireEvent.change(original, { target: { files: [new File(['x'], 'drop.wav')] } })

    await waitFor(() => expect(uploadSigned).toHaveBeenCalledTimes(1))
    expect(sign).toHaveBeenNthCalledWith(2, 'original')
  })

  it('RF-ADM-01: un sample se crea solo con el original; la portada es opcional', async () => {
    sign.mockImplementation(async (part, sampleId) => signed(part, sampleId ?? 's_uno'))
    const { container } = renderInRouter(<SampleForm sample={null} />, '/admin/samples/nuevo')
    expect(screen.getByText(/^Portada .*opcional\)$/)).toBeInTheDocument()
    const original = container.querySelector('input[data-part="original"]') as HTMLInputElement
    fireEvent.change(original, { target: { files: [new File(['x'], 'drop.wav')] } })
    await screen.findAllByText(t('admin.sample.uploaded'))
    fillSheet()
    fireEvent.click(screen.getByRole('button', { name: t('admin.sample.create') }))
    await waitFor(() => expect(createSample).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createSample).mock.calls[0]?.[0]).toMatchObject({
      sampleId: 's_uno',
      hasCover: false,
      hasStems: false,
    })
  })

  it('RF-ADM-01: con la portada aún subiendo, «Crear el sample» espera en vez de dejarla fuera', async () => {
    sign.mockImplementation(async (part, sampleId) => signed(part, sampleId ?? 's_uno'))
    let finish: () => void = () => {}
    vi.mocked(uploadSigned)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            finish = done
          }),
      )
    const { container } = renderInRouter(<SampleForm sample={null} />, '/admin/samples/nuevo')
    const input = (part: SampleUploadPart) =>
      container.querySelector(`input[data-part="${part}"]`) as HTMLInputElement
    fireEvent.change(input('original'), { target: { files: [new File(['x'], 'drop.wav')] } })
    await screen.findAllByText(t('admin.sample.uploaded'))
    fireEvent.change(input('cover'), { target: { files: [new File(['x'], 'cover.png')] } })
    await waitFor(() => expect(uploadSigned).toHaveBeenCalledTimes(2))
    fillSheet()
    fireEvent.click(screen.getByRole('button', { name: t('admin.sample.create') }))
    expect(await screen.findByText(t('admin.sample.waitUploads'))).toBeInTheDocument()
    expect(createSample).not.toHaveBeenCalled()
    finish()
    await waitFor(() => expect(screen.getAllByText(t('admin.sample.uploaded'))).toHaveLength(4))
    fireEvent.click(screen.getByRole('button', { name: t('admin.sample.create') }))
    await waitFor(() => expect(createSample).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createSample).mock.calls[0]?.[0]).toMatchObject({ hasCover: true })
  })

  it('RF-ADM-01: en un sample sin portada, subirla la añade; con portada, «Quitar la portada» la quita', async () => {
    sign.mockImplementation(async (part, sampleId) => signed(part, sampleId ?? 's_uno'))
    const bare = renderInRouter(<SampleForm sample={existing()} />, '/admin/samples/s_uno')
    expect(screen.queryByRole('button', { name: t('admin.sample.removeCover') })).toBeNull()
    const cover = bare.container.querySelector('input[data-part="cover"]') as HTMLInputElement
    fireEvent.change(cover, { target: { files: [new File(['x'], 'cover.png')] } })
    await waitFor(() => expect(updateSample).toHaveBeenCalledWith('s_uno', { hasCover: true }))
    bare.unmount()

    renderInRouter(<SampleForm sample={existing({ coverUrl: '/cover.png' })} />, '/admin/samples/s_uno')
    fireEvent.click(screen.getByRole('button', { name: t('admin.sample.removeCover') }))
    await waitFor(() => expect(updateSample).toHaveBeenCalledWith('s_uno', { hasCover: false }))
  })
})

import type { SampleUploadPart } from '@beatbattle/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { signSampleUpload, uploadSigned } from '../../net/admin'
import { SampleForm } from './SampleEditorPage'

vi.mock('../../net/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../net/admin')>()),
  signSampleUpload: vi.fn(),
  uploadSigned: vi.fn(async () => undefined),
}))

const sign = vi.mocked(signSampleUpload)

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
})

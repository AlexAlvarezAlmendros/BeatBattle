import { describe, expect, it } from 'vitest'
import { UploadError, uploadReason } from './admin'

describe('subida firmada del panel (§2.14)', () => {
  it('RF-ADM-01: si Cloudinary rechaza la subida, el error lleva su motivo', () => {
    const reason = uploadReason(
      '{"error":{"message":"Invalid Signature 1a2b. String to sign - \'public_id=x\'."}}',
    )
    expect(reason).toBe("Invalid Signature 1a2b. String to sign - 'public_id=x'")
    const error = new UploadError(401, reason)
    expect(error.status).toBe(401)
    expect(error.message).toContain('Invalid Signature')
  })

  it('RF-ADM-01: sin motivo legible (HTML, vacío, sin mensaje), null; uno muy largo, recortado', () => {
    expect(uploadReason('<html>502</html>')).toBeNull()
    expect(uploadReason('')).toBeNull()
    expect(uploadReason('{"error":{}}')).toBeNull()
    expect(uploadReason(JSON.stringify({ error: { message: 'x'.repeat(400) } }))).toHaveLength(160)
  })
})

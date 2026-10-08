import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'

const client = vi.hoisted(() => ({
  signIn: { email: vi.fn(), username: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  sendVerificationEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}))
vi.mock('../account/authClient', () => ({ authClient: client }))
vi.mock('../account/passwordStrength', () => ({
  passwordStrength: async () => ({ score: 3, warning: null }),
}))

const { SignInPage, SignUpPage, RecoverPage } = await import('./AuthPages')

beforeEach(() => vi.clearAllMocks())

describe('CONTINUAR PARTIDA (/entrar)', () => {
  it('con email entra por email y con nombre por nombre; un fallo sale en el aviso con las palabras de la guía', async () => {
    client.signIn.username.mockResolvedValue({ error: { code: 'INVALID_USERNAME_OR_PASSWORD', status: 401 } })
    renderInRouter(<SignInPage />, '/entrar')
    await userEvent.type(screen.getByLabelText('Email o nombre de productor'), 'lilbru')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una contraseña cualquiera')
    await userEvent.keyboard('{Enter}')
    expect(client.signIn.username).toHaveBeenCalledWith({
      username: 'lilbru',
      password: 'una contraseña cualquiera',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El nombre de productor y la contraseña no coinciden.',
    )
  })

  it('RF-AUTH-01: sin verificar, el aviso ofrece «Reenviar el email»', async () => {
    client.signIn.email.mockResolvedValue({ error: { code: 'EMAIL_NOT_VERIFIED', status: 403 } })
    client.sendVerificationEmail.mockResolvedValue({ data: { status: true } })
    renderInRouter(<SignInPage />, '/entrar')
    await userEvent.type(screen.getByLabelText('Email o nombre de productor'), 'aina@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una contraseña cualquiera')
    await userEvent.click(screen.getByRole('button', { name: /^Entrar(\s*Intro)?$/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reenviar el email' }))
    expect(client.sendVerificationEmail).toHaveBeenCalledWith({
      email: 'aina@example.com',
      callbackURL: '/verificar',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Enviado otra vez.')
  })
})

describe('NUEVO JUGADOR (/registro)', () => {
  it('RF-AUTH-06: el nombre reservado se avisa en el propio campo al salir de él, antes de enviar', async () => {
    renderInRouter(<SignUpPage />, '/registro')
    await userEvent.type(screen.getByLabelText('Nombre de productor'), 'admin')
    await userEvent.tab()
    expect(screen.getByLabelText('Nombre de productor')).toHaveAccessibleDescription(
      /Ese nombre está reservado/,
    )
  })

  it('RF-NOTIF-16: envía las casillas (avisos marcados salvo los quitados; marketing y newsletter, desmarcados) y lleva a /verificar', async () => {
    client.signUp.email.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { router } = renderInRouter(<SignUpPage />, '/registro')
    await userEvent.type(screen.getByLabelText('Email'), 'aina@example.com')
    await userEvent.type(screen.getByLabelText('Nombre de productor'), 'Aina')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'lluvia en gràcia 92')
    await userEvent.click(screen.getByRole('button', { name: /Recordatorio para subir/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Crear cuenta(\s*Intro)?$/i }))
    const body = client.signUp.email.mock.calls[0]?.[0]
    expect(body).toMatchObject({
      email: 'aina@example.com',
      username: 'Aina',
      displayUsername: 'Aina',
      callbackURL: '/verificar',
    })
    expect(body.consents.notices).toMatchObject({ dropOn: true, reminderOn: false })
    expect(body.consents).toMatchObject({ marketing: false, otpNewsletter: false })
    await waitFor(() => expect(router.state.location.pathname).toBe('/verificar'))
    expect(router.state.location.search).toBe('?email=aina%40example.com')
  })

  it('RF-AUTH-07 y RF-AUTH-09: los errores del servidor van al campo al que pertenecen', async () => {
    client.signUp.email.mockResolvedValue({ error: { code: 'PASSWORD_COMPROMISED', status: 400 } })
    renderInRouter(<SignUpPage />, '/registro')
    await userEvent.type(screen.getByLabelText('Email'), 'aina@example.com')
    await userEvent.type(screen.getByLabelText('Nombre de productor'), 'aina')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'password123456')
    await userEvent.click(screen.getByRole('button', { name: /^Crear cuenta(\s*Intro)?$/i }))
    await waitFor(() =>
      expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(
        /aparece en filtraciones conocidas/,
      ),
    )
    client.signUp.email.mockResolvedValue({ error: { code: 'EMAIL_DISPOSABLE', status: 422 } })
    await userEvent.click(screen.getByRole('button', { name: /^Crear cuenta(\s*Intro)?$/i }))
    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/dominio de email no se admite/),
    )
  })
})

describe('/recuperar', () => {
  it('pide el enlace y, con el token, guarda la contraseña nueva avisando de que se cierran las sesiones', async () => {
    client.requestPasswordReset.mockResolvedValue({ data: { status: true } })
    renderInRouter(<RecoverPage />, '/recuperar')
    await userEvent.type(screen.getByLabelText('Email'), 'aina@example.com')
    await userEvent.click(screen.getByRole('button', { name: /Enviar el enlace/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('ya te hemos enviado el enlace')
    client.resetPassword.mockResolvedValue({ data: { status: true } })
    renderInRouter(<RecoverPage />, '/recuperar?token=abc')
    expect(screen.getByText(/se cerrarán todas tus sesiones/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'otra contraseña larga 41')
    await userEvent.click(screen.getByRole('button', { name: /Guardar la contraseña/ }))
    expect(client.resetPassword).toHaveBeenCalledWith({
      newPassword: 'otra contraseña larga 41',
      token: 'abc',
    })
  })
})

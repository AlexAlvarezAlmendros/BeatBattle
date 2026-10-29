import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { mockMatchMedia } from '../hooks/mockMatchMedia'
import { ProducerCard, type ProducerCardProps } from './ProducerCard'

const CARD: ProducerCardProps = {
  name: 'Kairo.wav',
  initials: 'KW',
  cardNumber: 42,
  level: 13,
  levelFraction: 0.4,
  rank: 'Maestro del bounce',
  stats: { wins: 2, podiums: 5, weeks: 18 },
  showcase: ['win', 'golden_ear'],
  achievements: 14,
  since: '03/2026',
  variant: 'holo',
  back: { profileUrl: 'https://beatbattle.example/p/kairo.wav', qrSrc: '/api/profiles/kairo.wav/qr.png' },
}

let media: ReturnType<typeof mockMatchMedia> | null = null
afterEach(() => {
  media?.restore()
  media = null
})

describe('carta de productor (§3.4.4, tarea 7.22)', () => {
  it('§3.4.4: el anverso lleva número, sello de nivel, nombre, rango, tres cifras, vitrina y pie', () => {
    render(<ProducerCard {...CARD} />)
    const card = screen.getByRole('article', { name: /Kairo\.wav, número 42, holográfica/ })
    const front = card.querySelector<HTMLElement>('[data-face="front"]') as HTMLElement
    expect(within(front).getByText('#0042')).toBeInTheDocument()
    expect(within(front).getByRole('img', { name: t('ui.producerCard.level', { level: 13 }) })).toBeVisible()
    expect(within(front).getByText('Kairo.wav')).toBeInTheDocument()
    expect(within(front).getByText('Maestro del bounce')).toBeInTheDocument()
    expect(within(front).getByText(t('ui.producerCard.variants.holo.tag', { wins: 2 }))).toBeInTheDocument()
    const terms = within(front)
      .getAllByRole('term')
      .map((term) => term.textContent)
    expect(terms).toEqual(['Victorias', 'Podios', 'Semanas'])
    expect(
      within(front)
        .getAllByRole('definition')
        .map((value) => value.textContent),
    ).toEqual(['2', '5', '18'])
    const showcase = within(front).getByRole('list', { name: t('ui.producerCard.showcase') })
    expect(
      within(showcase)
        .getAllByRole('listitem')
        .map((slot) => slot.textContent),
    ).toEqual([t('achievement.win.name'), t('achievement.golden_ear.name'), t('ui.producerCard.emptySlot')])
    expect(within(front).getByText(t('ui.producerCard.since', { since: '03/2026' }))).toBeInTheDocument()
    expect(within(front).getByText('2 de 14')).toBeInTheDocument()
  })

  it('§3.4.4: la cara que no se ve queda fuera del árbol accesible y del foco', () => {
    const { rerender } = render(<ProducerCard {...CARD} />)
    const card = screen.getByRole('article')
    const back = card.querySelector('[data-face="back"]') as HTMLElement
    expect(back).toHaveAttribute('aria-hidden', 'true')
    expect(back).toHaveAttribute('inert')
    rerender(<ProducerCard {...CARD} side="back" />)
    expect(card).toHaveAttribute('data-side', 'back')
    expect(card.querySelector('[data-face="front"]')).toHaveAttribute('aria-hidden', 'true')
    expect(back).not.toHaveAttribute('aria-hidden')
    expect(back).not.toHaveAttribute('inert')
  })

  it('RF-GAME-07 / §3.4.4: el reverso lleva el QR del perfil (el PNG del servidor, con su nombre) y su dirección escrita', () => {
    render(<ProducerCard {...CARD} side="back" />)
    const back = screen.getByRole('article').querySelector('[data-face="back"]') as HTMLElement
    expect(within(back).getByText('beatbattle.example/p/kairo.wav')).toBeInTheDocument()
    const qr = within(back).getByRole('img', { name: t('ui.producerCard.qrAlt', { name: 'Kairo.wav' }) })
    expect(qr).toHaveAttribute('src', '/api/profiles/kairo.wav/qr.png')
    expect(qr).toHaveAttribute('loading', 'lazy')
    // Mientras llega, el papel blanco; si no llega, «QR no disponible».
    expect(qr.parentElement).toHaveAttribute('data-qr', 'loading')
    fireEvent.load(qr)
    expect(qr.parentElement).toHaveAttribute('data-qr', 'ready')
    fireEvent.error(qr)
    expect(within(back).getByText(t('ui.producerCard.qrUnavailable'))).toBeInTheDocument()
  })

  it('§3.4.4: el QR solo se pide al girar la carta por primera vez', () => {
    const { rerender } = render(<ProducerCard {...CARD} />)
    const card = screen.getByRole('article')
    expect(card.querySelector('[data-face="back"] [data-qr] img')).toBeNull()
    rerender(<ProducerCard {...CARD} side="back" />)
    expect(card.querySelector('[data-face="back"] [data-qr] img')).not.toBeNull()
    rerender(<ProducerCard {...CARD} side="front" />)
    expect(card.querySelector('[data-face="back"] [data-qr] img')).not.toBeNull()
  })

  it('§3.4.4: sin dirección del perfil no hay reverso (la bienvenida, Ajustes → Perfil)', () => {
    render(<ProducerCard {...CARD} back={undefined} side="back" />)
    const card = screen.getByRole('article')
    expect(card).toHaveAttribute('data-side', 'front')
    expect(card.querySelector('[data-face="back"]')).toBeNull()
  })

  it('RF-GAME-07: con «reducir movimiento» la carta es plana (sin inclinación ni giro 3D)', () => {
    media = mockMatchMedia({ '(prefers-reduced-motion: reduce)': true })
    render(<ProducerCard {...CARD} interactive />)
    const card = screen.getByRole('article')
    expect(card).toHaveAttribute('data-flat')
    expect(card).not.toHaveAttribute('data-tilt')
  })

  it('RF-GAME-07: con movimiento, la carta interactiva sigue al puntero (la inclinación de Anexo E)', () => {
    media = mockMatchMedia({ '(prefers-reduced-motion: reduce)': false })
    render(<ProducerCard {...CARD} interactive />)
    const card = screen.getByRole('article')
    expect(card).toHaveAttribute('data-tilt')
    expect(card).not.toHaveAttribute('data-flat')
  })

  it('§3.4.4: cada variante se nombra (estándar, roja, holo y campeón) y la estándar no lleva etiqueta', () => {
    for (const variant of ['standard', 'red', 'holo', 'champion'] as const) {
      const { unmount } = render(<ProducerCard {...CARD} variant={variant} />)
      const card = screen.getByRole('article')
      expect(card).toHaveAttribute('data-variant', variant)
      expect(card.getAttribute('aria-label')).toContain(t(`ui.producerCard.variants.${variant}.label`))
      if (variant === 'standard') expect(card.querySelector('[data-tag]')).toBeNull()
      else expect(card.querySelector('[data-tag]')).not.toBeNull()
      unmount()
    }
  })
})

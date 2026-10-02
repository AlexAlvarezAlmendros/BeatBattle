import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { Skeleton, SkeletonGroup } from './Skeleton'

afterEach(() => {
  document.documentElement.removeAttribute('data-motion')
})

describe('Skeleton', () => {
  it('es decorativo y la región que carga lleva aria-busy y «Cargando…»', () => {
    render(
      <SkeletonGroup data-testid="group">
        <Skeleton shape="text" width="60%" />
        <Skeleton shape="circle" width={48} />
      </SkeletonGroup>,
    )
    const group = screen.getByTestId('group')
    expect(group).toHaveAttribute('aria-busy', 'true')
    expect(group).toHaveTextContent(t('ui.skeleton.loading'))
    const bones = group.querySelectorAll('[data-skeleton]')
    expect(bones).toHaveLength(2)
    for (const bone of bones) expect(bone).toHaveAttribute('aria-hidden', 'true')
  })

  it('el círculo es igual de alto que de ancho si no se dice otra cosa', () => {
    const { container } = render(<Skeleton shape="circle" width={48} />)
    const bone = container.querySelector<HTMLElement>('[data-skeleton="circle"]')!
    expect(bone.style.width).toBe('48px')
    expect(bone.style.height).toBe('48px')
  })

  it('RNF-A11Y-03 / RD-MOT-03: con «reducir movimiento» es gris fijo, sin barrido', () => {
    const { container } = render(<Skeleton />)
    const bone = container.querySelector('[data-skeleton]')!
    const animation = () => getComputedStyle(bone).getPropertyValue('animation')
    expect(animation()).toMatch(/shimmer/)
    document.documentElement.setAttribute('data-motion', 'reduced')
    expect(animation()).toBe('none')
  })
})

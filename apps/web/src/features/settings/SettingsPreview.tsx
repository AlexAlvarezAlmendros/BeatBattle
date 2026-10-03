import { useId } from 'react'
import type { SettingsSectionKey } from '../../app/paths'
import { type SimpleMessageKey, t } from '../../i18n'
import { frameAttributes } from '../../ui/Frame'
import { Meter } from '../../ui/Meter'

type OptionKey = Extract<SimpleMessageKey, `settings.preview.options.${string}`>
type ValueKey = Extract<SimpleMessageKey, `settings.preview.values.${string}`>

/**
 * Una opción de la vista previa (§3.8.14 «Ajustes = OPCIONES»): un medidor de 10 pasos (`meter`, con
 * los pasos llenos), un conmutador «◀ SÍ ▶» (`toggle`) o una acción de su panel («Cambiar ▸»).
 */
type PreviewOption =
  | { label: OptionKey; meter: number }
  | { label: OptionKey; toggle: ValueKey }
  | { label: OptionKey; action: ValueKey }

/** Pasos del medidor de las opciones (§3.8.14: «un medidor de 10 pasos que se cambia con ←/→»). */
const METER_STEPS = 10

/** Ancho del medidor: diez segmentos de `Meter` (9 px de segmento y 2 px de hueco). */
const METER_WIDTH = `calc(${METER_STEPS} * (var(--bb-space-2) + var(--bb-stroke-hair) + var(--bb-stroke)))`

/**
 * Lo que tendrá cada sección, en el orden de su resumen (`settings.<sección>.summary`). Los valores son
 * los de una partida nueva; las opciones aún no hacen nada (Fase 2 en adelante). Accesibilidad no
 * enseña los atajos de una tecla: ese conmutador ya funciona y va en el panel.
 */
const PREVIEW: Record<SettingsSectionKey, readonly PreviewOption[]> = {
  sound: [
    { label: 'settings.preview.options.effects', meter: 8 },
    { label: 'settings.preview.options.music', meter: 6 },
    { label: 'settings.preview.options.entries', meter: 8 },
    { label: 'settings.preview.options.mute', toggle: 'settings.preview.values.no' },
  ],
  motion: [
    { label: 'settings.preview.options.reduceMotion', toggle: 'settings.preview.values.no' },
    { label: 'settings.preview.options.serious', toggle: 'settings.preview.values.no' },
    { label: 'settings.preview.options.quality', toggle: 'settings.preview.values.high' },
  ],
  account: [
    { label: 'settings.preview.options.email', action: 'settings.preview.values.change' },
    { label: 'settings.preview.options.password', action: 'settings.preview.values.change' },
    { label: 'settings.preview.options.google', action: 'settings.preview.values.connect' },
    { label: 'settings.preview.options.discord', action: 'settings.preview.values.connect' },
  ],
  profile: [
    { label: 'settings.preview.options.name', action: 'settings.preview.values.edit' },
    { label: 'settings.preview.options.avatar', action: 'settings.preview.values.edit' },
    { label: 'settings.preview.options.links', action: 'settings.preview.values.edit' },
    { label: 'settings.preview.options.accent', action: 'settings.preview.values.choose' },
  ],
  emails: [
    { label: 'settings.preview.options.battleAlerts', toggle: 'settings.preview.values.yes' },
    { label: 'settings.preview.options.marketing', toggle: 'settings.preview.values.no' },
    { label: 'settings.preview.options.quietHours', action: 'settings.preview.values.choose' },
  ],
  sessions: [
    { label: 'settings.preview.options.activeSessions', action: 'settings.preview.values.see' },
    { label: 'settings.preview.options.closeOthers', action: 'settings.preview.values.close' },
  ],
  privacy: [
    { label: 'settings.preview.options.export', action: 'settings.preview.values.request' },
    { label: 'settings.preview.options.deleteAccount', action: 'settings.preview.values.delete' },
  ],
  accessibility: [
    { label: 'settings.preview.options.textSize', meter: 5 },
    { label: 'settings.preview.options.gate', toggle: 'settings.preview.values.yes' },
  ],
}

/**
 * La pieza de Opciones en la cuña (§3.8.14; segundo pase del jurado, tarea 0.28): las placas de la
 * sección en vista previa, quietas, con su pie «Vista previa: … todavía no hacen nada». Las placas
 * son dibujo (`aria-hidden`): lo que tendrá la sección ya lo dice en palabras el resumen del panel, y
 * el pie lo cuenta a los lectores de pantalla. Cada placa es opaca: la cuña lleva trama (`RD-VIS-05`).
 */
export function SettingsPreview({ section }: { section: SettingsSectionKey }) {
  const captionId = useId()
  return (
    <figure className="settings-preview" data-settings-preview={section} aria-labelledby={captionId}>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className="settings-preview-list" aria-hidden="true">
        {PREVIEW[section].map((option) => (
          <li key={option.label} {...frameAttributes({ cut: 'md' })} className="settings-preview-option">
            <span className="settings-preview-label">{t(option.label)}</span>
            <PreviewControl option={option} />
          </li>
        ))}
      </ul>
      <figcaption id={captionId} className="settings-preview-caption">
        {t('settings.preview.caption')}
      </figcaption>
    </figure>
  )
}

function PreviewControl({ option }: { option: PreviewOption }) {
  if ('meter' in option) {
    return (
      <Meter
        value={option.meter}
        max={METER_STEPS}
        width={METER_WIDTH}
        label={t(option.label)}
        valueText={t('settings.preview.meterValue', { value: option.meter, max: METER_STEPS })}
      />
    )
  }
  if ('toggle' in option) {
    return (
      <span className="settings-preview-toggle">
        <span className="settings-preview-arrow" data-side="left" />
        {t(option.toggle)}
        <span className="settings-preview-arrow" data-side="right" />
      </span>
    )
  }
  return (
    <span className="settings-preview-action">
      {t(option.action)}
      <span className="settings-preview-arrow" data-side="right" />
    </span>
  )
}

import { useId } from 'react'
import type { SettingsSectionKey } from '../../app/paths'
import { type SimpleMessageKey, t } from '../../i18n'
import { frameAttributes } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { Meter } from '../../ui/Meter'

type OptionKey = Extract<SimpleMessageKey, `settings.preview.options.${string}`>
type ValueKey = Extract<SimpleMessageKey, `settings.preview.values.${string}`>
type HelpKey = Extract<SimpleMessageKey, `settings.preview.help.${string}`>

/**
 * Una opción de la vista previa (§3.8.14 «Ajustes = OPCIONES»): un medidor de 10 pasos (`meter`, con
 * los pasos llenos), un conmutador «◀ SÍ ▶» (`toggle`) o una acción de su panel («Cambiar ▸»), y qué
 * hará (`help`, en el panel: RNF-A11Y-08 pide cada opción con su explicación).
 */
type PreviewOption = { label: OptionKey; help: HelpKey } & (
  | { meter: number }
  | { toggle: ValueKey }
  | { action: ValueKey }
)

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
    { label: 'settings.preview.options.effects', help: 'settings.preview.help.effects', meter: 8 },
    { label: 'settings.preview.options.music', help: 'settings.preview.help.music', meter: 6 },
    { label: 'settings.preview.options.entries', help: 'settings.preview.help.entries', meter: 8 },
    {
      label: 'settings.preview.options.mute',
      help: 'settings.preview.help.mute',
      toggle: 'settings.preview.values.no',
    },
  ],
  motion: [
    {
      label: 'settings.preview.options.reduceMotion',
      help: 'settings.preview.help.reduceMotion',
      toggle: 'settings.preview.values.no',
    },
    {
      label: 'settings.preview.options.serious',
      help: 'settings.preview.help.serious',
      toggle: 'settings.preview.values.no',
    },
    {
      label: 'settings.preview.options.quality',
      help: 'settings.preview.help.quality',
      toggle: 'settings.preview.values.high',
    },
  ],
  account: [
    {
      label: 'settings.preview.options.email',
      help: 'settings.preview.help.email',
      action: 'settings.preview.values.change',
    },
    {
      label: 'settings.preview.options.password',
      help: 'settings.preview.help.password',
      action: 'settings.preview.values.change',
    },
    {
      label: 'settings.preview.options.google',
      help: 'settings.preview.help.google',
      action: 'settings.preview.values.connect',
    },
    {
      label: 'settings.preview.options.discord',
      help: 'settings.preview.help.discord',
      action: 'settings.preview.values.connect',
    },
  ],
  profile: [
    {
      label: 'settings.preview.options.name',
      help: 'settings.preview.help.name',
      action: 'settings.preview.values.edit',
    },
    {
      label: 'settings.preview.options.avatar',
      help: 'settings.preview.help.avatar',
      action: 'settings.preview.values.edit',
    },
    {
      label: 'settings.preview.options.links',
      help: 'settings.preview.help.links',
      action: 'settings.preview.values.edit',
    },
    {
      label: 'settings.preview.options.accent',
      help: 'settings.preview.help.accent',
      action: 'settings.preview.values.choose',
    },
  ],
  emails: [
    {
      label: 'settings.preview.options.battleAlerts',
      help: 'settings.preview.help.battleAlerts',
      toggle: 'settings.preview.values.yes',
    },
    {
      label: 'settings.preview.options.marketing',
      help: 'settings.preview.help.marketing',
      toggle: 'settings.preview.values.no',
    },
    {
      label: 'settings.preview.options.quietHours',
      help: 'settings.preview.help.quietHours',
      action: 'settings.preview.values.choose',
    },
  ],
  sessions: [
    {
      label: 'settings.preview.options.activeSessions',
      help: 'settings.preview.help.activeSessions',
      action: 'settings.preview.values.see',
    },
    {
      label: 'settings.preview.options.closeOthers',
      help: 'settings.preview.help.closeOthers',
      action: 'settings.preview.values.close',
    },
  ],
  privacy: [
    {
      label: 'settings.preview.options.export',
      help: 'settings.preview.help.export',
      action: 'settings.preview.values.request',
    },
    {
      label: 'settings.preview.options.deleteAccount',
      help: 'settings.preview.help.deleteAccount',
      action: 'settings.preview.values.delete',
    },
  ],
  accessibility: [
    { label: 'settings.preview.options.textSize', help: 'settings.preview.help.textSize', meter: 5 },
    {
      label: 'settings.preview.options.gate',
      help: 'settings.preview.help.gate',
      toggle: 'settings.preview.values.yes',
    },
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

/**
 * Qué hará cada opción de la sección (tercer pase del jurado, J3r), en el panel: filas con índice, como
 * las reglas de «Cómo se juega», en el orden de las placas de la cuña. Son la versión en palabras de la
 * vista previa (que es dibujo) y, en escritorio, se reparten el alto del panel, que llega a la barra.
 */
export function SettingsOptionsHelp({ section }: { section: SettingsSectionKey }) {
  const titleId = useId()
  return (
    <section className="settings-help" aria-labelledby={titleId}>
      <h2 id={titleId} className={cx('bb-label', 'settings-help-title')}>
        {t('settings.preview.helpTitle')}
      </h2>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ol role="list" className="settings-help-list">
        {PREVIEW[section].map((option, index) => (
          <li key={option.label} className="settings-help-row">
            <span className="settings-help-index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <p>
              <b>{t(option.label)}.</b> {t(option.help)}
            </p>
          </li>
        ))}
      </ol>
    </section>
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

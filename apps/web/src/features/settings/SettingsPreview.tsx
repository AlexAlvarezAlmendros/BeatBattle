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
 * La pieza de Opciones en la cuña (§3.8.14; pases del jurado de la tarea 0.28): las placas de la sección
 * en vista previa, quietas, en un tablero opaco (como la ventana de opciones de un juego) con su pie
 * «Vista previa: … todavía no hacen nada». El tablero y cada placa van a su alto natural (no se estiran
 * para llenar la columna): el nombre en display, como las placas del menú en reposo, y el valor o el
 * medidor a su lado, más grandes que un rótulo. Las placas son dibujo (`aria-hidden`): lo que tendrá la
 * sección ya lo dice en palabras el panel, y el pie lo cuenta a los lectores de pantalla. El tablero es
 * opaco (la cuña lleva trama, `RD-VIS-05`) y tapa el granate que dejaban ver las secciones de dos
 * placas (≤ 24,5 % a 1440 px, §3.8.14).
 */
export function SettingsPreview({ section }: { section: SettingsSectionKey }) {
  const captionId = useId()
  return (
    <figure
      {...frameAttributes({ cut: 'base' })}
      className="settings-preview"
      data-settings-preview={section}
      aria-labelledby={captionId}
    >
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className="settings-preview-list" aria-hidden="true">
        {PREVIEW[section].map((option) => (
          <li key={option.label} {...frameAttributes({ cut: 'md' })} className="settings-preview-option">
            <span className={cx('bb-display', 'settings-preview-label')}>{t(option.label)}</span>
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
 * Qué hará cada opción de la sección (§3.8.14), en el panel: filas densas con índice, como las reglas
 * de «Cómo se juega» y las de `05-perfil` (el nombre en display y una línea de explicación), en el orden
 * de las placas de la cuña. Son la versión en palabras de la vista previa, que es dibujo.
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
            <p className="settings-help-body">
              <b className={cx('bb-display', 'settings-help-name')}>{t(option.label)}</b>
              <span className="settings-help-text">{t(option.help)}</span>
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
      <span className="settings-preview-meter">
        <Meter
          value={option.meter}
          max={METER_STEPS}
          width={METER_WIDTH}
          label={t(option.label)}
          valueText={t('settings.preview.meterValue', { value: option.meter, max: METER_STEPS })}
        />
        <span className="settings-preview-number">{option.meter}</span>
      </span>
    )
  }
  if ('toggle' in option) {
    return (
      <span className="settings-preview-toggle">
        <Arrow side="left" />
        {t(option.toggle)}
        <Arrow side="right" />
      </span>
    )
  }
  return (
    <span className="settings-preview-action">
      {t(option.action)}
      <Arrow side="right" />
    </span>
  )
}

/**
 * Flecha del conmutador («◀ SÍ ▶») o de la acción («Cambiar ▸»): un triángulo en SVG pintado con el
 * color del texto (`currentColor`). Antes era un fondo recortado con `clip-path`, y el contraste alto
 * quita los fondos: las flechas desaparecían (tercer pase del jurado, L13a). Así toman el color de
 * texto del sistema.
 */
function Arrow({ side }: { side: 'left' | 'right' }) {
  return (
    <svg
      className="settings-preview-arrow"
      data-side={side}
      viewBox="0 0 2 3"
      aria-hidden="true"
      focusable="false"
    >
      <path d={side === 'left' ? 'M2 0 0 1.5 2 3Z' : 'M0 0 2 1.5 0 3Z'} />
    </svg>
  )
}

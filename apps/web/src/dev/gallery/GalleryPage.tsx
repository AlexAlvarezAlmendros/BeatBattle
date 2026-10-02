import { t } from '../../i18n'
import { PlaceholderPage } from '../../pages/PlaceholderPage'

/**
 * `/dev/galeria` — galería de componentes (`RD-VIS-03`), solo en desarrollo: la ruta no existe en la
 * construcción de producción. La tarea 0.9 la llena con los tokens y los componentes base.
 */
export function GalleryPage() {
  return <PlaceholderPage title={t('dev.gallery.title')} summary={t('dev.gallery.summary')} />
}

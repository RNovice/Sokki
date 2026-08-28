import { t } from '../i18n'
import { Icon } from './Icon'

interface Props {
  title: string
  showBack: boolean
  onBack: () => void
  canShare: boolean
  onShare: () => void
  onSettings: () => void
}

export function TopBar({ title, showBack, onBack, canShare, onShare, onSettings }: Props) {
  return (
    <header class="topbar">
      {showBack ? (
        <button class="quiet icon-only" onClick={onBack} aria-label={t('common.back')}>
          <Icon name="back" />
        </button>
      ) : null}
      <h1 class="grow">{title}</h1>
      {canShare ? (
        <button class="quiet icon-only" onClick={onShare} aria-label={t('share.title')}>
          <Icon name="share" />
        </button>
      ) : null}
      <button class="quiet icon-only" onClick={onSettings} aria-label={t('common.settings')}>
        <Icon name="settings" />
      </button>
    </header>
  )
}

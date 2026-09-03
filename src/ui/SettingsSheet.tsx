import { THEME_NAMES } from '../theme/apply'
import type { Locale, Settings, ThemeName } from '../core/types'
import { t } from '../i18n'
import { useEscapeToClose } from './CardModal'
import { SelectField, ToggleField } from './Field'
import { Icon } from './Icon'

interface Props {
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  /** Only offered when there is something to tidy; see the button below. */
  hasRecent: boolean
  onManageRecent: () => void
  onClose: () => void
}

/**
 * Only what belongs to the person: language, theme, whether swipe is on.
 * Anything that shapes a round lives on the deck's own screen, where choosing
 * it cannot destroy a round already under way.
 */
export function SettingsSheet({
  settings,
  onSettings,
  hasRecent,
  onManageRecent,
  onClose,
}: Props) {
  useEscapeToClose(onClose)

  return (
    <div
      class="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="sheet" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div class="sheet-head">
          <h2>{t('settings.title')}</h2>
          <button class="quiet icon-only" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>

        <div class="field-group">
          <SelectField
            name="locale"
            label={t('settings.language')}
            value={settings.locale}
            onChange={(value) => onSettings({ locale: value as Locale })}
          >
            <option value="zh-Hant">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </SelectField>

          <SelectField
            name="theme"
            label={t('settings.theme')}
            value={settings.theme}
            onChange={(value) => onSettings({ theme: value as ThemeName | 'system' })}
          >
            <option value="system">{t('theme.system')}</option>
            {THEME_NAMES.map((name) => (
              <option key={name} value={name}>
                {t(`theme.${name}`)}
              </option>
            ))}
          </SelectField>

          <ToggleField
            name="swipe"
            label={t('settings.swipe')}
            checked={settings.swipeEnabled}
            onChange={(checked) => onSettings({ swipeEnabled: checked })}
          />
        </div>

        {/*
          Only when there is something to tidy. A control that does nothing is
          worse than an absent one, and this is the only place the app admits to
          keeping anything, so it should appear exactly when that is true.

          It opens a list rather than emptying one. The button that emptied it
          outright was one tap from destroying the only record of which sheets
          have been opened, and was also the only way to remove anything — so it
          was what people reached for to remove one thing.
        */}
        {hasRecent ? (
          <div class="row">
            <button class="quiet" onClick={onManageRecent}>
              {t('settings.clearRecent')}
            </button>
          </div>
        ) : null}

      </div>
    </div>
  )
}

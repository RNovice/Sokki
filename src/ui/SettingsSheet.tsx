import { THEME_NAMES } from '../theme/apply'
import type { Locale, Settings, ThemeName } from '../core/types'
import { t } from '../i18n'
import { useEscapeToClose } from './CardModal'
import { SelectField, ToggleField } from './Field'
import { Icon } from './Icon'

interface Props {
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  onClose: () => void
}

/**
 * Only what belongs to the person: language, theme, whether swipe is on.
 * Anything that shapes a round lives on the deck's own screen, where choosing
 * it cannot destroy a round already under way.
 */
export function SettingsSheet({ settings, onSettings, onClose }: Props) {
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
            label={t('settings.language')}
            value={settings.locale}
            onChange={(value) => onSettings({ locale: value as Locale })}
          >
            <option value="zh-Hant">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </SelectField>

          <SelectField
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
            label={t('settings.swipe')}
            checked={settings.swipeEnabled}
            onChange={(checked) => onSettings({ swipeEnabled: checked })}
          />
        </div>

      </div>
    </div>
  )
}

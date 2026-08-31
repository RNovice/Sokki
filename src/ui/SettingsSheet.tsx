import { THEME_NAMES } from '../theme/apply'
import type { DeckPrefs, Direction, Locale, Settings, ThemeName } from '../core/types'
import { t } from '../i18n'
import { useEscapeToClose } from './CardModal'
import { SelectField, ToggleField } from './Field'
import { Icon } from './Icon'

const DIRECTIONS: Direction[] = ['front-back', 'back-front', 'mixed']

interface Props {
  settings: Settings
  prefs: DeckPrefs | null
  deckSize: number
  onSettings: (patch: Partial<Settings>) => void
  onPrefs: (patch: Partial<DeckPrefs>) => void
  onClose: () => void
}

export function SettingsSheet({
  settings,
  prefs,
  deckSize,
  onSettings,
  onPrefs,
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

        {prefs ? (
          <>
            <span class="section-label">{t('settings.deckSection')}</span>
            <div class="field-group">
              <SelectField
                label={t('settings.direction')}
                value={prefs.direction}
                onChange={(value) => onPrefs({ direction: value as Direction })}
              >
                {DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`direction.${d}`)}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label={t('settings.count')}
                value={String(prefs.count)}
                onChange={(value) => onPrefs({ count: Number(value) })}
              >
                <option value="0">{t('settings.countAll')}</option>
                {[10, 20, 30, 50, 100]
                  .filter((n) => n < deckSize)
                  .map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
              </SelectField>

              <ToggleField
                label={t('settings.shuffle')}
                checked={prefs.shuffle}
                onChange={(checked) => onPrefs({ shuffle: checked })}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

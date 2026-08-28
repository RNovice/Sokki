import { THEME_NAMES } from '../theme/apply'
import type { DeckPrefs, Direction, Locale, Settings, ThemeName } from '../core/types'
import { t } from '../i18n'
import { useEscapeToClose } from './CardModal'
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
          <label>
            <span class="label-text">{t('settings.language')}</span>
            <select
              value={settings.locale}
              onChange={(e) =>
                onSettings({ locale: (e.target as HTMLSelectElement).value as Locale })
              }
            >
              <option value="zh-Hant">繁體中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>

          <label>
            <span class="label-text">{t('settings.theme')}</span>
            <select
              value={settings.theme}
              onChange={(e) =>
                onSettings({
                  theme: (e.target as HTMLSelectElement).value as ThemeName | 'system',
                })
              }
            >
              <option value="system">{t('theme.system')}</option>
              {THEME_NAMES.map((name) => (
                <option key={name} value={name}>
                  {t(`theme.${name}`)}
                </option>
              ))}
            </select>
          </label>

          <div>
            <label class="switch">
              <span>{t('settings.swipe')}</span>
              <input
                type="checkbox"
                checked={settings.swipeEnabled}
                onChange={(e) =>
                  onSettings({ swipeEnabled: (e.target as HTMLInputElement).checked })
                }
              />
            </label>
            <p class="muted">{t('settings.swipeNote')}</p>
          </div>
        </div>

        {prefs ? (
          <>
            <span class="section-label">{t('settings.deckSection')}</span>
            <div class="field-group">
              <label>
                <span class="label-text">{t('settings.direction')}</span>
                <select
                  value={prefs.direction}
                  onChange={(e) =>
                    onPrefs({ direction: (e.target as HTMLSelectElement).value as Direction })
                  }
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {t(`direction.${d}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span class="label-text">{t('settings.count')}</span>
                <select
                  value={String(prefs.count)}
                  onChange={(e) =>
                    onPrefs({ count: Number((e.target as HTMLSelectElement).value) })
                  }
                >
                  <option value="0">{t('settings.countAll')}</option>
                  {[10, 20, 30, 50, 100].filter((n) => n < deckSize).map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <label class="switch">
                  <span>{t('settings.shuffle')}</span>
                  <input
                    type="checkbox"
                    checked={prefs.shuffle}
                    onChange={(e) =>
                      onPrefs({ shuffle: (e.target as HTMLInputElement).checked })
                    }
                  />
                </label>
                <p class="muted">{t('settings.shuffleNote')}</p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

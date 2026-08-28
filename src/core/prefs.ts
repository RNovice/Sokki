/**
 * Settings, split by whether they belong to the person or to the deck.
 *
 * Language and theme are the person's: nobody switches language because they
 * opened a different deck. Direction, round size and shuffle are the deck's:
 * 日→中 and 中→日 are different exercises, and a sensible round for a 20-card
 * deck is not a sensible round for a 500-card one.
 */

import { readJson, writeJson } from './storage'
import {
  DEFAULT_PREFS,
  DEFAULT_SETTINGS,
  type DeckPrefs,
  type Direction,
  type Locale,
  type Settings,
  type ThemeName,
} from './types'

const LOCALES: readonly Locale[] = ['zh-Hant', 'en', 'ja']
const THEMES: readonly (ThemeName | 'system')[] = [
  'system',
  'light',
  'dark',
  'sepia',
  'forest',
  'ocean',
  'plum',
  'sand',
  'slate',
  'rose',
  'mono',
]
const DIRECTIONS: readonly Direction[] = ['front-back', 'back-front', 'mixed']

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Partial<Settings>
  return (
    isLocale(s.locale) &&
    typeof s.theme === 'string' &&
    (THEMES as readonly string[]).includes(s.theme) &&
    typeof s.swipeEnabled === 'boolean'
  )
}

function isPrefs(value: unknown): value is DeckPrefs {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Partial<DeckPrefs>
  return (
    typeof p.direction === 'string' &&
    (DIRECTIONS as readonly string[]).includes(p.direction) &&
    typeof p.count === 'number' &&
    p.count >= 0 &&
    typeof p.shuffle === 'boolean'
  )
}

/** Best guess before the user has chosen, from what the browser already knows. */
export function detectLocale(): Locale {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of candidates) {
    const lower = (tag ?? '').toLowerCase()
    if (lower.startsWith('ja')) return 'ja'
    // Simplified Chinese has no UI of its own yet; Traditional is the closer fit.
    if (lower.startsWith('zh')) return 'zh-Hant'
    if (lower.startsWith('en')) return 'en'
  }
  return 'zh-Hant'
}

export function loadSettings(): Settings {
  const saved = readJson('settings', isSettings)
  if (saved) return saved
  return { ...DEFAULT_SETTINGS, locale: detectLocale() }
}

export function saveSettings(settings: Settings): void {
  writeJson('settings', settings)
}

export function loadPrefs(deckKey: string): DeckPrefs {
  return readJson(`prefs:${deckKey}`, isPrefs) ?? { ...DEFAULT_PREFS }
}

export function savePrefs(deckKey: string, prefs: DeckPrefs): void {
  writeJson(`prefs:${deckKey}`, prefs)
}

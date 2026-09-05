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
  'sakura',
  'coral',
  'steel',
  'terminal',
  'amber',
  'dracula',
  'matcha',
]
/** Exported so the message test can walk the same list the validator does. */
export const DIRECTIONS: readonly Direction[] = ['front-back', 'back-front', 'mixed']

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Note what is *not* checked here: whether the theme still exists. A theme that
 * has been removed must not invalidate the whole record — falling through to
 * the defaults would reset the reader's language and swipe preference too, and
 * neither of those has anything to do with a palette going away. loadSettings
 * resolves the theme separately, below.
 */
function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Partial<Settings>
  return isLocale(s.locale) && typeof s.theme === 'string' && typeof s.swipeEnabled === 'boolean'
}

function isTheme(value: unknown): value is ThemeName | 'system' {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

function isPrefs(value: unknown): value is DeckPrefs {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Partial<DeckPrefs>
  return (
    typeof p.direction === 'string' &&
    (DIRECTIONS as readonly string[]).includes(p.direction) &&
    typeof p.count === 'number' &&
    p.count >= 0 &&
    typeof p.shuffle === 'boolean' &&
    // Absent is valid: preferences saved before these fields existed still
    // load, and loadPrefs fills the defaults in. A deck with no name of its
    // own is also the normal case, not a missing value.
    (p.markdown === undefined || typeof p.markdown === 'boolean') &&
    (p.name === undefined || typeof p.name === 'string')
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
  return 'en'
}

export function loadSettings(): Settings {
  const saved = readJson('settings', isSettings)
  if (!saved) return { ...DEFAULT_SETTINGS, locale: detectLocale() }
  // A theme that no longer exists resolves to "match system" and takes nothing
  // else with it.
  return isTheme(saved.theme) ? saved : { ...saved, theme: 'system' }
}

export function saveSettings(settings: Settings): void {
  writeJson('settings', settings)
}

export function loadPrefs(deckKey: string): DeckPrefs {
  // Merged over the defaults rather than returned as found, so a record written
  // by an older build gains any field added since instead of arriving with a
  // hole in it that the type says cannot be there.
  const saved = readJson(`prefs:${deckKey}`, isPrefs)
  return saved ? { ...DEFAULT_PREFS, ...saved } : { ...DEFAULT_PREFS }
}

export function savePrefs(deckKey: string, prefs: DeckPrefs): void {
  writeJson(`prefs:${deckKey}`, prefs)
}

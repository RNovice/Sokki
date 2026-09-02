/**
 * Applying a theme is one attribute on <html> — every colour follows through
 * the tokens in themes.css.
 *
 * The one thing that cannot be done here is the *first* paint: a module runs
 * after the document has already been painted once, so the theme would flash.
 * The inline script in index.html handles that, and this file only takes over
 * once the app is running. The two must agree on the attribute name and the
 * storage key, which is why both are stated here.
 */

import type { ThemeName } from '../core/types'

export const THEME_ATTRIBUTE = 'data-theme'
export const THEME_STORAGE_KEY = 'sokki:settings'

/**
 * Drives the mobile browser chrome. Wrong values here are very visible: an
 * address bar in the light colour above a dark page reads as a rendering bug.
 */
const THEME_COLORS: Record<ThemeName, string> = {
  light: '#f6f7f5',
  dark: '#0f1315',
  sepia: '#f2e9d7',
  sakura: '#fcd9e8',
  coral: '#ece7e3',
  steel: '#e7ecf1',
  terminal: '#080b09',
  amber: '#f9c294',
  dracula: '#221b33',
  matcha: '#dfe9c8',
}

export const THEME_NAMES = Object.keys(THEME_COLORS) as ThemeName[]

export function applyTheme(theme: ThemeName | 'system'): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute(THEME_ATTRIBUTE)
  } else {
    root.setAttribute(THEME_ATTRIBUTE, theme)
  }
  updateThemeColor(theme)
}

function updateThemeColor(theme: ThemeName | 'system'): void {
  const resolved: ThemeName =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = THEME_COLORS[resolved]
}

/** Keep the chrome colour in step while the theme is left on "match system". */
export function watchSystemTheme(getTheme: () => ThemeName | 'system'): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getTheme() === 'system') updateThemeColor('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

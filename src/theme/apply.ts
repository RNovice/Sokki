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
 * Each theme's `--bg`, repeated here because two things need it before or
 * outside the stylesheet: the mobile browser chrome, and the page canvas.
 *
 * Wrong values are very visible either way — an address bar in the light colour
 * above a dark page reads as a rendering bug, and a stale ground shows as a
 * band of the wrong colour under a page that scrolls. themes.test.ts checks
 * this map against themes.css so the copies cannot drift.
 */
export const THEME_COLORS: Record<ThemeName, string> = {
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
  paintGround(theme)
}

/**
 * The chrome colour and the page canvas, for a theme that is now in force.
 *
 * The canvas half is the non-obvious one. index.html sets an inline background
 * on <html> so that the first paint is not white, and an inline background on
 * <html> is exactly what the CSS background-propagation rule looks for: with
 * one present, the canvas takes <html>'s colour and `body { background }` stops
 * propagating. So that first-paint value became the whole page's ground for the
 * rest of the session — correct until the reader changed theme, after which
 * `body` painted the new colour over its own box only and everything past it
 * stayed the colour the page had loaded in. It showed up as a band of the old
 * theme below a result page long enough to scroll.
 *
 * Keeping the inline value in step is a line; removing it and letting `body`
 * propagate again would also work, but only until the next thing that reads the
 * ground before the stylesheet lands.
 */
function paintGround(theme: ThemeName | 'system'): void {
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
  document.documentElement.style.background = THEME_COLORS[resolved]
}

/** Keep the chrome colour in step while the theme is left on "match system". */
export function watchSystemTheme(getTheme: () => ThemeName | 'system'): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getTheme() === 'system') paintGround('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

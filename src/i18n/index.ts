/**
 * Translation, without a library.
 *
 * The interface has roughly seventy strings. `i18next` plus its bindings is
 * about 40 KB gzipped — two thirds of the entire budget for this app — to do
 * what a lookup table, a `{token}` replace and `Intl.PluralRules` do in a
 * kilobyte. Locales load on demand, so a reader of one language never
 * downloads the other two.
 *
 * Language is deliberately not carried in the share URL: someone who receives
 * a deck should see it in their own language, not the sender's.
 */

import type { Locale } from '../core/types'
import zhHant from './zh-Hant'

export type Dict = Record<string, string>

const loaders: Record<Locale, () => Promise<{ default: Dict }>> = {
  'zh-Hant': async () => ({ default: zhHant }),
  en: () => import('./en'),
  ja: () => import('./ja'),
}

// zh-Hant is bundled rather than split: it is the default for most visitors,
// and a round trip before first paint would cost more than the strings weigh.
let dict: Dict = zhHant
let active: Locale = 'zh-Hant'
const listeners = new Set<() => void>()

export function currentLocale(): Locale {
  return active
}

export async function useLocale(locale: Locale): Promise<void> {
  if (locale === active) return
  try {
    const loaded = await loaders[locale]()
    dict = loaded.default
    active = locale
    document.documentElement.lang = locale
    for (const listener of listeners) listener()
  } catch {
    // A failed chunk load must not blank the interface; stay on what works.
  }
}

export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Missing keys return the key itself. That makes a gap obvious in the
 * interface during development without throwing at a user.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = dict[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, token: string) =>
    token in params ? String(params[token]) : whole,
  )
}

/**
 * Plural forms, looked up as `key.one` / `key.other` and so on. Chinese and
 * Japanese only ever select `other`, which is exactly the behaviour wanted.
 */
export function tp(key: string, count: number, params?: Record<string, string | number>): string {
  const category = new Intl.PluralRules(active).select(count)
  const withCategory = dict[`${key}.${category}`] ?? dict[`${key}.other`]
  const template = withCategory ?? key
  return template.replace(/\{(\w+)\}/g, (whole, token: string) => {
    if (token === 'n') return formatNumber(count)
    return params && token in params ? String(params[token]) : whole
  })
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(active).format(value)
}

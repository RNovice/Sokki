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
 *
 * There is no subscription to a locale change, deliberately. `loadLocale`
 * returns a promise and App bumps a counter when it settles, which the memos
 * that call t() depend on. A listener set would be a second mechanism for the
 * same thing, and one of the two would rot.
 */

import type { Locale } from '../core/types'
import en from './en'

export type Dict = Record<string, string>

const loaders: Record<Locale, () => Promise<{ default: Dict }>> = {
  en: async () => ({ default: en }),
  'zh-Hant': () => import('./zh-Hant'),
  ja: () => import('./ja'),
}

/*
 * English is bundled rather than split, and the other two are fetched.
 *
 * Whichever language is bundled is the one shown for the moment before the
 * reader's own arrives, because `dict` starts as that one — including in the
 * document title, which is why the tab used to flicker through Chinese for
 * everybody. English is the better thing to flicker through: it is the widest
 * fallback, it is what the static shell in index.html is written in, and it is
 * what a crawler indexes.
 */
let dict: Dict = en
let active: Locale = 'en'

/**
 * Named `loadLocale`, not `useLocale`: it is an ordinary async function, not a
 * hook. The `use` prefix is a contract — it promises the caller may only call
 * it at the top level of a component — and this one has no such requirement.
 * A linter that believes the prefix reports the correct call site as an error.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  if (locale === active) return
  try {
    const loaded = await loaders[locale]()
    dict = loaded.default
    active = locale
    document.documentElement.lang = locale
  } catch {
    // A failed chunk load must not blank the interface; stay on what works.
  }
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

/**
 * Units from largest to smallest; the first one the gap reaches is the one to
 * say it in. "2 days ago" rather than "48 hours ago".
 */
const DIVISIONS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/**
 * "3 days ago", in the reader's language.
 *
 * Intl does the whole job, so this needs no translations of its own and adds
 * nothing to the three locale files — and `numeric: 'auto'` gets the idiomatic
 * forms for free: 昨天, yesterday, 昨日 rather than "1 day ago" three times.
 */
export function formatRelativeTime(then: number, now = Date.now()): string {
  const format = new Intl.RelativeTimeFormat(active, { numeric: 'auto' })
  const delta = then - now
  for (const [unit, ms] of DIVISIONS) {
    if (Math.abs(delta) >= ms) return format.format(Math.round(delta / ms), unit)
  }
  // Anything under a minute is "now" / 現在 / 今 — seconds are noise here.
  return format.format(0, 'second')
}

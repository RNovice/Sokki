import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from './i18n/en'
import ja from './i18n/ja'
import zhHant from './i18n/zh-Hant'

/**
 * Reads the built manifest, so this checks what actually ships rather than the
 * config that was meant to produce it. It only runs after a build; skipped
 * otherwise, because a test that fails on a clean checkout teaches people to
 * ignore failures.
 */
const built = (() => {
  try {
    return JSON.parse(
      readFileSync(fileURLToPath(new URL('../dist/manifest.webmanifest', import.meta.url)), 'utf8'),
    ) as Record<string, unknown>
  } catch {
    return null
  }
})()

describe.skipIf(built === null)('installed app name', () => {
  it('says the same thing the interface says, in every language', () => {
    // Two copies of the app's own name would drift, and the one on the home
    // screen is the copy nobody thinks to check.
    expect(built!.name).toBe(zhHant['app.name'])
    expect(built!.name_localized).toEqual({ en: en['app.name'], ja: ja['app.name'] })
    expect(built!.description).toBe(zhHant['app.tagline'])
    expect(built!.description_localized).toEqual({
      en: en['app.tagline'],
      ja: ja['app.tagline'],
    })
  })

  it('declares what language the unlocalized values are in', () => {
    // Without `lang`, a browser cannot tell that the fallback is Traditional
    // Chinese rather than whatever it happens to prefer.
    expect(built!.lang).toBe('zh-Hant')
  })

  it('covers every locale the interface offers', () => {
    const offered = new Set(['en', 'ja'])
    expect(new Set(Object.keys(built!.name_localized as object))).toEqual(offered)
  })
})

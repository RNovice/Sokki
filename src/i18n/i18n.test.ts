import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from './en'
import ja from './ja'
import zhHant from './zh-Hant'

const LOCALES = { 'zh-Hant': zhHant, en, ja } as Record<string, Record<string, string>>

/**
 * Traditional Chinese and Japanese share most characters but not all of them,
 * and the ones that differ are exactly the ones that look right to someone
 * reading the other language. 県 and 庁 are Japanese forms; 縣 and 廳 are the
 * Traditional ones. Writing a Chinese label with Japanese kanji is the sort of
 * thing that survives review and then gets noticed by a reader.
 */
const SHINJITAI_TO_TRADITIONAL: Record<string, string> = {
  県: '縣', 庁: '廳', 図: '圖', 学: '學', 読: '讀', 気: '氣', 転: '轉', 覚: '覺',
  発: '發', 検: '檢', 実: '實', 対: '對', 応: '應', 関: '關', 単: '單', 験: '驗',
  経: '經', 済: '濟', 数: '數', 楽: '樂', 帰: '歸', 会: '會', 体: '體', 売: '賣',
  変: '變', 続: '續', 点: '點', 画: '畫', 当: '當', 広: '廣', 駅: '驛', 様: '樣',
  価: '價', 来: '來', 説: '說', 鉄: '鐵', 訳: '譯', 観: '觀', 薬: '藥', 静: '靜',
}

const TRADITIONAL_TO_SHINJITAI = Object.fromEntries(
  Object.entries(SHINJITAI_TO_TRADITIONAL).map(([shin, trad]) => [trad, shin]),
)

function offendingCharacters(
  strings: Record<string, string>,
  table: Record<string, string>,
): string[] {
  const found: string[] = []
  for (const [key, value] of Object.entries(strings)) {
    for (const char of value) {
      const better = table[char]
      if (better) found.push(`${key}: ${char} should be ${better}`)
    }
  }
  return found
}

describe('script correctness', () => {
  it('writes Traditional Chinese without Japanese character forms', () => {
    expect(offendingCharacters(zhHant, SHINJITAI_TO_TRADITIONAL)).toEqual([])
  })

  it('writes Japanese without Traditional Chinese character forms', () => {
    expect(offendingCharacters(ja, TRADITIONAL_TO_SHINJITAI)).toEqual([])
  })
})

describe('coverage', () => {
  /** `foo.one` and `foo.other` are one message; only English needs both. */
  const family = (key: string) => key.replace(/\.(zero|one|two|few|many|other)$/, '')
  const families = (strings: Record<string, string>) =>
    new Set(Object.keys(strings).map(family))

  const reference = families(zhHant)

  it.each(Object.keys(LOCALES))('%s translates every message', (locale) => {
    const missing = [...reference].filter((f) => !families(LOCALES[locale]!).has(f))
    expect(missing).toEqual([])
  })

  it.each(Object.keys(LOCALES))('%s adds no message the others lack', (locale) => {
    const extra = [...families(LOCALES[locale]!)].filter((f) => !reference.has(f))
    expect(extra).toEqual([])
  })

  /**
   * Key families the interface assembles at the call site rather than writing
   * out — `error.${reason}.hint`, `theme.${name}`. Listing them here is the
   * point as much as the test is: these are the strings a plain search for
   * their name will not find.
   */
  const ASSEMBLED_AT_RUNTIME = ['error.', 'theme.', 'direction.', 'deck.']

  const sourceText = () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    return readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && !f.includes('i18n/'))
      .map((f) => readFileSync(join(root, f), 'utf8'))
      .join('\n')
  }

  it('translates every message the interface names outright', () => {
    // The failure this catches is the visible one: a missing string renders as
    // its own key, in front of the reader.
    const asked = [...sourceText().matchAll(/\bt[p]?\(\s*'([a-z][\w.-]*)'/gi)].map((m) => m[1]!)
    const unknown = [...new Set(asked)].filter((key) => !reference.has(family(key)))
    expect(unknown).toEqual([])
  })

  it('keeps no message the interface never asks for', () => {
    const source = sourceText()
    const orphaned = [...reference].filter(
      (key) =>
        !source.includes(key) && !ASSEMBLED_AT_RUNTIME.some((prefix) => key.startsWith(prefix)),
    )
    expect(orphaned).toEqual([])
  })
})

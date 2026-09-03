import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEME_COLORS, THEME_NAMES } from './apply'

/**
 * Ten palettes cannot be checked by eye — something will be missed, and what
 * gets missed is text nobody can read. This parses the stylesheet and does the
 * arithmetic, so a theme that fails WCAG AA cannot reach a build.
 *
 * It also enforces that every theme defines every token: a palette that quietly
 * inherits one colour from the light default is how a dark theme ends up with
 * dark text on a dark ground.
 */

const CSS = readFileSync(fileURLToPath(new URL('./themes.css', import.meta.url)), 'utf8')

const TOKENS = [
  '--bg',
  '--surface',
  '--raised',
  '--ink',
  '--muted',
  '--hairline',
  '--accent',
  '--accent-ink',
  '--good',
  '--good-soft',
  '--bad',
  '--bad-soft',
  '--good-ink',
  '--bad-ink',
] as const

type Palette = Record<(typeof TOKENS)[number], string>

function blockFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS)
  if (!match?.[1]) throw new Error(`no CSS block for ${selector}`)
  return match[1]
}

function paletteFrom(selector: string): Partial<Palette> {
  const body = blockFor(selector)
  const palette: Partial<Palette> = {}
  for (const token of TOKENS) {
    const found = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(body)
    if (found?.[1]) palette[token] = found[1].trim()
  }
  return palette
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter! + 0.05) / (darker! + 0.05)
}

/** WCAG AA for text below 18pt. */
const AA = 4.5

const SELECTORS: Record<string, string> = Object.fromEntries(
  THEME_NAMES.map((name) => [name, `:root[data-theme='${name}']`]),
)

describe('theme tokens', () => {
  it.each(THEME_NAMES)('%s defines every token', (theme) => {
    const palette = paletteFrom(SELECTORS[theme]!)
    const missing = TOKENS.filter((token) => !palette[token])
    expect(missing).toEqual([])
  })

  it('the bare :root carries a complete light palette for the un-stamped state', () => {
    // Most visitors leave the theme on "match system", which stamps no
    // attribute at all — so :root has to stand on its own.
    const palette = paletteFrom(':root')
    expect(TOKENS.filter((token) => !palette[token])).toEqual([])
  })

  it('the dark media override is guarded so an explicit theme still wins', () => {
    expect(CSS).toContain(':root:not([data-theme])')
  })
})

/**
 * --bg is written down three times: here in themes.css, in apply.ts, and in the
 * inline script in index.html. It has to be, because two of the three consumers
 * need the colour before or outside the cascade — the theme-color meta tag and
 * the inline background that paints the canvas before the stylesheet arrives.
 * Copies drift silently, and this one drifts into a page whose ground is one
 * theme and whose text is another.
 */
describe('the ground colour, in all the places it is written', () => {
  it.each(THEME_NAMES)('%s: apply.ts agrees with themes.css', (theme) => {
    expect(THEME_COLORS[theme]).toBe(paletteFrom(SELECTORS[theme]!)['--bg'])
  })

  it("index.html's pre-paint script agrees with both", () => {
    // Parsed rather than eyeballed: this script runs before anything else and
    // is the only thing standing between a dark theme and a white flash.
    const script = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')
    for (const theme of THEME_NAMES) {
      const found = new RegExp(`${theme}\\s*:\\s*'([^']+)'`).exec(script)?.[1]
      expect(found, theme).toBe(THEME_COLORS[theme])
    }
  })
})

describe('contrast', () => {
  const pairs: [keyof Palette, keyof Palette, string][] = [
    ['--ink', '--bg', 'body text on the page'],
    ['--ink', '--surface', 'body text on a panel'],
    ['--ink', '--raised', 'card text'],
    ['--muted', '--bg', 'secondary text on the page'],
    ['--muted', '--surface', 'secondary text on a panel'],
    ['--accent-ink', '--accent', 'label on a primary button'],
    ['--good', '--bg', 'the "knew it" colour'],
    ['--bad', '--bg', 'the "did not know" colour'],
    // The armed swipe target fills solid, so the label sits on the semantic
    // colour itself.
    ['--good-ink', '--good', 'the armed "knew it" button'],
    ['--bad-ink', '--bad', 'the armed "did not know" button'],
    // The error notice is the one place a soft tint is a text background
    // rather than a wash behind a card, so it is a text pairing too.
    ['--ink', '--bad-soft', 'the text of an error notice'],
  ]

  it.each(THEME_NAMES)('%s passes AA on every text pairing', (theme) => {
    const palette = paletteFrom(SELECTORS[theme]!) as Palette
    const failures = pairs
      .map(([fg, bg, what]) => ({ what, ratio: contrast(palette[fg], palette[bg]) }))
      .filter(({ ratio }) => ratio < AA)
      .map(({ what, ratio }) => `${what}: ${ratio.toFixed(2)}`)
    expect(failures).toEqual([])
  })
})

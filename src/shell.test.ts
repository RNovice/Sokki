import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from './i18n/en'
import { DEFAULT_SETTINGS } from './core/types'

/**
 * index.html carries things the app also produces at runtime — the page title,
 * the landing page's own markup, the ground colour of every theme. Each of
 * those is a second copy, and a second copy drifts. The failures it causes are
 * quiet ones: a tab that flickers, a page that shifts, a flash of white on a
 * dark theme. This is where they are caught.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')

/** Only present after a build: the shell is injected, not written by hand. */
const BUILT = (() => {
  try {
    return readFileSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)), 'utf8')
  } catch {
    return null
  }
})()

describe('the document the browser is served', () => {
  it('titles the page exactly as the app will retitle it', () => {
    // The app rewrites document.title on mount. Any difference here is a
    // visible flicker in the tab for every reader on the default locale.
    const title = /<title>([^<]*)<\/title>/.exec(SOURCE)?.[1]
    expect(title).toBe(en['app.title'])
  })

  it('declares the language the app actually starts in', () => {
    expect(/<html lang="([^"]+)"/.exec(SOURCE)?.[1]).toBe(DEFAULT_SETTINGS.locale)
  })

  it('paints a ground colour before the stylesheet can', () => {
    // --bg lives in the external CSS. Until it arrives the canvas is the
    // browser's white, and index.html now has content to show against it.
    expect(SOURCE).toMatch(/documentElement\.style\.background/)
  })

  it('has exactly one executable inline script', () => {
    // scripts/seal-csp.mjs hashes it into the CSP and refuses to guess between
    // two. Failing here says so before the build does, and points at the file.
    const inline = [...SOURCE.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter(
      ([, attrs]) => !/type=["']application\/ld\+json["']/.test(attrs ?? ''),
    )
    expect(inline).toHaveLength(1)
  })
})

describe.skipIf(BUILT === null)('the static landing shell', () => {
  it('is there, in the language the app starts in', () => {
    // An empty #app means a crawler sees no words at all, and the first paint
    // waits for the bundle.
    expect(BUILT).toContain(en['app.tagline'])
    expect(BUILT).toContain(en['landing.pasteLabel'])
    expect(BUILT).toContain(en['landing.examples'])
  })

  it('leaves the markup the app renders into', () => {
    // main.tsx empties #app before rendering, so the shell only has to look
    // right — but it has to be inside #app for that emptying to reach it.
    const app = /<div id="app">([\s\S]*?)<\/body>/.exec(BUILT!)?.[1] ?? ''
    expect(app).toContain('class="topbar"')
    expect(app).toContain('class="page"')
  })
})

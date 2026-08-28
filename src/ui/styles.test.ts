import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8')

/**
 * Comments are stripped before anything is matched. These rules explain
 * themselves at length, and prose about a declaration is not a declaration —
 * matching it would let a comment satisfy a test that the CSS does not.
 */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(DECLARATIONS)
  if (!match?.[1]) throw new Error(`no CSS block for ${selector}`)
  return match[1]
}

/**
 * A dragged card enlarges the document's scrollable area even though a
 * transform does not move layout, so the browser offers a horizontal
 * scrollbar. Only ever to the right: overflow past the start edge is not
 * scrollable, which is why the bug looked one-sided and easy to dismiss.
 */
describe('horizontal overflow from the swipe', () => {
  it('is clipped at the app root', () => {
    expect(block('#app')).toMatch(/overflow-x:\s*clip/)
  })

  it('uses clip rather than hidden, which would break the sticky top bar', () => {
    // `overflow-x: hidden` forces overflow-y to compute as `auto`, making #app
    // a scroll container and moving what the top bar sticks to. The fallback
    // for browsers without `clip` is fenced behind @supports for that reason.
    const root = block('#app')
    expect(root).not.toMatch(/overflow-x:\s*hidden/)
    expect(CSS).toContain('@supports not (overflow: clip)')
  })

  it('clips at the root and not around the card, so it slides off the screen edge', () => {
    // Clipping on .card-stage or .quiz would cut the card at an inner boundary
    // partway across the screen, which reads as a rendering fault.
    expect(block('.card-stage')).not.toMatch(/overflow/)
    expect(block('.quiz')).not.toMatch(/overflow/)
  })
})

describe('long answers stay readable', () => {
  it('centres the text with auto margins, not by aligning the flex container', () => {
    // `align-items: center` on a scrolling container puts the start of tall
    // content above scrollTop 0, where nothing can scroll back to it.
    expect(block('.face-text')).toMatch(/margin:\s*auto/)
    const face = block('.card-face')
    expect(face).not.toMatch(/align-items:\s*center/)
    expect(face).not.toMatch(/justify-content:\s*center/)
  })
})

describe('touch targets', () => {
  it('keeps the rating buttons at the minimum comfortable size', () => {
    expect(block('.answers button')).toMatch(/min-height:\s*var\(--tap\)/)
    expect(block(':root')).toMatch(/--tap:\s*48px/)
  })

  it('leaves vertical scrolling to the browser on the card', () => {
    expect(block('.card')).toMatch(/touch-action:\s*pan-y/)
  })

  it('declares pan-y on the face too, which is the element a finger hits', () => {
    // .card-face covers the card and is a scroll container, so the touch-action
    // lookup stops there. Declared only on .card, it has no effect on touch and
    // the swipe works with a mouse but not with a finger.
    expect(block('.card-face')).toMatch(/touch-action:\s*pan-y/)
  })

  it('names both overflow axes on the face, so neither is inferred', () => {
    // Setting overflow-y alone makes overflow-x compute to `auto`, turning the
    // face into a horizontal scroll container as well.
    const face = block('.card-face')
    expect(face).toMatch(/overflow-x:\s*hidden/)
    expect(face).toMatch(/overflow-y:\s*auto/)
  })
})

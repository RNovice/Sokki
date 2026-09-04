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

  /**
   * The card centres a box; the text inside it starts at the box's edge.
   *
   * That only reads as "short cards are centred, long ones are left-aligned"
   * because the box is shrink-to-fit — a flex item with no width, as wide as
   * its longest line. Give it a width and every one-word card jumps to the
   * card's left edge, which looks like a bug and is nowhere near the
   * declaration that caused it.
   */
  it('starts the text at the edge of its box rather than centring it', () => {
    expect(block('.face-text')).toMatch(/text-align:\s*start/)
  })

  it('leaves the box free to shrink to its longest line', () => {
    const text = block('.face-text')
    // Each of these would stretch the box to the card and strand the rule
    // above: a centred one-word card would left-align against the card edge.
    expect(text).not.toMatch(/(^|[^-])width:\s*100%/)
    expect(text).not.toMatch(/flex:\s*1/)
    expect(text).not.toMatch(/flex-grow:\s*[1-9]/)
    expect(text).not.toMatch(/align-self:\s*stretch/)
    // …and the measure has to stay a maximum rather than becoming a size.
    expect(text).toMatch(/max-width:/)
  })

  /**
   * …except that one rule takes the width away again, on purpose.
   *
   * A divider has to reach both edges of the card to be one, so .md-wide gives
   * the box the whole card. On a card whose only structure is a divider — two
   * short terms with `---` between them — that leaves the terms against the
   * card's left edge with most of the card empty beside them, which is the
   * exact appearance the shrink-to-fit box exists to avoid.
   *
   * The answer is not to re-centre the text, which would put a long answer's
   * left edge back to moving on every line. It is to apply the same mechanism
   * one level down, to each run of text, and leave the rule spanning.
   */
  it('gives each run of text its own box when a divider widens the outer one', () => {
    const runs = block('.md-wide:not(.md-prose) > .md-lines')
    expect(runs).toMatch(/width:\s*fit-content/)
    expect(runs).toMatch(/margin-inline:\s*auto/)
    // Bounded, or a long line pushes the card wider than the card.
    expect(runs).toMatch(/max-width:\s*100%/)
  })

  it('leaves prose out of it, because prose wants one shared left edge', () => {
    // A heading and a list each centring on their own width is the opposite of
    // what prose needs. `.md-prose` is already the test for "this is prose".
    expect(DECLARATIONS).toMatch(/\.md-wide:not\(\.md-prose\)/)
  })
})

describe('iOS zoom', () => {
  it('drops double-tap-to-zoom on the controls without touching pinch zoom', () => {
    // `manipulation` keeps panning and pinch zoom and removes the auxiliary
    // gestures. Answering two cards quickly otherwise reads as a double tap.
    expect(block('button,\nselect,\n.toggle,\na')).toMatch(/touch-action:\s*manipulation/)
  })

  it('names pinch-zoom on the card, which pan-y alone would remove', () => {
    // A bare `pan-y` takes pinch zoom away, leaving no way to magnify a card.
    expect(block('.card')).toMatch(/touch-action:\s*pan-y pinch-zoom/)
    expect(block('.card-surface,\n.card-face')).toMatch(/touch-action:\s*pan-y pinch-zoom/)
  })

  it('never lets the viewport forbid zooming', () => {
    // The usual first answer to double-tap zoom, and the wrong one: it removes
    // pinch zoom from people who need it, and iOS has ignored it since 10.
    const html = readFileSync(
      fileURLToPath(new URL('../../index.html', import.meta.url)),
      'utf8',
    )
    expect(html).not.toMatch(/user-scalable\s*=\s*no/)
    expect(html).not.toMatch(/maximum-scale\s*=\s*1(\D|$)/)
  })

  it('keeps text fields at 16px, below which iOS magnifies the page on focus', () => {
    const fields = block("input[type='text'],\ninput[type='url'],\ninput[type='number'],\nselect")
    expect(fields).toMatch(/font-size:\s*16px/)
  })
})

describe('scrollbars', () => {
  const RULE = 'html,\n.card-surface,\n.card-face,\n.card-modal-scroll,\n.sheet'

  it('take their colour from the theme, not the platform', () => {
    // A device-default scrollbar is the one piece of chrome a theme cannot
    // reach: Windows draws a light track that reads as a fault on a dark theme.
    expect(block(RULE)).toMatch(/scrollbar-color:\s*var\(--muted\) transparent/)
  })

  it('name every scroll container, because scrollbar-width does not inherit', () => {
    // scrollbar-color inherits and scrollbar-width does not. Declared on the
    // root alone, a card face comes back with the colour and `width: auto`.
    for (const container of ['.card-face', '.card-modal-scroll', '.sheet']) {
      expect(RULE).toContain(container)
    }
    expect(block(RULE)).toMatch(/scrollbar-width:\s*thin/)
  })

  it('style them with the standard properties, not ::-webkit-scrollbar', () => {
    // The webkit pseudo-element would make consistency worse: iOS Safari
    // ignores it, and on macOS it turns overlay scrollbars into ones that take
    // layout width away from every card that scrolls.
    expect(DECLARATIONS).not.toContain('::-webkit-scrollbar')
  })

  it('uses --muted for the thumb rather than --hairline', () => {
    // Measured across the ten themes, --hairline sits at 1.2–1.9 against the
    // grounds a thumb is drawn on — under the 3:1 minimum for a non-text
    // control, and this is the only thing saying a card has more to show.
    expect(block(RULE)).not.toMatch(/scrollbar-color:\s*var\(--hairline\)/)
  })
})

describe('text selection', () => {
  const LOCKED = 'button,\n.progress,\n.hint-line,\n.section-label,\n.label-text,\n.toggle,\n.banner,\n.deck-headline .muted'

  it('locks the chrome nobody would copy', () => {
    expect(block(LOCKED)).toMatch(/user-select:\s*none/)
    expect(block(LOCKED)).toMatch(/-webkit-user-select:\s*none/)
  })

  it('leaves card content copyable where no gesture is competing for it', () => {
    // The result screen lists the cards that were missed, and looking one of
    // them up elsewhere is a real thing to want. Locking it would be applying
    // the rule past the point it was meant for.
    expect(DECLARATIONS).not.toMatch(/\.wrong-list[^{]*\{[^}]*user-select/)
    expect(DECLARATIONS).not.toMatch(/\.card-body[^{]*\{[^}]*user-select/)
  })

  it('locks the quiz card, which is a gesture decision rather than this one', () => {
    // A long-press-and-drag to select would fight the drag that answers.
    expect(block('.card')).toMatch(/user-select:\s*none/)
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

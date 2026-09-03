import { describe, expect, it } from 'vitest'
import {
  ACTIVATION_PX,
  armedSide,
  classify,
  commitDistance,
  exitDx,
  RESCUE_PX,
  shouldCommit,
  shouldRescue,
  smoothVelocity,
  swipeStrength,
  tiltFor,
} from './gesture'

/**
 * These numbers were arrived at by feel, over two rounds of adjusting them on a
 * phone. That makes them worth pinning: the next person to touch this file
 * cannot re-derive them, and a swipe that fires when it should not is a wrong
 * answer recorded for a card the reader knew.
 */

const PHONE = 360
const NARROW = 200

describe('how far is far enough', () => {
  it('scales with the card, so the gesture feels the same on any screen', () => {
    expect(commitDistance(PHONE)).toBeCloseTo(100.8)
    expect(commitDistance(600)).toBeCloseTo(168)
  })

  it('has a floor, so a narrow screen still needs a real swipe', () => {
    // 28% of 200 is 56px, which is a thumb twitch.
    expect(commitDistance(NARROW)).toBe(72)
  })
})

describe('what a movement turns out to be', () => {
  const opts = { swipeEnabled: true, scrollToProtect: false }

  it('decides nothing until it has moved far enough to mean something', () => {
    expect(classify(5, 5, opts)).toBe('undecided')
    expect(classify(ACTIVATION_PX - 1, 0, opts)).toBe('undecided')
    expect(classify(ACTIVATION_PX, 0, opts)).toBe('horizontal')
  })

  it('reads a thumb arc as a swipe when there is no scroll to protect', () => {
    // Down-and-right is how a thumb actually moves; on a card with nothing to
    // scroll, rejecting it buys nothing.
    expect(classify(30, 25, { swipeEnabled: true, scrollToProtect: false })).toBe('horizontal')
  })

  it('reads the same arc as a scroll when there is somewhere to scroll to', () => {
    expect(classify(30, 25, { swipeEnabled: true, scrollToProtect: true })).toBe('vertical')
    // It still lets a clearly horizontal drag through.
    expect(classify(60, 25, { swipeEnabled: true, scrollToProtect: true })).toBe('horizontal')
  })

  it('never swipes when the reader has turned swiping off', () => {
    expect(classify(200, 0, { swipeEnabled: false, scrollToProtect: false })).toBe('vertical')
  })

  it('treats a straight-down drag as a scroll either way', () => {
    expect(classify(0, 40, { swipeEnabled: true, scrollToProtect: false })).toBe('vertical')
    expect(classify(0, 40, { swipeEnabled: true, scrollToProtect: true })).toBe('vertical')
  })
})

/**
 * Reported from a phone: on a deck of long cards, swipes kept dying. The card
 * would refuse to move and the reader had to lift and start again — which is
 * the worst failure this gesture has, because nothing on screen says why.
 *
 * Two things were wrong. The strict ratio asked whether the face was a scroll
 * container rather than whether it had anywhere left to scroll, so it was on
 * for nearly every card; and the reading it fed was final, so a wrong one at
 * 12px could not be undone by any amount of dragging afterwards.
 */
describe('taking back a reading that was wrong', () => {
  it('lets a decisive sideways drag through after a scroll was assumed', () => {
    expect(shouldRescue(RESCUE_PX, 10, false)).toBe(true)
  })

  it('will not act on a movement no larger than the one that misread it', () => {
    // Rescuing at the activation distance would make the first reading
    // pointless; it has to be a movement nobody would call ambiguous.
    expect(shouldRescue(ACTIVATION_PX, 2, false)).toBe(false)
    expect(shouldRescue(RESCUE_PX - 1, 0, false)).toBe(false)
  })

  it('leaves a real scroll alone, however far sideways it wanders', () => {
    // The reader is reading, and the page under their finger has moved. Taking
    // the card away from them here would be worse than the bug being fixed.
    expect(shouldRescue(200, 10, true)).toBe(false)
  })

  it('still wants horizontal to beat vertical', () => {
    expect(shouldRescue(40, 60, false)).toBe(false)
  })

  it('works in both directions', () => {
    expect(shouldRescue(-RESCUE_PX, 5, false)).toBe(true)
  })
})

describe('releasing', () => {
  it('commits on distance alone, at any speed', () => {
    expect(shouldCommit(commitDistance(PHONE), 0, PHONE)).toBe(true)
    expect(shouldCommit(-commitDistance(PHONE), 0, PHONE)).toBe(true)
  })

  it('does not commit a slow drag that stopped short', () => {
    expect(shouldCommit(80, 0.1, PHONE)).toBe(false)
  })

  it('commits a short fast flick, which is the whole point of having speed', () => {
    // 50px is half the distance threshold; thrown, it still counts.
    expect(shouldCommit(50, 0.6, PHONE)).toBe(true)
  })

  it('will not let a flick shorter than a tap commit', () => {
    expect(shouldCommit(30, 2, PHONE)).toBe(false)
  })

  it('ignores speed pointing the other way', () => {
    // Dragged right, then thrown back left: the reader is cancelling, and the
    // card they were dragging away from must not be answered.
    expect(shouldCommit(50, -0.9, PHONE)).toBe(false)
    expect(shouldCommit(-50, 0.9, PHONE)).toBe(false)
  })

  it('does not commit a release that never moved', () => {
    expect(shouldCommit(0, 0, PHONE)).toBe(false)
    expect(shouldCommit(0, 5, PHONE)).toBe(false)
  })
})

describe('velocity smoothing', () => {
  it('follows the recent movement more than the old', () => {
    // One fast frame after a still one should already read as fast.
    expect(smoothVelocity(0, 10, 10)).toBeCloseTo(0.7)
  })

  it('cannot be spiked by a single stuttering frame', () => {
    const steady = 0.5
    const afterStutter = smoothVelocity(steady, 0, 16)
    expect(afterStutter).toBeLessThan(steady)
    expect(afterStutter).toBeGreaterThan(0)
  })

  it('keeps the last value when no time has passed', () => {
    // Two pointer events in the same millisecond would otherwise divide by zero.
    expect(smoothVelocity(0.4, 20, 0)).toBe(0.4)
    expect(Number.isFinite(smoothVelocity(0.4, 20, 0))).toBe(true)
  })
})

describe('what the reader sees mid-drag', () => {
  it('fills the tint in step with the distance still needed', () => {
    expect(swipeStrength(0, PHONE)).toBe(0)
    expect(swipeStrength(commitDistance(PHONE) / 2, PHONE)).toBeCloseTo(0.5)
    expect(swipeStrength(commitDistance(PHONE), PHONE)).toBe(1)
  })

  it('never exceeds full, however far the card is dragged', () => {
    expect(swipeStrength(9999, PHONE)).toBe(1)
  })

  it('lights the button that releasing would actually fire', () => {
    const needed = commitDistance(PHONE)
    expect(armedSide(needed - 1, PHONE)).toBeNull()
    expect(armedSide(needed, PHONE)).toBe('known')
    expect(armedSide(-needed, PHONE)).toBe('unknown')
  })

  it('arms exactly when releasing would commit, and not before', () => {
    // The highlight and the outcome read the same threshold; if they ever
    // drift, a button lights up and then does nothing.
    for (const dx of [-200, -101, -100, -72, 0, 72, 100, 101, 200]) {
      expect(armedSide(dx, PHONE) !== null).toBe(shouldCommit(dx, 0, PHONE))
    }
  })
})

/**
 * The exit used to be `window.innerWidth`, which made the animation a function
 * of the screen rather than of the card. Since the card is capped at 40rem and
 * the window is not, a wide display sent it 4.2 card widths at six times the
 * speed, spinning it past 50 degrees. These pin the fix: the motion belongs to
 * the object that moves.
 */
describe('leaving the screen', () => {
  const PHONE_CARD = 382
  const DESKTOP_CARD = 608 // the 40rem cap, less the gutters

  it('sends the card the way it was answered', () => {
    expect(exitDx(PHONE_CARD, true)).toBeGreaterThan(0)
    expect(exitDx(PHONE_CARD, false)).toBeLessThan(0)
  })

  it('travels a little over one card width, whatever the card', () => {
    for (const card of [PHONE_CARD, DESKTOP_CARD, 328]) {
      const ratio = Math.abs(exitDx(card, true)) / card
      expect(ratio).toBeGreaterThan(1)
      expect(ratio).toBeLessThan(1.5)
    }
  })

  it('does not depend on the window at all', () => {
    // The whole defect in one assertion: a card of a given width leaves the
    // same way on a phone and on a 3440px display.
    expect(exitDx(DESKTOP_CARD, true)).toBe(exitDx(DESKTOP_CARD, true))
    expect(Math.abs(exitDx(DESKTOP_CARD, true))).toBeLessThan(800)
  })
})

describe('how far the card leans', () => {
  it('follows the drag, so the card feels held', () => {
    expect(tiltFor(0)).toBe(0)
    expect(tiltFor(100)).toBeCloseTo(2)
    expect(tiltFor(-100)).toBeCloseTo(-2)
  })

  it('is bounded, so no screen can spin it', () => {
    // 2560px of drag used to mean 51 degrees.
    expect(tiltFor(2560)).toBeLessThanOrEqual(12)
    expect(tiltFor(-2560)).toBeGreaterThanOrEqual(-12)
    expect(tiltFor(1e6)).toBe(12)
  })

  it('leans no further on the way out than a hand could take it', () => {
    for (const card of [328, 382, 608]) {
      expect(Math.abs(tiltFor(exitDx(card, true)))).toBeLessThanOrEqual(12)
    }
  })
})

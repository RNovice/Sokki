/**
 * The decisions a swipe is made of, as arithmetic.
 *
 * These were inline in ui/Quiz, tangled with pointer capture, refs and state,
 * and so the numbers in them — the ones actually tuned by feel, over two rounds
 * of it — were the only part of the app with no test at all. Pulled out here
 * they are ordinary functions with no DOM and no clock, which means the
 * thresholds can be pinned and the component is left holding only the plumbing.
 *
 * Nothing here knows about a card. It knows a pointer moved.
 */

/** Past this fraction of the card's width, releasing commits the answer. */
const COMMIT_FRACTION = 0.28
/** …but never less than this, so a narrow screen still needs a real swipe. */
const COMMIT_MIN_PX = 72
/**
 * A flick commits early. Distance alone forces a deliberate gesture to be a
 * long one, which on a phone means dragging most of the way across the screen
 * for every card. Speed says "deliberate" just as clearly and says it sooner,
 * and it does not reintroduce accidental swipes, because the accidental ones
 * are slow drift rather than fast flicks.
 */
const FLICK_VELOCITY_PX_PER_MS = 0.45
/** A flick still has to travel far enough to be a gesture and not a tap. */
const FLICK_MIN_PX = 44
/** Movement below this decides nothing: the card does not even follow yet. */
export const ACTIVATION_PX = 12
/**
 * How much horizontal has to beat vertical before the gesture counts as a
 * swipe — and the reason there are two numbers.
 *
 * The strict one exists to protect scrolling a long answer. But most cards are
 * a word or a phrase with nothing to scroll, and on those the strictness buys
 * nothing while rejecting the down-and-right arc that a thumb naturally makes.
 * So the gate is only strict when there is actually a scroll to defend.
 */
const DIRECTION_RATIO_SCROLLABLE = 1.5
const DIRECTION_RATIO_FIXED = 1.0
/** A press still undecided when it ends, and this brief, is a tap. */
export const TAP_MAX_MS = 500

/**
 * How far an answered card travels, as a multiple of its own width.
 *
 * It used to be `window.innerWidth`, on the reasoning that the card should be
 * gone whichever screen it was on. But the card is capped at 40rem while the
 * window is not, so past about 768px every extra pixel of window made it fly
 * further relative to itself: measured, 1.1 card widths on a phone and 4.2 on a
 * 2560px screen, at six times the speed, because the duration did not change.
 *
 * And it never needed to clear the screen — the card fades to nothing over the
 * same interval, so leaving is the opacity's job. The travel only has to say
 * which way it went, and one card width says that on any screen.
 */
const EXIT_TRAVEL = 1.1

/**
 * The most the card ever tilts, in degrees.
 *
 * The tilt follows the drag, which is what makes the card feel held rather than
 * nudged. But nothing bounds how far a pointer can travel on a wide screen, and
 * unbounded tilt is how a 2560px display ended up spinning the card 51 degrees
 * on its way out.
 */
const MAX_TILT_DEG = 12
const TILT_PER_PX = 0.02

/** Where an answered card is sent. Negative for "did not know". */
export function exitDx(cardWidth: number, knew: boolean): number {
  return (knew ? 1 : -1) * cardWidth * EXIT_TRAVEL
}

/** How far the card leans at a given offset. */
export function tiltFor(dx: number): number {
  return Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, dx * TILT_PER_PX))
}

/** How far the card must travel before releasing rates it. */
export function commitDistance(cardWidth: number): number {
  return Math.max(cardWidth * COMMIT_FRACTION, COMMIT_MIN_PX)
}

/**
 * What a movement has turned out to be, once it has moved far enough to say.
 * `undecided` means keep waiting — not that nothing happened.
 */
export type Intent = 'undecided' | 'horizontal' | 'vertical'

export function classify(
  moveX: number,
  moveY: number,
  options: { swipeEnabled: boolean; faceScrolls: boolean },
): Intent {
  if (Math.hypot(moveX, moveY) < ACTIVATION_PX) return 'undecided'
  if (!options.swipeEnabled) return 'vertical'
  const ratio = options.faceScrolls ? DIRECTION_RATIO_SCROLLABLE : DIRECTION_RATIO_FIXED
  return Math.abs(moveX) > Math.abs(moveY) * ratio ? 'horizontal' : 'vertical'
}

/**
 * Velocity, smoothed so that one stuttering frame cannot read as a flick while
 * still reflecting the end of the gesture rather than its average. Returns the
 * previous value unchanged when no time has passed, which is what a pointer
 * event arriving in the same millisecond means.
 */
export function smoothVelocity(previous: number, deltaX: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return previous
  return previous * 0.3 + (deltaX / elapsedMs) * 0.7
}

/**
 * Whether releasing here rates the card. Either it went far enough, or it was
 * thrown — and a throw only counts in the direction it was actually going,
 * so a fast correction back towards the middle does not commit the card it was
 * being dragged away from.
 */
export function shouldCommit(travelled: number, velocity: number, cardWidth: number): boolean {
  const distance = Math.abs(travelled)
  if (distance >= commitDistance(cardWidth)) return true
  return (
    Math.abs(velocity) >= FLICK_VELOCITY_PX_PER_MS &&
    distance >= FLICK_MIN_PX &&
    Math.sign(velocity) === Math.sign(travelled)
  )
}

/** How far through the commit the drag is, 0 to 1. Drives the tint. */
export function swipeStrength(dx: number, cardWidth: number): number {
  return Math.min(1, Math.abs(dx) / commitDistance(cardWidth))
}

/**
 * Which button releasing now would fire, or null if it would snap back.
 *
 * Derived from the same commitDistance the release uses, so the highlight and
 * the outcome cannot disagree — a button that lights up and then does not fire
 * is worse than no highlight at all.
 */
export function armedSide(dx: number, cardWidth: number): 'known' | 'unknown' | null {
  if (swipeStrength(dx, cardWidth) < 1) return null
  return dx > 0 ? 'known' : 'unknown'
}

import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { currentIndex, facesFor, questionSide } from '../core/session'
import type { Card, Session } from '../core/types'
import { t, tp } from '../i18n'
import { measure } from '../monitoring'
import { FlipCard } from './FlipCard'
import { Icon } from './Icon'

/**
 * Gesture thresholds. These are the difference between a swipe you meant and
 * one you did not.
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
const ACTIVATION_PX = 12
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
/** How long the answered card takes to leave. */
const EXIT_MS = 190
/** A press still undecided when it ends, and this brief, is a tap. */
const TAP_MAX_MS = 500

function commitDistance(cardWidth: number): number {
  return Math.max(cardWidth * COMMIT_FRACTION, COMMIT_MIN_PX)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A pointer gesture is not classified until it has moved far enough to say what
 * it is. Until then it is `pending` and does nothing visible; after that it is
 * either a horizontal swipe or a vertical scroll, and it cannot change its mind
 * halfway through.
 */
type Gesture =
  | { phase: 'none' }
  | { phase: 'pending'; id: number; x: number; y: number; at: number }
  | {
      phase: 'horizontal'
      id: number
      originX: number
      lastX: number
      lastAt: number
      velocity: number
    }
  | { phase: 'vertical'; id: number }

interface Props {
  session: Session
  cards: Card[]
  swipeEnabled: boolean
  onAnswer: (knew: boolean) => void
}

export function Quiz({ session, cards, swipeEnabled, onAnswer }: Props) {
  /**
   * Which side is up, tagged with the card it belongs to.
   *
   * Derived rather than reset in an effect, and that is the whole point: an
   * effect runs after the render that advanced the card, so the incoming card
   * would mount face-down for one frame and then rotate to the front. What you
   * would see is the previous card's answer turning away — a rewind of a flip
   * nobody asked for. Reading the side from state that is stamped with the
   * card's own marker means a new card is simply never flipped.
   */
  const marker = `${session.startedAt}:${session.pos}`
  const [flipState, setFlipState] = useState({ marker, back: false, seen: false })
  const forThisCard = flipState.marker === marker
  const showingBack = forThisCard && flipState.back
  /** Only decides which hint to show; rating never depends on having flipped. */
  const hasFlipped = forThisCard && flipState.seen

  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const cardEl = useRef<HTMLDivElement | null>(null)

  const index = currentIndex(session)
  const card = index === null ? null : cards[index]

  const flip = useCallback(() => {
    setFlipState((current) =>
      current.marker === marker
        ? { marker, back: !current.back, seen: true }
        : { marker, back: true, seen: true },
    )
  }, [marker])

  /**
   * The answered card leaves in the direction it was sent, and the next one
   * fades up behind it. Previously it was replaced outright, which read as the
   * new card flinching into place rather than the old one being dealt away.
   *
   * `onAnswer` is therefore deferred until the card has gone. The guard is a
   * ref rather than state because a second swipe can arrive before a re-render.
   */
  const [exiting, setExiting] = useState<1 | -1 | null>(null)
  const leaving = useRef(false)

  const commit = useCallback(
    (knew: boolean) => {
      if (leaving.current) return
      leaving.current = true

      const direction = knew ? 1 : -1
      setDragging(false)
      setExiting(direction)
      // Far enough that the card is gone whatever the viewport.
      setDx(direction * Math.max(window.innerWidth, 400))

      const settle = () => {
        leaving.current = false
        setExiting(null)
        setDx(0)
        measure('card-advance', () => onAnswer(knew))
      }
      // With motion reduced there is no animation to wait for, and waiting
      // anyway would just be a pause where the card used to move.
      if (prefersReducedMotion()) settle()
      else window.setTimeout(settle, EXIT_MS)
    },
    [onAnswer],
  )

  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        flip()
        return
      }
      if (event.key === '1' || event.key === 'ArrowRight') {
        event.preventDefault()
        commit(true)
      } else if (event.key === '2' || event.key === 'ArrowLeft') {
        event.preventDefault()
        commit(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flip, commit])

  /* --------------------------------------------------------------- swipe */

  const gesture = useRef<Gesture>({ phase: 'none' })

  /**
   * Whether the side currently facing up has more content than fits. Only then
   * is there a scroll worth protecting from a diagonal drag.
   */
  const faceCanScroll = useCallback((): boolean => {
    const faces = cardEl.current?.querySelectorAll<HTMLElement>('.card-face')
    const face = faces?.[showingBack ? 1 : 0]
    return !!face && face.scrollHeight > face.clientHeight + 1
  }, [showingBack])

  const onPointerDown = (event: PointerEvent) => {
    if (leaving.current) return
    gesture.current = {
      phase: 'pending',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const g = gesture.current
    if (g.phase === 'vertical' || g.phase === 'none') return
    if (g.id !== event.pointerId) return

    if (g.phase === 'pending') {
      const moveX = event.clientX - g.x
      const moveY = event.clientY - g.y
      if (Math.hypot(moveX, moveY) < ACTIVATION_PX) return

      const ratio = faceCanScroll() ? DIRECTION_RATIO_SCROLLABLE : DIRECTION_RATIO_FIXED
      if (!swipeEnabled || Math.abs(moveX) <= Math.abs(moveY) * ratio) {
        // Committed to being a scroll. Releasing will not rate the card.
        gesture.current = { phase: 'vertical', id: g.id }
        return
      }
      // Anchor on where the finger is now, not where it started, so the card
      // does not jump by the activation distance when it starts following.
      cardEl.current?.setPointerCapture(g.id)
      gesture.current = {
        phase: 'horizontal',
        id: g.id,
        originX: event.clientX,
        lastX: event.clientX,
        lastAt: Date.now(),
        velocity: 0,
      }
      setDragging(true)
      return
    }

    // Smoothed so one stuttering frame cannot read as a flick, and so the
    // value still reflects the end of the gesture rather than its average.
    const now = Date.now()
    const elapsed = now - g.lastAt
    if (elapsed > 0) {
      const instant = (event.clientX - g.lastX) / elapsed
      g.velocity = g.velocity * 0.3 + instant * 0.7
      g.lastX = event.clientX
      g.lastAt = now
    }
    setDx(event.clientX - g.originX)
  }

  const onPointerUp = (event: PointerEvent) => {
    const g = gesture.current
    gesture.current = { phase: 'none' }
    setDragging(false)

    if (g.phase === 'none' || g.id !== event.pointerId) {
      setDx(0)
      return
    }

    // Never classified, and over quickly: a tap.
    if (g.phase === 'pending') {
      setDx(0)
      if (Date.now() - g.at < TAP_MAX_MS) flip()
      return
    }

    if (g.phase === 'horizontal') {
      const travelled = event.clientX - g.originX
      const distance = Math.abs(travelled)
      const needed = commitDistance(cardEl.current?.offsetWidth ?? 300)
      const flicked =
        Math.abs(g.velocity) >= FLICK_VELOCITY_PX_PER_MS &&
        distance >= FLICK_MIN_PX &&
        Math.sign(g.velocity) === Math.sign(travelled)

      if (distance >= needed || flicked) commit(travelled > 0)
      else setDx(0)
      return
    }

    setDx(0)
  }

  const onPointerCancel = () => {
    gesture.current = { phase: 'none' }
    setDragging(false)
    if (!leaving.current) setDx(0)
  }

  /* -------------------------------------------------------------- render */

  if (!card || index === null) return null

  const side = questionSide(session, session.pos)
  const { question, answer } = facesFor(card, side)
  const total = session.order.length
  const remaining = total - session.pos
  const width = cardEl.current?.offsetWidth ?? 300
  const strength = Math.min(1, Math.abs(dx) / commitDistance(width))
  /*
   * Which button the current drag would fire, or null if releasing now would
   * snap back. Derived from commitDistance, the same function onPointerUp uses,
   * so the highlight and the outcome cannot disagree — a button that lights up
   * and then does not fire is worse than no highlight at all.
   */
  const armed = strength >= 1 ? (dx > 0 ? 'known' : 'unknown') : null

  return (
    <div class="quiz">
      <div>
        <div class="progress">
          <span>{t('quiz.position', { current: session.pos + 1, total })}</span>
          <span>{tp('quiz.remaining', remaining)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style={{ width: `${(session.pos / total) * 100}%` }} />
        </div>
      </div>

      <div class="card-stage">
        {/*
          Keyed on the card, so advancing mounts a fresh element instead of
          mutating this one. Together with deriving the side above, the new card
          starts at rest facing front and has nothing to animate away from.
        */}
        <FlipCard
          key={marker}
          cardRef={cardEl}
          className={`${dragging ? 'dragging' : ''}${exiting ? ' exiting' : ''}`.trim()}
          style={{ transform: `translateX(${dx}px) rotate(${dx * 0.02}deg)` }}
          flipped={showingBack}
          label={t('quiz.flip')}
          onFlip={flip}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          front={<span class="face-text face-question">{question}</span>}
          back={<span class="face-text face-answer">{answer || '—'}</span>}
        />
        {dx !== 0 ? (
          <div
            class={`swipe-tint ${dx > 0 ? 'good' : 'bad'}`}
            style={{ opacity: strength * 0.55 }}
          />
        ) : null}
      </div>

      <div>
        {/*
          Always both buttons, from the first frame. A gesture is invisible,
          unreachable from a keyboard and unannounced by a screen reader, so it
          can be the fast path but never the only one.
        */}
        <div class="answers">
          <button
            class={`unknown${armed === 'unknown' ? ' armed' : ''}`}
            onClick={() => commit(false)}
          >
            <Icon name="cross" />
            {t('quiz.unknown')}
          </button>
          <button
            class={`known${armed === 'known' ? ' armed' : ''}`}
            onClick={() => commit(true)}
          >
            <Icon name="check" />
            {t('quiz.known')}
          </button>
        </div>
        <div class="hint-line">
          {hasFlipped
              ? swipeEnabled
                ? t('quiz.swipeHint')
                : t('quiz.keyHint')
              : t('quiz.tapHint')}
        </div>
      </div>
    </div>
  )
}

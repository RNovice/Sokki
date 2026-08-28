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
const COMMIT_FRACTION = 0.4
/** …but never less than this, so a narrow screen still needs a real swipe. */
const COMMIT_MIN_PX = 96
/** Movement below this decides nothing: the card does not even follow yet. */
const ACTIVATION_PX = 14
/**
 * Horizontal has to beat vertical by this much before the gesture is treated as
 * a swipe. Without it, the sideways drift in a scroll down a long answer reads
 * as an answer — the single largest source of accidental ratings.
 */
const DIRECTION_RATIO = 1.6
/** A press still undecided when it ends, and this brief, is a tap. */
const TAP_MAX_MS = 500

function commitDistance(cardWidth: number): number {
  return Math.max(cardWidth * COMMIT_FRACTION, COMMIT_MIN_PX)
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
  | { phase: 'horizontal'; id: number; originX: number }
  | { phase: 'vertical'; id: number }

interface Props {
  session: Session
  cards: Card[]
  swipeEnabled: boolean
  resumed: boolean
  onAnswer: (knew: boolean) => void
}

export function Quiz({ session, cards, swipeEnabled, resumed, onAnswer }: Props) {
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

  const commit = useCallback(
    (knew: boolean) => {
      measure('card-advance', () => {
        setDx(0)
        setDragging(false)
        onAnswer(knew)
      })
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

  const onPointerDown = (event: PointerEvent) => {
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

      if (!swipeEnabled || Math.abs(moveX) <= Math.abs(moveY) * DIRECTION_RATIO) {
        // Committed to being a scroll. Releasing will not rate the card.
        gesture.current = { phase: 'vertical', id: g.id }
        return
      }
      // Anchor on where the finger is now, not where it started, so the card
      // does not jump by the activation distance when it starts following.
      cardEl.current?.setPointerCapture(g.id)
      gesture.current = { phase: 'horizontal', id: g.id, originX: event.clientX }
      setDragging(true)
      return
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
      const needed = commitDistance(cardEl.current?.offsetWidth ?? 300)
      if (Math.abs(travelled) >= needed) commit(travelled > 0)
      else setDx(0)
      return
    }

    setDx(0)
  }

  const onPointerCancel = () => {
    gesture.current = { phase: 'none' }
    setDragging(false)
    setDx(0)
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
          className={dragging ? 'dragging' : ''}
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
          {resumed
            ? t('quiz.resumed')
            : hasFlipped
              ? swipeEnabled
                ? t('quiz.swipeHint')
                : t('quiz.keyHint')
              : t('quiz.tapHint')}
        </div>
      </div>
    </div>
  )
}

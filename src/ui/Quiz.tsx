import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  armedSide,
  classify,
  exitDx,
  shouldCommit,
  smoothVelocity,
  swipeStrength,
  TAP_MAX_MS,
  tiltFor,
} from '../core/gesture'
import { currentIndex, facesFor, questionSide } from '../core/session'
import type { Card, Session } from '../core/types'
import { currentLocale, t, tp } from '../i18n'
import { measure } from '../monitoring'
import { CardText } from './CardText'
import { FlipCard } from './FlipCard'
import { Icon } from './Icon'

/** How long the answered card takes to leave. Presentation, not a decision. */
const EXIT_MS = 190

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
  /** Read the card text as Markdown. Per deck; see core/markdown. */
  markdown: boolean
  swipeEnabled: boolean
  onAnswer: (knew: boolean) => void
}

export function Quiz({ session, cards, markdown, swipeEnabled, onAnswer }: Props) {
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
  /*
   * The card's width, measured once when a drag starts.
   *
   * It used to be read from offsetWidth during render, which is a layout read,
   * once per pointer move. Measured: sixteen forced layouts in one drag, now
   * none. The value cannot change mid-drag anyway — nothing resizes while a
   * finger is down.
   */
  const cardWidth = useRef(300)

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

  /**
   * Move the card, and everything that follows it, without a render.
   *
   * The two things that change every frame — the card's transform and the
   * tint's opacity — are written straight to the elements. `armed` still goes
   * through state, because the buttons need it and it changes at most twice;
   * Preact drops a setState whose value is unchanged, so the other fifty-eight
   * frames cost nothing.
   */
  const commit = useCallback(
    (knew: boolean) => {
      if (leaving.current) return
      leaving.current = true

      const direction = knew ? 1 : -1
      setDragging(false)
      setExiting(direction)
      /*
       * Measured here rather than read from the drag: a card answered by button
       * or keyboard was never dragged, so `cardWidth` would still hold its
       * default. One layout read per answer is not the per-frame kind.
       */
      const width = cardEl.current?.offsetWidth ?? cardWidth.current
      setDx(exitDx(width, knew))

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
      const intent = classify(event.clientX - g.x, event.clientY - g.y, {
        swipeEnabled,
        faceScrolls: faceCanScroll(),
      })
      if (intent === 'undecided') return
      if (intent === 'vertical') {
        // Committed to being a scroll. Releasing will not rate the card.
        gesture.current = { phase: 'vertical', id: g.id }
        return
      }
      // Anchor on where the finger is now, not where it started, so the card
      // does not jump by the activation distance when it starts following.
      cardEl.current?.setPointerCapture(g.id)
      // One layout read for the whole drag, instead of one per frame.
      cardWidth.current = cardEl.current?.offsetWidth ?? 300
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

    const now = Date.now()
    g.velocity = smoothVelocity(g.velocity, event.clientX - g.lastX, now - g.lastAt)
    if (now > g.lastAt) {
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
      if (shouldCommit(travelled, g.velocity, cardWidth.current)) {
        commit(travelled > 0)
      } else {
        setDx(0)
      }
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

  /*
   * Derived before the early return below, not after, because the memos that
   * follow are hooks and a hook cannot sit behind a condition. `card` is null
   * only when the round is over, and the values computed from it are then
   * thrown away with the render.
   */
  const side = questionSide(session, session.pos)
  const { question, answer } = card ? facesFor(card, side) : { question: '', answer: '' }
  const total = session.order.length
  const remaining = total - session.pos
  const strength = swipeStrength(dx, cardWidth.current)
  const armed = armedSide(dx, cardWidth.current)
  const tilt = tiltFor(dx)

  /*
   * A dependency of every held subtree below that calls t(), because t() reads
   * a module-level dictionary swapped in asynchronously — so the words a
   * subtree was built with are not a function of anything in its own scope.
   * Without this, switching language left it behind until something unrelated
   * happened to rebuild it.
   *
   * The linter reads it as unnecessary, correctly by its own rules: nothing in
   * the callback mentions `locale`. It is suppressed where it appears rather
   * than argued with, the same way App.tsx suppresses it for `localeTick`.
   */
  const locale = currentLocale()
  /*
   * The three subtrees below are held across renders on purpose.
   *
   * Dragging sets `dx` on every pointermove, so Quiz re-renders at the pointer
   * event rate — measured at 38 renders for one short drag, and 304 renders
   * across the subtree, when the only thing that changed on screen was one
   * transform. None of the card's text, and none of the answer buttons except
   * their armed class, depends on `dx` at all.
   *
   * Reusing the vnode object is enough to stop that. Preact bails out of a diff
   * when `newVNode._original == oldVNode._original`, which is true exactly when
   * the same element object comes back — for components it skips the render
   * outright, for host elements it reuses the children and the DOM node. So
   * this needs no `memo`, and therefore no preact/compat in the bundle.
   *
   * The gesture code is untouched; this is only about what gets rebuilt while
   * it runs.
   */
  const faces = useMemo(
    () => ({
      front: <CardText class="face-text face-question" text={question} markdown={markdown} />,
      back: <CardText class="face-text face-answer" text={answer || '—'} markdown={markdown} />,
    }),
    [question, answer, markdown],
  )

  const progress = useMemo(
    () => (
      <div>
        <div class="progress">
          <span>{t('quiz.position', { current: session.pos + 1, total })}</span>
          <span>{tp('quiz.remaining', remaining)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style={{ width: `${(session.pos / total) * 100}%` }} />
        </div>
      </div>
    ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [session.pos, total, remaining, locale],
  )

  // `armed` is the only part of this that a drag changes, and it changes at
  // most twice in one — not once per frame.
  const answers = useMemo(
    () => (
      <div class="answers">
        <button class={`unknown${armed === 'unknown' ? ' armed' : ''}`} onClick={() => commit(false)}>
          <Icon name="cross" />
          {t('quiz.unknown')}
        </button>
        <button class={`known${armed === 'known' ? ' armed' : ''}`} onClick={() => commit(true)}>
          <Icon name="check" />
          {t('quiz.known')}
        </button>
      </div>
    ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [armed, commit, locale],
  )

  if (!card || index === null) return null

  return (
    <div class="quiz">
      {progress}

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
          style={{ transform: `translateX(${dx}px) rotate(${tilt}deg)` }}
          flipped={showingBack}
          label={t('quiz.flip')}
          onFlip={flip}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          front={faces.front}
          back={faces.back}
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
        {answers}
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

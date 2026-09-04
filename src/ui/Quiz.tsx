import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  armedSide,
  classify,
  exitDx,
  shouldCommit,
  shouldRescue,
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
 * either a horizontal swipe or a vertical scroll.
 *
 * A swipe is final — once the card is following the finger, nothing takes it
 * back. A scroll is not: it was decided from 12px of movement and can turn out
 * to have been wrong, so it keeps where it started and what the face's scroll
 * position was, which is everything shouldRescue needs to reverse it.
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
  | { phase: 'vertical'; id: number; x: number; y: number; scrollTop: number }

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

      /*
       * Space turns the card over, wherever focus happens to be, and leaves
       * focus exactly where it found it.
       *
       * Enter is deliberately not here. The two keys used to do the same thing,
       * which meant a reader who had tabbed to 「我會」 could not press it with
       * either — the shortcut ate both, and the only way to answer from the
       * keyboard was 1, 2 or an arrow. Now Enter belongs to whatever holds
       * focus, the way it does everywhere else, and the card answers it too
       * because role="button" has to.
       */
      if (event.key === ' ') {
        event.preventDefault()
        flip()
        return
      }
      /*
       * Tab, and only Tab, makes the ring wanted again: the flag records that
       * focus was given by a pointer, and navigation is the one thing that
       * revokes it. Read here before the browser moves focus, so the card is
       * already loud again if Tab lands on it.
       */
      if (event.key === 'Tab') cardEl.current?.removeAttribute('data-quiet-focus')
      if (event.key === '1' || event.key === 'ArrowRight') {
        event.preventDefault()
        commit(true)
      } else if (event.key === '2' || event.key === 'ArrowLeft') {
        event.preventDefault()
        commit(false)
      }
    }
    /*
     * Only when the card itself is the one losing focus.
     *
     * A bare handler clears the flag it was just given: pressing space while a
     * button holds focus fires focusout *on that button* as focus moves to the
     * card, which arrives after the attribute is set and wipes it — so the ring
     * came back, on the card this time. The target check is what makes the
     * clearing about the card rather than about any focus change on the page.
     */
    const onFocusOut = (event: FocusEvent) => {
      if (event.target === cardEl.current) cardEl.current?.removeAttribute('data-quiet-focus')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('focusout', onFocusOut)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('focusout', onFocusOut)
    }
  }, [flip, commit])

  /* --------------------------------------------------------------- swipe */

  const gesture = useRef<Gesture>({ phase: 'none' })

  /** The side currently facing up — the one a finger is over. */
  const faceEl = useCallback((): HTMLElement | null => {
    const faces = cardEl.current?.querySelectorAll<HTMLElement>('.card-face')
    return faces?.[showingBack ? 1 : 0] ?? null
  }, [showingBack])

  /**
   * Whether the face can scroll further in the direction this drag is heading.
   *
   * The question used to be "does this face scroll at all", which is not the
   * same one and is true far more often. A long answer read down to its end
   * cannot scroll further down, and one still at its top cannot scroll up; in
   * both cases the strict direction ratio was defending a scroll that could not
   * happen, and the cost of that was the reader's swipe.
   *
   * Dragging the finger up moves the content up, which needs room below it.
   */
  const scrollToProtect = useCallback(
    (moveY: number): boolean => {
      const face = faceEl()
      if (!face) return false
      const room = face.scrollHeight - face.clientHeight
      if (room <= 1) return false
      if (moveY < 0) return face.scrollTop < room - 1
      if (moveY > 0) return face.scrollTop > 1
      return true
    },
    [faceEl],
  )

  const onPointerDown = (event: PointerEvent) => {
    /*
     * A pointer is about to give the card focus, and focus given by a pointer
     * never wants a ring — the browser agrees until a key is pressed, at which
     * point it promotes the element and draws one. Marking it here means the
     * card clicked with a mouse and then flipped with space stays quiet, while
     * a card reached by Tab is untouched and keeps its ring.
     */
    cardEl.current?.setAttribute('data-quiet-focus', '')
    if (leaving.current) return
    gesture.current = {
      phase: 'pending',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
    }
  }

  /**
   * Hand the card over to the finger. Anchored on where the finger is now
   * rather than where it started, so the card does not jump by the distance the
   * gesture spent being classified — which for a rescued one is 36px.
   */
  const beginDrag = (event: PointerEvent, id: number) => {
    /*
     * Capture keeps the moves coming if the finger leaves the card, which is
     * a convenience rather than a requirement — the drag reads clientX and
     * would work without it. It throws if the pointer is no longer active, and
     * an exception here used to abandon the whole handler with the gesture left
     * in whatever phase it was in: from the rescue path that means retrying,
     * and throwing, on every remaining move of the touch.
     */
    try {
      cardEl.current?.setPointerCapture(id)
    } catch {
      // Gone already. The drag still works; it just ends at the card's edge.
    }
    // One layout read for the whole drag, instead of one per frame.
    cardWidth.current = cardEl.current?.offsetWidth ?? 300
    gesture.current = {
      phase: 'horizontal',
      id,
      originX: event.clientX,
      lastX: event.clientX,
      lastAt: Date.now(),
      velocity: 0,
    }
    setDragging(true)
  }

  const onPointerMove = (event: PointerEvent) => {
    const g = gesture.current
    if (g.phase === 'none') return
    if (g.id !== event.pointerId) return

    /*
     * Still being delivered moves after being read as a scroll. With
     * `touch-action: pan-y` the browser cancels the pointer the moment it takes
     * the gesture over, so getting here at all is evidence nothing is
     * scrolling — but the face's own position is checked as well, because that
     * is the thing actually at stake.
     */
    if (g.phase === 'vertical') {
      if (!swipeEnabled) return
      const scrolled = (faceEl()?.scrollTop ?? g.scrollTop) !== g.scrollTop
      if (!shouldRescue(event.clientX - g.x, event.clientY - g.y, scrolled)) return
      beginDrag(event, g.id)
      return
    }

    if (g.phase === 'pending') {
      const moveX = event.clientX - g.x
      const moveY = event.clientY - g.y
      const intent = classify(moveX, moveY, {
        swipeEnabled,
        scrollToProtect: scrollToProtect(moveY),
      })
      if (intent === 'undecided') return
      if (intent === 'vertical') {
        // Read as a scroll. Releasing will not rate the card — but the reading
        // was made from 12px of movement, so it is not the last word either.
        gesture.current = {
          phase: 'vertical',
          id: g.id,
          x: g.x,
          y: g.y,
          scrollTop: faceEl()?.scrollTop ?? 0,
        }
        return
      }
      beginDrag(event, g.id)
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

  /*
   * The half of the direction lock the browser owns.
   *
   * The phase in `gesture` locks our own reading until the touch ends, which is
   * what "decide once" is supposed to mean. It was only ever half of it. The
   * card declares `touch-action: pan-y`, which hands vertical panning to the
   * browser, and the browser runs its own direction test with its own
   * thresholds. When it decides the gesture is a scroll it takes the pointer
   * away and fires pointercancel — mid-drag, with the card already following
   * the finger. That is the swipe that dies halfway and springs back.
   *
   * preventDefault on touchmove is the only thing that stops it, and it has to
   * come from a listener that is not passive. It is attached here rather than
   * through JSX so that `passive: false` is written down: the default for a
   * touch listener on an ordinary element is already non-passive, but it is a
   * default nobody should have to remember, and the whole fix rests on it.
   *
   * It also has to exist before the touch starts. Chrome decides at touchstart
   * whether the region has a non-passive listener at all, and hands scrolling
   * to the compositor if it does not — so one attached when the drag begins
   * comes too late to be consulted.
   *
   * The cost is that this region can no longer be scrolled on the compositor
   * alone. The handler is a property read and a comparison, but scrolling a
   * long card now waits on the main thread, and that is the trade: a swipe that
   * always finishes, against a scroll that is no longer free.
   *
   * Re-attached per card, because FlipCard is keyed on the marker and the
   * element underneath is a new one each time.
   */
  useEffect(() => {
    const node = cardEl.current
    if (!node) return
    const holdTheLine = (event: TouchEvent) => {
      if (gesture.current.phase !== 'horizontal') return
      // False once the browser has already committed to scrolling; there is
      // nothing left to prevent and calling it would only warn.
      if (event.cancelable) event.preventDefault()
    }
    node.addEventListener('touchmove', holdTheLine, { passive: false })
    return () => node.removeEventListener('touchmove', holdTheLine)
  }, [marker])

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
          onFlip={flip}
          className={`${dragging ? 'dragging' : ''}${exiting ? ' exiting' : ''}`.trim()}
          style={{ transform: `translateX(${dx}px) rotate(${tilt}deg)` }}
          flipped={showingBack}
          label={t('quiz.flip')}
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

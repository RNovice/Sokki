import type { ComponentChildren, JSX, Ref } from 'preact'
import { Icon } from './Icon'

/**
 * The two-sided card the quiz studies.
 *
 * Only the card and its faces live here; the stage around it belongs to the
 * caller, which is where the swipe tint goes, and dragging is the quiz's own
 * business — this just accepts the handlers.
 *
 * The visual is not exclusive to it: `.card-surface` in the stylesheet is the
 * same panel a landing-page modal shows, so an explanation arrives on the same
 * object the study cards are made of. What is exclusive is the turning, which
 * is why nothing else imports this.
 */
interface Props {
  front: ComponentChildren
  back: ComponentChildren
  flipped: boolean
  label: string
  cardRef?: Ref<HTMLDivElement>
  className?: string
  style?: JSX.CSSProperties
  onPointerDown?: (event: PointerEvent) => void
  onPointerMove?: (event: PointerEvent) => void
  onPointerUp?: (event: PointerEvent) => void
  onPointerCancel?: (event: PointerEvent) => void
}

/*
 * Built once, at module load, and handed to both faces.
 *
 * The card re-renders on every pointermove while it is being dragged, and this
 * mark is the same eleven bytes of SVG every time. Preact bails out of diffing
 * a vnode whose `_original` matches the previous one, and a constant always
 * matches — including when the same object is used twice in one tree, because
 * the clone Preact makes for the second position carries `_original` with it.
 */
const FLIP_MARK = <Icon name="flip" class="face-flip-mark" />

export function FlipCard({
  front,
  back,
  flipped,
  label,
  cardRef,
  className,
  style,
  ...pointer
}: Props) {
  return (
    <div
      ref={cardRef}
      class={`card${className ? ` ${className}` : ''}`}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={label}
      /*
       * No key handling here, deliberately. This used to answer space and
       * enter itself, on the reasoning that only the quiz bound them globally
       * and a card elsewhere would need its own — but there is no card
       * elsewhere, and the quiz's window listener sees the same keypress. Both
       * ran, both flipped, and two flips look exactly like none: pressing space
       * on a card you had clicked appeared to do nothing at all.
       *
       * Quiz owns space and enter for the whole screen, which it has to anyway
       * — the card does not hold focus until something gives it focus, and the
       * usual way to reach a card is to not touch the keyboard at all.
       */
      {...pointer}
    >
      <div class={`card-inner${flipped ? ' flipped' : ''}`}>
        <div class="card-face">
          {front}
          {FLIP_MARK}
        </div>
        <div class="card-face back">
          {back}
          {FLIP_MARK}
        </div>
      </div>
    </div>
  )
}

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
  onFlip: () => void
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
  onFlip,
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
      onKeyDown={(event: KeyboardEvent) => {
        // The quiz binds space and enter globally; the landing page does not,
        // so the card has to answer for itself when it holds focus.
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          onFlip()
        }
      }}
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

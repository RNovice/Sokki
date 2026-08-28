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
          <Icon name="flip" class="face-flip-mark" />
        </div>
        <div class="card-face back">
          {back}
          <Icon name="flip" class="face-flip-mark" />
        </div>
      </div>
    </div>
  )
}

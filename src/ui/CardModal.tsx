import { useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { t } from '../i18n'
import { Icon } from './Icon'

/**
 * Escape closes it. Every overlay in the app uses this, so the key does the
 * same thing wherever you are — an overlay that can only be dismissed by
 * aiming at a small ✕ is a trap on a phone and unreachable from a keyboard.
 */
export function useEscapeToClose(onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

interface Props {
  title: string
  onClose: () => void
  children: ComponentChildren
}

/**
 * Content presented on a card, over the page rather than pushed into it.
 *
 * It does not turn over. The quiz card flips because there is a second side
 * worth hiding; here there is one thing to read, and a flip would be an
 * animation pretending to be information.
 */
export function CardModal({ title, onClose, children }: Props) {
  useEscapeToClose(onClose)

  return (
    <div
      class="sheet-backdrop centered"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div class="card-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div class="card-surface">
          {/*
            The title is outside the scrolling panel, not above it inside. A
            long list is the case this modal has to survive, and a heading that
            scrolls away takes with it the only thing saying what you are
            looking at — along with the close button's backdrop, leaving a ✕
            floating over the rows.
          */}
          <h2 class="card-modal-title">{title}</h2>
          <div class="card-modal-scroll">
            <div class="card-body">{children}</div>
          </div>
        </div>
        {/*
          Sits over the card rather than inside its scroll area, so it stays
          put while the content moves under it.
        */}
        <button class="card-close" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  )
}

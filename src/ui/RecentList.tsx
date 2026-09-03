import { refFromRecent, type RecentDeck } from '../core/recent'
import type { DeckRef } from '../core/types'
import { formatRelativeTime, t, tp } from '../i18n'
import { Icon } from './Icon'

/**
 * The recent decks, in one of the two ways they are shown.
 *
 * There are two, and keeping them apart is the point. On the landing page the
 * list is a way in: every row opens a deck and nothing on it can destroy
 * anything. Under Settings it is a way to tidy up: nothing opens, and each row
 * has a bin. Mixing them put a destructive control on the surface people use
 * to start studying, one thumb-width from the row it deletes.
 *
 * What the two share is the row's text — the untitled fallback, the separator,
 * the pluralised card count — and that is precisely the part that drifts when
 * it is written out twice.
 */
type Props = { recent: RecentDeck[] } & (
  | { onOpen: (ref: DeckRef) => void; onForget?: undefined }
  | { onForget: (entry: RecentDeck) => void; onOpen?: undefined }
)

export function RecentList({ recent, onOpen, onForget }: Props) {
  return (
    <div class="row-list">
      {recent.map((entry) => {
        // A link can arrive with no name at all; the deck screen's own fallback
        // is used so the two never disagree.
        const name = entry.title || t('deck.untitled')
        const detail = (
          <span class="grow">
            <span class="name">{name}</span>
            <br />
            <span class="sub">
              {formatRelativeTime(entry.lastOpened)} · {tp('deck.cards', entry.cardCount)}
            </span>
          </span>
        )
        const key = `${entry.sheetId}:${entry.gid}`

        if (onOpen) {
          return (
            <button key={key} class="row-link" onClick={() => onOpen(refFromRecent(entry))}>
              {detail}
              <Icon name="chevron" class="deck-arrow" />
            </button>
          )
        }

        return (
          <div key={key} class="row-pair">
            {/*
              Before the row rather than after it, and outside rather than in.
              Outside because the row it belongs to is inert here and should not
              look like it holds a control; before, because the thumb reaching
              for it then travels away from the list rather than across it.
            */}
            <button
              class="row-forget"
              aria-label={t('recent.forget', { name })}
              onClick={() => onForget(entry)}
            >
              <Icon name="trash" size={1.25} />
            </button>
            <div class="row-link row-static">{detail}</div>
          </div>
        )
      })}
    </div>
  )
}

import { isFinished } from '../core/session'
import type { DeckPrefs, Direction, Session } from '../core/types'
import { t, tp } from '../i18n'
import { SelectField, ToggleField } from './Field'

const DIRECTIONS: Direction[] = ['front-back', 'back-front', 'mixed']

interface Props {
  title: string
  cardCount: number
  prefs: DeckPrefs
  session: Session | null
  /** Set when changing a setting threw away a round that was under way. */
  discardedRound: boolean
  onStart: () => void
  onResume: () => void
  onRestart: () => void
  onPrefs: (patch: Partial<DeckPrefs>) => void
}

/**
 * Where a deck begins and where a round ends.
 *
 * It exists for a reason that is not the obvious one. Giving someone who
 * arrived from a shared link some context is a nice-to-have — the top bar
 * already carries the deck's name. What earns the screen is that the settings
 * that shape a round now live *before* the round: changing direction or size
 * used to silently destroy whatever you were part-way through, because there
 * was nowhere else to put those controls.
 *
 * The cost is one tap on the way in. An unfinished round pays it back by making
 * the resume explicit, where it used to happen silently under a line of small
 * print.
 */
export function DeckHome({
  title,
  cardCount,
  prefs,
  session,
  discardedRound,
  onStart,
  onResume,
  onRestart,
  onPrefs,
}: Props) {
  /*
   * A round only counts as resumable once a card has actually been answered.
   * A saved round still sitting at the first card has nothing to carry on with,
   * and offering to continue it says there is progress where there is none.
   */
  const unfinished = session && !isFinished(session) && session.pos > 0 ? session : null

  return (
    <div class="page">
      <div class="deck-headline">
        <h2>{title}</h2>
        <span class="muted">{tp('deck.cards', cardCount)}</span>
      </div>

      {unfinished ? (
        <div class="row">
          <button class="primary grow" onClick={onResume}>
            {t('deckHome.resume', {
              current: unfinished.pos + 1,
              total: unfinished.order.length,
            })}
          </button>
          <button onClick={onRestart}>{t('deckHome.restart')}</button>
        </div>
      ) : (
        <div class="row">
          <button class="primary grow" onClick={onStart}>
            {t('deckHome.start')}
          </button>
        </div>
      )}

      {discardedRound ? (
        <div class="notice">
          <span>{t('deckHome.discarded')}</span>
        </div>
      ) : null}

      <span class="section-label">{t('settings.deckSection')}</span>
      <div class="field-group">
        <SelectField
          label={t('settings.direction')}
          value={prefs.direction}
          onChange={(value) => onPrefs({ direction: value as Direction })}
        >
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {t(`direction.${d}`)}
            </option>
          ))}
        </SelectField>

        <SelectField
          label={t('settings.count')}
          value={String(prefs.count)}
          onChange={(value) => onPrefs({ count: Number(value) })}
        >
          <option value="0">{t('settings.countAll')}</option>
          {[10, 20, 30, 50, 100]
            .filter((n) => n < cardCount)
            .map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
        </SelectField>

        <ToggleField
          label={t('settings.shuffle')}
          checked={prefs.shuffle}
          onChange={(checked) => onPrefs({ shuffle: checked })}
        />
      </div>
    </div>
  )
}

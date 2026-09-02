import { useEffect, useRef, useState } from 'preact/hooks'
import { isFinished, roundSize } from '../core/session'
import type { DeckPrefs, Direction, Session } from '../core/types'
import { t, tp } from '../i18n'
import { SelectField, ToggleField } from './Field'
import { Icon } from './Icon'

const DIRECTIONS: Direction[] = ['front-back', 'back-front', 'mixed']

interface Props {
  title: string
  /**
   * Whether this deck can be named. Built-in decks cannot: their titles are
   * translated strings, and overwriting one would freeze it in the language it
   * was renamed in.
   */
  canRename: boolean
  /** Empty when it has none — which is every deck loaded by pasting its URL. */
  name: string
  onRename: (name: string) => void
  cardCount: number
  prefs: DeckPrefs
  session: Session | null
  /** Shown once, after the cards were re-read because the source moved. */
  justRefreshed: boolean
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
  canRename,
  name,
  onRename,
  cardCount,
  prefs,
  session,
  justRefreshed,
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

  /*
   * Whether the settings on screen would build a different round from the one
   * waiting to be resumed. A round carries its own direction and its size was
   * fixed when it was built, so changing these does not disturb it — but the
   * reader has just changed something and is entitled to know it takes effect
   * next time rather than now.
   *
   * All three settings are compared. Shuffle is read from the round rather than
   * inferred from its order, because an order that happens to come out
   * ascending looks exactly like one that was never shuffled; a round saved
   * before that field existed reads as shuffled, which is the default.
   */
  const [editing, setEditing] = useState(false)

  const settingsDiffer =
    unfinished != null &&
    (unfinished.direction !== prefs.direction ||
      unfinished.order.length !== roundSize(cardCount, prefs.count) ||
      (unfinished.shuffle ?? true) !== prefs.shuffle)

  return (
    <div class="page">
      <div class="deck-headline">
        {/*
          The heading is where a deck gets its name, because that is where you
          first see what is in it. A link only carries a name when the share
          sheet put one there, so a spreadsheet you loaded yourself arrives
          anonymous — and the prompt to fix that belongs at the moment you can
          answer it, not on the landing page before you have seen a card.
        */}
        {editing ? (
          <RenameField
            initial={name}
            onDone={(value) => {
              onRename(value)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <h2>
            {canRename ? (
              <button class="rename-trigger" onClick={() => setEditing(true)}>
                <span>{name || t('deckHome.nameIt')}</span>
                <Icon name="pencil" class="rename-mark" />
              </button>
            ) : (
              title
            )}
          </h2>
        )}
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

      {settingsDiffer ? (
        <div class="notice">
          <span>{t('deckHome.settingsNextRound')}</span>
        </div>
      ) : null}

      {justRefreshed ? (
        <div class="notice info">
          <span>{t('deckHome.refreshed')}</span>
        </div>
      ) : null}

      <span class="section-label">{t('settings.deckSection')}</span>
      <div class="field-group">
        <SelectField
          name="direction"
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
          name="count"
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
          name="shuffle"
          label={t('settings.shuffle')}
          checked={prefs.shuffle}
          onChange={(checked) => onPrefs({ shuffle: checked })}
        />

        {/*
          Not part of the "next round" comparison above, and deliberately so:
          this changes how text is drawn, not how a round is built, so it takes
          effect on the very next card rather than waiting.
        */}
        <ToggleField
          name="markdown"
          label={t('settings.markdown')}
          checked={prefs.markdown}
          onChange={(checked) => onPrefs({ markdown: checked })}
        />
      </div>
    </div>
  )
}

/**
 * Naming, as a form so that Enter commits it — on a phone that is the keyboard's
 * own confirm key, which is the only submit control most people will look for.
 */
function RenameField({
  initial,
  onDone,
  onCancel,
}: {
  initial: string
  onDone: (name: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const field = useRef<HTMLInputElement>(null)

  // On mount only. An inline ref callback would run on every render, and so
  // would take focus back on every keystroke.
  useEffect(() => field.current?.focus(), [])

  return (
    <form
      class="rename-field"
      onSubmit={(event) => {
        event.preventDefault()
        onDone(draft.trim())
      }}
    >
      <input
        type="text"
        name="deck-name"
        value={draft}
        // Deliberately unlabelled: it replaces the heading in place, so the
        // heading it replaced is the label.
        aria-label={t('deckHome.nameIt')}
        placeholder={t('deckHome.namePlaceholder')}
        autocomplete="off"
        ref={field}
        onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
      />
      <button class="primary" type="submit">
        {t('common.save')}
      </button>
    </form>
  )
}

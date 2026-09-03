import { useMemo, useState } from 'preact/hooks'
import { BUILTIN_DECKS, markdownFromInput, parseSheetInput } from '../core/deck'
import { forgetDeck, refFromRecent, type RecentDeck } from '../core/recent'
import type { DeckRef } from '../core/types'
import { currentLocale, formatRelativeTime, t, tp } from '../i18n'
import { CardModal } from './CardModal'
import { Icon } from './Icon'

interface Props {
  /**
   * `markdown` is what the pasted link said, if it said anything. Undefined
   * means it did not, and the reader's own preference for the deck stands.
   */
  onOpen: (ref: DeckRef, markdown?: boolean) => void
  recent: RecentDeck[]
  /** Owned by App, which holds the list; this reports what is left of it. */
  onRecentChange: (next: RecentDeck[]) => void
}

type Panel = 'none' | 'recent' | 'examples' | 'howto'

/**
 * What this is, where to paste a link, and a short list of rows that open.
 * Every row is the same shape — label, detail, chevron — and every one of them
 * opens a panel rather than expanding in place, so the page never reflows under
 * the reader and its height does not depend on how much they have used it.
 */
export function Landing({ onOpen, recent, onRecentChange }: Props) {
  const [input, setInput] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('none')

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

  function submit() {
    const ref = parseSheetInput(input)
    if (!ref) {
      setProblem(t('landing.invalidUrl'))
      return
    }
    setProblem(null)
    onOpen(ref, markdownFromInput(input))
  }

  /*
   * The rows, held across renders.
   *
   * Typing in the box above changes `input`, which re-renders Landing — and
   * these rows have nothing to do with what is being typed. Measured at 42
   * characters of a spreadsheet URL: 42 renders of Landing and 126 of Icon,
   * three chevrons rebuilt for every keystroke.
   */
  /*
   * The locale is a dependency of anything that calls t(), because t() reads
   * module state the linter cannot see. Without it this subtree keeps the words
   * it was first built with, and switching language leaves it behind.
   */
  const rows = useMemo(
    () => (
      <div class="row-list">
        {/*
          One row, not one per deck: the same shape as the two below it, opening
          the same kind of panel. A list that grows down the landing page would
          push everything else off the screen for exactly the people who use the
          app most. Nothing renders when there is no history, so a first visit
          looks as it did before this existed — the row is earned, not shown.
        */}
        {recent.length > 0 ? (
          <button class="row-link" onClick={() => setPanel('recent')}>
            <span class="grow">
              <span class="name">{t('landing.recent')}</span>
              <br />
              <span class="sub">{tp('landing.recentCount', recent.length)}</span>
            </span>
            <Icon name="chevron" class="deck-arrow" />
          </button>
        ) : null}

        <button class="row-link" onClick={() => setPanel('examples')}>
          <span class="grow">
            <span class="name">{t('landing.examples')}</span>
            <br />
            <span class="sub">{t('landing.examplesSub')}</span>
          </span>
          <Icon name="chevron" class="deck-arrow" />
        </button>

        <button class="row-link" onClick={() => setPanel('howto')}>
          <span class="grow">
            <span class="name">{t('landing.howtoTitle')}</span>
            <br />
            <span class="sub">{t('landing.howtoSub')}</span>
          </span>
          <Icon name="chevron" class="deck-arrow" />
        </button>
      </div>
    ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [recent, locale],
  )

  return (
    <div class="page">
      <p class="muted">{t('app.tagline')}</p>

      {problem ? (
        <div class="notice bad">
          <span>{problem}</span>
        </div>
      ) : null}

      <div class="panel">
        <label>
          <span class="label-text">{t('landing.pasteLabel')}</span>
          <input
            type="url"
            name="sheet-url"
            inputMode="url"
            autocomplete="off"
            spellcheck={false}
            placeholder={t('landing.pastePlaceholder')}
            value={input}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </label>
        <div class="row">
          <button class="primary" onClick={submit} disabled={input.trim() === ''}>
            {t('landing.load')}
          </button>
        </div>
      </div>

      {rows}

      {panel === 'recent' ? (
        <CardModal title={t('landing.recent')} onClose={() => setPanel('none')}>
          <div class="row-list">
            {recent.map((entry) => {
              // A link can arrive with no name at all; the deck screen's own
              // fallback is used so the two never disagree.
              const name = entry.title || t('deck.untitled')
              return (
                <div key={`${entry.sheetId}:${entry.gid}`} class="row-pair">
                  <button class="row-link" onClick={() => onOpen(refFromRecent(entry))}>
                    <span class="grow">
                      <span class="name">{name}</span>
                      <br />
                      <span class="sub">
                        {formatRelativeTime(entry.lastOpened)} · {tp('deck.cards', entry.cardCount)}
                      </span>
                    </span>
                    <Icon name="chevron" class="deck-arrow" />
                  </button>
                  {/*
                    A sibling of the row rather than inside it: a button cannot
                    contain a button, and the whole row is one.
                  */}
                  <button
                    class="row-forget"
                    aria-label={t('recent.forget', { name })}
                    onClick={() => {
                      const next = forgetDeck(entry)
                      onRecentChange(next)
                      // Nothing left to list, and an empty panel is not an
                      // answer to "show me my recent decks".
                      if (next.length === 0) setPanel('none')
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              )
            })}
          </div>
        </CardModal>
      ) : null}

      {panel === 'examples' ? (
        <CardModal title={t('landing.examples')} onClose={() => setPanel('none')}>
          <div class="row-list">
            {BUILTIN_DECKS.map((deck) => (
              <button
                key={deck.id}
                class="row-link"
                onClick={() => onOpen({ kind: 'builtin', id: deck.id })}
              >
                <span class="grow">
                  <span class="name">{t(deck.titleKey)}</span>
                  <br />
                  <span class="sub">
                    {t(`${deck.titleKey}.sub`)} · {tp('deck.cards', deck.cards)}
                  </span>
                </span>
                <Icon name="chevron" class="deck-arrow" />
              </button>
            ))}
          </div>
        </CardModal>
      ) : null}

      {panel === 'howto' ? (
        <CardModal title={t('landing.howtoTitle')} onClose={() => setPanel('none')}>
          <ol>
            <li>{t('landing.howtoA')}</li>
            <li>{t('landing.howtoShare')}</li>
            {/* Last because it is conditional: most sheets have one tab. */}
            <li>{t('landing.howtoTab')}</li>
          </ol>
          <p class="muted">{t('landing.howtoPublic')}</p>
        </CardModal>
      ) : null}
    </div>
  )
}

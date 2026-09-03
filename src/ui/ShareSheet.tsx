import { useCallback, useMemo, useRef, useState } from 'preact/hooks'
import { sheetEditUrl, shareUrl } from '../core/deck'
import type { DeckRef } from '../core/types'
import { currentLocale, t } from '../i18n'
import { useEscapeToClose } from './CardModal'
import { Icon } from './Icon'

interface Props {
  deckRef: DeckRef
  /**
   * Prefilled from whatever the deck is already called — but only prefilled.
   * Editing it here renames the link, not the deck: what you send someone is
   * often not what you call it yourself, and a share sheet is a poor place to
   * silently rewrite something you own. The deck's own name is changed on its
   * home screen.
   */
  name: string
  /** Carried in the link, so what the recipient sees matches what was shared. */
  markdown: boolean
  onClose: () => void
}

/**
 * The user names the deck here and gets a link back. They never see `?s=` or
 * `&g=` — the URL format is an implementation detail, and asking someone to
 * assemble query parameters by hand is the opposite of no learning curve.
 */
export function ShareSheet({ deckRef, name, markdown, onClose }: Props) {
  useEscapeToClose(onClose)

  // Seeded from the name the deck already has, so this field edits it rather
  // than starting blank and quietly dropping it out of the link.
  const [title, setTitle] = useState(deckRef.kind === 'sheet' ? name : '')
  const [copied, setCopied] = useState(false)

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

  const named: DeckRef =
    deckRef.kind === 'sheet' ? { ...deckRef, title: title.trim() || undefined } : deckRef
  const link = shareUrl(named, markdown)
  const editUrl = sheetEditUrl(deckRef)

  /*
   * The link goes in a ref as well as being rendered, so that `copy` does not
   * close over it. Otherwise `copy` is a new function on every keystroke — the
   * URL contains the name being typed — and the row it sits in cannot be held
   * across renders.
   */
  const latestLink = useRef(link)
  latestLink.current = link

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(latestLink.current)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; selecting the text still works.
      const field = document.getElementById('share-link') as HTMLInputElement | null
      field?.select()
    }
  }, [])

  // Neither of these depends on what is being typed into the name field.
  const head = useMemo(
    () => (
      <div class="sheet-head">
        <h2>{t('share.title')}</h2>
        <button class="quiet icon-only" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="close" />
        </button>
      </div>
    ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [onClose, locale],
  )

  const actions = useMemo(
    () => (
      <div class="row share-actions">
        <button class="primary" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? t('share.copied') : t('share.copy')}
        </button>
        {editUrl ? (
          <a class="muted" href={editUrl} target="_blank" rel="noreferrer">
            {t('share.openSheet')}
          </a>
        ) : null}
      </div>
    ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [copied, editUrl, copy, locale],
  )

  return (
    <div
      class="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="sheet" role="dialog" aria-modal="true" aria-label={t('share.title')}>
        {head}

        <div class="field-group">
            {deckRef.kind === 'sheet' ? (
              <label>
                <span class="label-text">{t('share.nameLabel')}</span>
                <input
                  type="text"
                  name="share-name"
                  value={title}
                  placeholder={t('share.namePlaceholder')}
                  onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                />
              </label>
            ) : null}

            <label>
              <span class="label-text">URL</span>
              <input id="share-link" name="share-link" type="text" readOnly value={link} />
            </label>

          {actions}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'preact/hooks'
import { sheetEditUrl, shareUrl } from '../core/deck'
import type { DeckRef } from '../core/types'
import { t } from '../i18n'
import { useEscapeToClose } from './CardModal'
import { Icon } from './Icon'

interface Props {
  deckRef: DeckRef
  onClose: () => void
}

/**
 * The user names the deck here and gets a link back. They never see `?s=` or
 * `&g=` — the URL format is an implementation detail, and asking someone to
 * assemble query parameters by hand is the opposite of no learning curve.
 */
export function ShareSheet({ deckRef, onClose }: Props) {
  useEscapeToClose(onClose)

  const [title, setTitle] = useState(deckRef.kind === 'sheet' ? (deckRef.title ?? '') : '')
  const [copied, setCopied] = useState(false)

  const named: DeckRef =
    deckRef.kind === 'sheet' ? { ...deckRef, title: title.trim() || undefined } : deckRef
  const link = shareUrl(named)
  const editUrl = sheetEditUrl(deckRef)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; selecting the text still works.
      const field = document.getElementById('share-link') as HTMLInputElement | null
      field?.select()
    }
  }

  return (
    <div
      class="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="sheet" role="dialog" aria-modal="true" aria-label={t('share.title')}>
        <div class="sheet-head">
          <h2>{t('share.title')}</h2>
          <button class="quiet icon-only" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>

        <div class="field-group">
            {deckRef.kind === 'sheet' ? (
              <label>
                <span class="label-text">{t('share.nameLabel')}</span>
                <input
                  type="text"
                  value={title}
                  placeholder={t('share.namePlaceholder')}
                  onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                />
              </label>
            ) : null}

            <label>
              <span class="label-text">URL</span>
              <input id="share-link" type="text" readOnly value={link} />
            </label>

          <div class="row">
            <button class="primary" onClick={() => void copy()}>
              <Icon name={copied ? 'check' : 'share'} />
              {copied ? t('share.copied') : t('share.copy')}
            </button>
            {editUrl ? (
              <a class="muted" href={editUrl} target="_blank" rel="noreferrer">
                {t('share.openSheet')}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

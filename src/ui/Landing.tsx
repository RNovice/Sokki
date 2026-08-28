import { useState } from 'preact/hooks'
import { BUILTIN_DECKS, parseSheetInput } from '../core/deck'
import type { DeckRef } from '../core/types'
import { t, tp } from '../i18n'
import { CardModal } from './CardModal'
import { Icon } from './Icon'

interface Props {
  onOpen: (ref: DeckRef) => void
}

type Panel = 'none' | 'examples' | 'howto'

/**
 * Four things, and nothing that expands in place: what this is, where to paste
 * a link, and two rows that open. Both rows are shaped exactly like the sample
 * decks they lead to — label, detail, chevron — so what can be opened is
 * legible before anything is read.
 */
export function Landing({ onOpen }: Props) {
  const [input, setInput] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('none')

  function submit() {
    const ref = parseSheetInput(input)
    if (!ref) {
      setProblem(t('landing.invalidUrl'))
      return
    }
    setProblem(null)
    onOpen(ref)
  }

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

      <div class="row-list">
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
            <li>{t('landing.howtoNoHeader')}</li>
            <li>{t('landing.howtoShare')}</li>
          </ol>
          <p class="muted">{t('landing.howtoPublic')}</p>
        </CardModal>
      ) : null}
    </div>
  )
}

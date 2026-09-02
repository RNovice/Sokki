import { t, tp } from '../i18n'
import { facesFor, questionSide } from '../core/session'
import type { Card, Session } from '../core/types'
import { CardText } from './CardText'

interface Props {
  session: Session
  cards: Card[]
  markdown: boolean
  onRetryWrong: () => void
  onRestart: () => void
  onBackToDeck: () => void
}

/**
 * The end of a round is also the only decision point: retry what was missed, or
 * start over. Nothing loops automatically — being forced back into the cards you
 * just failed, without being asked, is how a drill starts to feel like a
 * punishment.
 */
export function Result({ session, cards, markdown, onRetryWrong, onRestart, onBackToDeck }: Props) {
  const total = session.order.length
  const missed = session.wrong

  return (
    <div class="page">
      <div class="panel">
        <span class="section-label">{t('result.done')}</span>
        <span class="score">
          {missed.length === 0
            ? t('result.perfect')
            : t('result.firstTry', { correct: session.firstTryCorrect, total })}
        </span>
        <p class="muted">{t('result.ephemeralNote')}</p>
      </div>

      {missed.length > 0 ? (
        <>
          <h2>{tp('result.wrongTitle', missed.length)}</h2>
          <div class="wrong-list">
            {missed.map((cardIndex, i) => {
              const card = cards[cardIndex]
              if (!card) return null
              const side = questionSide(session, session.order.indexOf(cardIndex))
              const { question, answer } = facesFor(card, side)
              return (
                <div class="item" key={`${cardIndex}-${i}`}>
                  <CardText class="a" text={question} markdown={markdown} />
                  <CardText class="b" text={answer} markdown={markdown} />
                </div>
              )
            })}
          </div>
        </>
      ) : null}

      <div class="row">
        {missed.length > 0 ? (
          <button class="primary" onClick={onRetryWrong}>
            {t('result.retryWrong')}
          </button>
        ) : null}
        <button class={missed.length > 0 ? '' : 'primary'} onClick={onRestart}>
          {t('result.restart')}
        </button>
        {/* Back to the deck, not to the home page: somebody who arrived from a
            shared link has never seen the home page, and sending them there
            shows them a form for pasting a link they already have. */}
        <button class="quiet" onClick={onBackToDeck}>
          {t('result.backToDeck')}
        </button>
      </div>
    </div>
  )
}
